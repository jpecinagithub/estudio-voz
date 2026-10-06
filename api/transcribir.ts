/**
 * POST /api/transcribir — Transcribe audio a texto en español con Groq.
 *
 * Dos rutas:
 *  A) multipart/form-data con campo "audio" (archivos ≤ 4 MB).
 *  B) JSON { blobUrl } (archivos grandes subidos antes a Vercel Blob;
 *     Groq descarga la URL directamente, la Function no toca los bytes).
 *
 * La GROQ_API_KEY vive solo en el servidor. Nunca llega al navegador.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Busboy from 'busboy';

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODELO = 'whisper-large-v3-turbo';
/** Margen bajo el límite de 4,5 MB de Vercel (el multipart añade overhead). */
const MAX_BYTES_DIRECTO = 4_000_000;

const TIPOS_PERMITIDOS = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
  'video/mp4',
  'video/webm',
]);

interface ArchivoSubido {
  buffer: Buffer;
  nombre: string;
  tipo: string;
}

function leerMultipart(req: VercelRequest): Promise<ArchivoSubido | null> {
  return new Promise((resolve, reject) => {
    const bb = Busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: MAX_BYTES_DIRECTO },
    });
    const trozos: Buffer[] = [];
    let archivo: ArchivoSubido | null = null;
    let info = { nombre: 'audio', tipo: 'application/octet-stream' };

    bb.on('file', (_campo, flujo, fileInfo) => {
      info = {
        nombre: (fileInfo.filename || 'audio').slice(0, 100),
        tipo: fileInfo.mimeType || 'application/octet-stream',
      };
      flujo.on('data', (d: Buffer) => trozos.push(d));
      flujo.on('limit', () => {
        const e = new Error('PAYLOAD_TOO_LARGE') as Error & { status?: number };
        e.status = 413;
        reject(e);
      });
      flujo.on('end', () => {
        archivo = { buffer: Buffer.concat(trozos), ...info };
      });
    });
    bb.on('error', reject);
    bb.on('close', () => resolve(archivo));
    req.pipe(bb);
  });
}

function leerJson(req: VercelRequest): Record<string, unknown> {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (req.body as Record<string, unknown>) ?? {};
}

async function llamarGroq(clave: string, form: FormData): Promise<Response> {
  // Un reintento con espera ante errores 5xx intermitentes de Groq.
  let ultimo: Response | null = null;
  for (let intento = 0; intento < 2; intento++) {
    if (intento > 0) await new Promise((r) => setTimeout(r, 1200 * intento));
    ultimo = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}` },
      body: form,
    });
    if (ultimo.status < 500 || ultimo.status === 501) break;
  }
  return ultimo as Response;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ codigo: 'metodo-no-permitido', error: 'Método no permitido.' });
  }

  const clave = process.env.GROQ_API_KEY;
  if (!clave) {
    return res.status(503).json({
      codigo: 'groq-sin-configurar',
      error: 'El servicio de transcripción no está configurado. Inténtalo más tarde.',
    });
  }

  try {
    const form = new FormData();
    form.append('model', MODELO);
    form.append('language', 'es');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    form.append('temperature', '0');

    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
      const archivo = await leerMultipart(req);
      if (!archivo) {
        return res.status(400).json({
          codigo: 'archivo-requerido',
          error: 'No se recibió ningún archivo de audio.',
        });
      }
      if (!TIPOS_PERMITIDOS.has(archivo.tipo.toLowerCase())) {
        return res.status(400).json({
          codigo: 'archivo-no-compatible',
          error: 'Este archivo no es un audio compatible. Prueba con MP3, WAV, M4A, OGG o WEBM.',
        });
      }
      form.append(
        'file',
        new Blob([new Uint8Array(archivo.buffer)], { type: archivo.tipo }),
        archivo.nombre,
      );
    } else {
      const body = leerJson(req);
      const blobUrl = body.blobUrl;
      if (typeof blobUrl !== 'string' || !blobUrl.startsWith('https://')) {
        return res.status(400).json({
          codigo: 'archivo-requerido',
          error: 'Falta la URL del archivo de audio.',
        });
      }
      form.append('url', blobUrl);
    }

    const groqRes = await llamarGroq(clave, form);

    if (groqRes.status === 429) {
      return res.status(429).json({
        codigo: 'groq-saturado',
        error: 'El servicio de transcripción está saturado. Espera unos segundos y pulsa Reintentar.',
      });
    }
    if (groqRes.status === 400) {
      return res.status(400).json({
        codigo: 'archivo-no-compatible',
        error: 'El servicio no ha podido leer este audio. Prueba con otro formato.',
      });
    }
    if (!groqRes.ok) {
      const detalle = await groqRes.text().catch(() => '');
      console.error('[transcribir] Groq', groqRes.status, detalle.slice(0, 400));
      return res.status(502).json({
        codigo: 'groq-fallo',
        error: 'El servicio de transcripción no está disponible ahora mismo. Pulsa Reintentar.',
      });
    }

    const datos = (await groqRes.json()) as {
      text?: string;
      duration?: number;
      segments?: { start: number; end: number; text: string }[];
    };

    return res.status(200).json({
      texto: (datos.text || '').trim(),
      segmentos: (datos.segments || []).map((s) => ({
        inicio: s.start,
        fin: s.end,
        texto: (s.text || '').trim(),
      })),
      duracionSeg: datos.duration || 0,
    });
  } catch (error) {
    const e = error as { status?: number; message?: string };
    if (e?.status === 413 || e?.message === 'PAYLOAD_TOO_LARGE') {
      return res.status(413).json({
        codigo: 'archivo-demasiado-grande',
        error: 'El archivo es demasiado grande para este método de subida. Vamos a utilizar la carga optimizada.',
      });
    }
    console.error('[transcribir] inesperado', error);
    return res.status(500).json({
      codigo: 'groq-fallo',
      error: 'Ocurrió un error inesperado al transcribir. Pulsa Reintentar.',
    });
  }
}
