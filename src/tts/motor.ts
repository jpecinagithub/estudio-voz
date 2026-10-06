/**
 * Motor de texto a voz: Piper es_ES (VITS) ejecutado con sherpa-onnx WASM
 * en un Web Worker clásico.
 *
 * Las cuatro voces son modelos reales en español, descargados bajo demanda
 * y cacheados en el navegador:
 *   Lucía  → es_ES-mls_10246-low (femenina)
 *   Elena  → es_ES-mls_9972-low  (femenina)
 *   Mateo  → es_ES-davefx-medium (masculina)
 *   Javier → es_ES-sharvard-medium (masculina)
 */
import type { Voz } from '../config';
import { ErrorApp } from '../tipos';

export type IdVoz = Voz['id'];

export interface EstadoModeloVoz {
  estado: 'no-cargado' | 'descargando' | 'listo' | 'error';
  /** 0..100 mientras se descarga el modelo. */
  porcentaje: number | null;
  /** Tamaño aproximado del modelo, p. ej. "82 MB". */
  tamanoAproximado?: string;
  /** Detalle en español para mostrar durante la descarga. */
  detalle?: string;
}

export type AlProgresarModelo = (estado: EstadoModeloVoz) => void;
export type AlProgresarSintesis = (porcentaje: number, detalle: string) => void;

/** Tamaños aproximados para informar antes de descargar. */
const TAMANOS: Record<IdVoz, string> = {
  lucia: '60 MB',
  elena: '60 MB',
  mateo: '60 MB',
  javier: '73 MB',
};

interface PeticionPendiente {
  resolver: (valor: unknown) => void;
  rechazar: (error: unknown) => void;
  alProgresar?: AlProgresarModelo | AlProgresarSintesis;
  esPreparacion: boolean;
  vozId: IdVoz;
}

let worker: Worker | null = null;
let workerListo = false;
let idPeticion = 0;
const pendientes = new Map<number, PeticionPendiente>();
const estados = new Map<IdVoz, EstadoModeloVoz>();
let contextoAudio: AudioContext | null = null;

function urlWorker(): string {
  return `${import.meta.env.BASE_URL}tts/tts.worker.js`;
}

/** Tiempo máximo para que el worker anuncie que está listo (carga del WASM). */
const TIEMPO_MAXIMO_ARRANQUE_MS = 90000;
let temporizadorArranque: ReturnType<typeof setTimeout> | null = null;

function limpiarTemporizadorArranque(): void {
  if (temporizadorArranque) {
    clearTimeout(temporizadorArranque);
    temporizadorArranque = null;
  }
}

function asegurarWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(urlWorker());
  w.onmessage = alMensaje;
  w.onerror = () => {
    limpiarTemporizadorArranque();
    if (worker === w) worker = null;
    workerListo = false;
    const error = new ErrorApp(
      'modelo-tts-fallo',
      'El motor de voz no se ha podido iniciar en este navegador.',
    );
    for (const [, p] of pendientes) p.rechazar(error);
    pendientes.clear();
  };
  // Mensaje inicial: el worker carga el WASM y avisa con { tipo: 'listo' }.
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const peticionArranque: PeticionPendiente = {
    resolver: () => {
      limpiarTemporizadorArranque();
      workerListo = true;
    },
    rechazar: () => {
      limpiarTemporizadorArranque();
      workerListo = false;
    },
    esPreparacion: true,
    vozId: 'lucia',
  };
  pendientes.set(0, peticionArranque);
  // Si el worker no responde a tiempo (p. ej. WASM bloqueado en la red),
  // se aborta con un error reintentable en lugar de quedarse colgado.
  temporizadorArranque = setTimeout(() => {
    temporizadorArranque = null;
    const p = pendientes.get(0);
    if (p && worker === w) {
      pendientes.delete(0);
      try {
        w.terminate();
      } catch {
        /* ignorar */
      }
      worker = null;
      workerListo = false;
      p.rechazar(
        new ErrorApp(
          'modelo-tts-fallo',
          'El motor de voz está tardando demasiado en arrancar. Comprueba tu conexión y pulsa Reintentar.',
        ),
      );
    }
  }, TIEMPO_MAXIMO_ARRANQUE_MS);
  w.postMessage({ tipo: 'iniciar', baseUrl: base });
  worker = w;
  return w;
}

