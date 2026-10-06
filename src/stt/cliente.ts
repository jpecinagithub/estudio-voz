/**
 * Cliente de transcripción (audio → texto en español con Groq).
 *
 * Estrategia según el tamaño:
 *  - ≤ 4 MB: envío directo a /api/transcribir (multipart).
 *  - > 4 MB (hasta 25 MB): subida optimizada directa a Vercel Blob y la
 *    Function ordena la transcripción pasando la URL a Groq; el blob
 *    temporal se elimina después.
 *
 * La GROQ_API_KEY nunca llega al navegador: vive en las Functions.
 */
import { upload } from '@vercel/blob/client';
import { TAMANO_MAXIMO_SUBIDA_DIRECTA, TAMANO_MAXIMO_TRANSCRIPCION } from '../config';
import { ErrorApp, type ResultadoTranscripcion, type SegmentoTranscripcion } from '../tipos';
import { esFalloDeRed } from '../utils/errores';

export interface OpcionesTranscripcion {
  alProgresar?: (fase: string, porcentaje: number | null) => void;
  senal?: AbortSignal;
}

const CODIGOS_CONOCIDOS = new Set([
  'groq-sin-configurar',
  'groq-saturado',
  'groq-fallo',
  'archivo-no-compatible',
  'archivo-demasiado-grande',
  'archivo-supera-limite',
  'archivo-requerido',
  'blob-no-configurado',
  'blob-fallo',
]);

function errorDeRespuesta(datos: unknown, porDefecto: string): ErrorApp {
  const d = (datos as { codigo?: unknown; error?: unknown }) ?? {};
  const codigo = typeof d.codigo === 'string' && CODIGOS_CONOCIDOS.has(d.codigo) ? d.codigo : 'groq-fallo';
  const mensaje = typeof d.error === 'string' && d.error ? d.error : porDefecto;
  return new ErrorApp(codigo, mensaje);
}

async function leerJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function aResultado(datos: unknown): ResultadoTranscripcion {
  const d = (datos as {
    texto?: unknown;
    segmentos?: unknown;
    duracionSeg?: unknown;
  }) ?? {};
  const segmentos: SegmentoTranscripcion[] = Array.isArray(d.segmentos)
    ? d.segmentos
        .filter(
          (s): s is { inicio: number; fin: number; texto: string } =>
            typeof s === 'object' &&
            s !== null &&
            Number.isFinite((s as { inicio: number }).inicio),
        )
        .map((s) => ({
          inicio: Math.max(0, s.inicio),
          fin: Math.max(s.inicio, s.fin),
          texto: String(s.texto || ''),
        }))
    : [];
  return {
    texto: typeof d.texto === 'string' ? d.texto : '',
    segmentos,
    duracionSeg: Number.isFinite(d.duracionSeg) ? (d.duracionSeg as number) : 0,
  };
}

function nombreSeguro(nombre: string): string {
  const base = nombre.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || 'audio';
  return `${Date.now()}-${base}`;
}

/** Subida directa navegador → Blob con token temporal del servidor. */
async function subirTemporal(
  audio: Blob,
  nombre: string,
  alProgresar: (porcentaje: number | null) => void,
): Promise<string> {
  // `upload()` pide el token a /api/blob/token (handleUploadUrl) y sube
  // directamente del navegador a Blob, sin pasar por la Function.
  const blob = await upload(nombreSeguro(nombre), audio, {
    access: 'public',
    handleUploadUrl: '/api/blob/token',
    clientPayload: JSON.stringify({
      contentType: audio.type || 'application/octet-stream',
      size: audio.size,
    }),
    onUploadProgress: ({ loaded, total }) => {
      alProgresar(total > 0 ? Math.round((loaded / total) * 100) : null);
    },
  });
  return blob.url;
}

/** Transcribe un audio a texto en español. */
export async function transcribirAudio(
  audio: Blob,
  nombreArchivo: string,
  opciones: OpcionesTranscripcion = {},
): Promise<ResultadoTranscripcion> {
  const { alProgresar, senal } = opciones;

  if (!audio || audio.size === 0) {
    throw new ErrorApp(
      'archivo-no-compatible',
      'No se ha recibido ningún audio para transcribir.',
    );
  }
  if (audio.size > TAMANO_MAXIMO_TRANSCRIPCION) {
    throw new ErrorApp(
      'archivo-supera-limite',
      'El archivo supera el tamaño máximo de 25 MB para la transcripción.',
    );
  }

  try {
    if (audio.size <= TAMANO_MAXIMO_SUBIDA_DIRECTA) {
      alProgresar?.('Transcribiendo audio…', null);
      const form = new FormData();
      form.append('audio', audio, nombreArchivo || 'audio');
      let res: Response;
      try {
        res = await fetch('/api/transcribir', { method: 'POST', body: form, signal: senal });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new ErrorApp('operacion-cancelada', 'La transcripción se ha cancelado.');
        }
        throw error;
      }
      const datos = await leerJson(res);
      if (!res.ok) throw errorDeRespuesta(datos, 'No se pudo transcribir el audio.');
      return aResultado(datos);
    }

    // ── Ruta optimizada para archivos grandes ──
    alProgresar?.('Preparando la carga optimizada…', 0);
    const url = await subirTemporal(audio, nombreArchivo || 'audio', (p) =>
      alProgresar?.('Subiendo audio…', p),
    );
    try {
      alProgresar?.('Transcribiendo audio…', null);
      const res = await fetch('/api/transcribir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blobUrl: url }),
        signal: senal,
      });
      const datos = await leerJson(res);
      if (!res.ok) throw errorDeRespuesta(datos, 'No se pudo transcribir el audio.');
      return { ...aResultado(datos), subidaTemporal: true };
    } finally {
      // El archivo temporal se elimina siempre, sin bloquear al usuario.
      fetch('/api/blob/borrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      }).catch(() => undefined);
    }
  } catch (error) {
    if (error instanceof ErrorApp) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ErrorApp('operacion-cancelada', 'La transcripción se ha cancelado.');
    }
    if (esFalloDeRed(error)) {
      throw new ErrorApp(
        'api-no-disponible',
        'No se puede contactar con el servicio de transcripción. Comprueba tu conexión.',
      );
    }
    throw error;
  }
}

/** ¿El servicio de transcripción parece alcanzable? */
export async function comprobarServicioTranscripcion(): Promise<boolean> {
  try {
    const res = await fetch('/api/transcribir', { method: 'POST', body: new FormData() });
    // Cualquier respuesta HTTP (incluso 4xx) indica que la API existe.
    return res.status !== 404;
  } catch {
    return false;
  }
}

/**
 * Mejora la puntuación y legibilidad de una transcripción (función opcional).
 * Si falla, el llamador debe permitir seguir editando el texto original.
 */
export async function mejorarPuntuacion(texto: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch('/api/mejorar-texto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto }),
    });
  } catch (error) {
    if (esFalloDeRed(error)) throw new ErrorApp('api-no-disponible', '');
    throw error;
  }
  const datos = await leerJson(res);
  if (!res.ok) throw errorDeRespuesta(datos, 'No se pudo mejorar el texto.');
  const corregido = (datos as { texto?: unknown }).texto;
  if (typeof corregido !== 'string' || !corregido.trim()) {
    throw new ErrorApp('groq-fallo', 'No se pudo mejorar el texto.');
  }
  return corregido;
}