/** Avisa al worker de que una petición se abandona para que libere el trabajo en curso. */
function avisarCancelacionWorker(peticionId: number): void {
  try {
    worker?.postMessage({ tipo: 'cancelar', peticionId });
  } catch {
    /* el worker puede estar ya terminado */
  }
}

function alMensaje(evento: MessageEvent): void {  const msg = evento.data as {
    tipo: string;
    peticionId?: number;
    vozId?: IdVoz;
    fase?: string;
    porcentaje?: number;
    detalle?: string;
    muestras?: Float32Array;
    frecuenciaMuestreo?: number;
    mensaje?: string;
  };
  if (msg.tipo === 'listo') {
    const p = pendientes.get(0);
    pendientes.delete(0);
    p?.resolver(undefined);
    return;
  }
  const id = msg.peticionId ?? -1;
  const p = pendientes.get(id);
  if (!p) return;

  if (msg.tipo === 'progreso') {
    const porcentaje = typeof msg.porcentaje === 'number' ? msg.porcentaje : null;
    if (p.esPreparacion && p.alProgresar) {
      (p.alProgresar as AlProgresarModelo)({
        estado: 'descargando',
        porcentaje,
        tamanoAproximado: TAMANOS[p.vozId],
        detalle: msg.detalle,
      });
      estados.set(p.vozId, {
        estado: 'descargando',
        porcentaje,
        tamanoAproximado: TAMANOS[p.vozId],
        detalle: msg.detalle,
      });
    } else if (!p.esPreparacion && p.alProgresar) {
      (p.alProgresar as AlProgresarSintesis)(porcentaje ?? 0, msg.detalle ?? '');
    }
    return;
  }
  pendientes.delete(id);
  if (msg.tipo === 'preparada') {
    estados.set(p.vozId, { estado: 'listo', porcentaje: 100, tamanoAproximado: TAMANOS[p.vozId] });
    p.resolver(undefined);
  } else if (msg.tipo === 'resultado') {
    estados.set(p.vozId, { estado: 'listo', porcentaje: 100, tamanoAproximado: TAMANOS[p.vozId] });
    p.resolver({ muestras: msg.muestras, frecuenciaMuestreo: msg.frecuenciaMuestreo });
  } else if (msg.tipo === 'error') {
    estados.set(p.vozId, { estado: 'error', porcentaje: null, tamanoAproximado: TAMANOS[p.vozId] });
    p.rechazar(new ErrorApp('modelo-tts-fallo', msg.mensaje ?? 'La síntesis de voz ha fallado.'));
  }
}

async function esperarWorkerListo(): Promise<void> {
  asegurarWorker();
  if (workerListo) return;
  await new Promise<void>((resolver, rechazar) => {
    const p = pendientes.get(0);
    if (!p) {
      resolver();
      return;
    }
    const originalResolver = p.resolver;
    const originalRechazar = p.rechazar;
    p.resolver = (v: unknown) => {
      originalResolver(v);
      resolver();
    };
    p.rechazar = (e: unknown) => {
      originalRechazar(e);
      rechazar(e);
    };
  });
}

/**
 * Descarga (la primera vez) y prepara el modelo de la voz.
 * Muestra el progreso para no dejar la interfaz bloqueada.
 */
export async function prepararVoz(
  id: IdVoz,
  alProgresar: AlProgresarModelo,
  senal?: AbortSignal,
): Promise<void> {
  if (estados.get(id)?.estado === 'listo') {
    alProgresar({ estado: 'listo', porcentaje: 100, tamanoAproximado: TAMANOS[id] });
    return;
  }
  await esperarWorkerListo();
  if (senal?.aborted) throw new DOMException('Cancelado', 'AbortError');
  const peticionId = ++idPeticion;
  estados.set(id, { estado: 'descargando', porcentaje: 0, tamanoAproximado: TAMANOS[id] });
  alProgresar({ estado: 'descargando', porcentaje: 0, tamanoAproximado: TAMANOS[id] });
  await new Promise<void>((resolver, rechazar) => {
    pendientes.set(peticionId, {
      resolver: () => resolver(),
      rechazar,
      alProgresar,
      esPreparacion: true,
      vozId: id,
    });
    const alAbortar = () => {
      pendientes.delete(peticionId);
      avisarCancelacionWorker(peticionId);
      estados.set(id, { estado: 'no-cargado', porcentaje: null, tamanoAproximado: TAMANOS[id] });
      rechazar(new DOMException('Cancelado', 'AbortError'));
    };
    if (senal) {
      if (senal.aborted) {
        alAbortar();
        return;
      }
      senal.addEventListener('abort', alAbortar, { once: true });
    }
    worker?.postMessage({ tipo: 'preparar', peticionId, vozId: id });
  });
}

/** Estado actual del modelo sin iniciar descargas. */
export function estadoVoz(id: IdVoz): EstadoModeloVoz {
  return (
    estados.get(id) ?? { estado: 'no-cargado', porcentaje: null, tamanoAproximado: TAMANOS[id] }
  );
}

/** ¿Hay alguna voz lista para sintetizar? */
export function hayVozLista(): boolean {
  for (const e of estados.values()) {
    if (e.estado === 'listo') return true;
  }
  return false;
}

/**
 * Convierte texto en voz. Requiere haber llamado a prepararVoz antes.
 * @param velocidad 0.5..2 (1 = normal)
 */
export async function sintetizarVoz(
  texto: string,
  id: IdVoz,
  velocidad = 1,
  alProgresar?: AlProgresarSintesis,
  senal?: AbortSignal,
): Promise<AudioBuffer> {
  await esperarWorkerListo();
  // Si la voz no está preparada, se prepara sin informe de progreso.
  if (estados.get(id)?.estado !== 'listo') {
    await prepararVoz(id, () => undefined, senal);
  }
  if (senal?.aborted) throw new DOMException('Cancelado', 'AbortError');
  const peticionId = ++idPeticion;
  const resultado = await new Promise<{ muestras: Float32Array; frecuenciaMuestreo: number }>(
    (resolver, rechazar) => {
      pendientes.set(peticionId, {
        resolver: (v) => resolver(v as { muestras: Float32Array; frecuenciaMuestreo: number }),
        rechazar,
        alProgresar,
        esPreparacion: false,
        vozId: id,
      });
      const alAbortar = () => {
        pendientes.delete(peticionId);
        avisarCancelacionWorker(peticionId);
        // El WASM es monohilo y bloqueante: la forma segura de cancelar
        // es reiniciar el worker y marcar las voces como no cargadas.
        liberarVoces();
        rechazar(new DOMException('Cancelado', 'AbortError'));
      };
      if (senal) {
        if (senal.aborted) {
          alAbortar();
          return;
        }
        senal.addEventListener('abort', alAbortar, { once: true });
      }
      worker?.postMessage({ tipo: 'sintetizar', peticionId, vozId: id, texto, velocidad });
    },
  );
  if (!contextoAudio) {
    contextoAudio = new AudioContext();
  }
  const buffer = contextoAudio.createBuffer(
    1,
    resultado.muestras.length,
    resultado.frecuenciaMuestreo,
  );
  buffer.getChannelData(0).set(resultado.muestras);
  return buffer;
}

/** Libera la memoria de los modelos (p. ej. desde Ajustes). */
export function liberarVoces(): void {
  limpiarTemporizadorArranque();
  for (const [, p] of pendientes) {
    if (p.esPreparacion) {
      p.rechazar(new DOMException('Cancelado', 'AbortError'));
    }
  }
  pendientes.clear();
  estados.clear();
  if (worker) {
    worker.terminate();
    worker = null;
  }
  workerListo = false;
  if (contextoAudio) {
    void contextoAudio.close().catch(() => undefined);
    contextoAudio = null;
  }
}
