/**
 * Exportación de audio en el navegador.
 * - WAV: codificación manual directa.
 * - MP3 / OGG: Web Worker con wasm-media-encoders (WASM, sin red).
 * - M4A: Web Worker con ffmpeg.wasm (AAC), cargado bajo demanda.
 */
import type { CalidadExportacion } from '../config';
import { ErrorApp, type FormatoExportacion } from '../tipos';
import { remuestrear } from '../audio/motor';
import { canalesAWav } from './wav';

export type AlProgresarExportacion = (fase: string, porcentaje: number | null) => void;

/** Formatos que el navegador puede generar de verdad. */
export function obtenerFormatosDisponibles(): FormatoExportacion[] {
  return ['mp3', 'wav', 'ogg', 'm4a'];
}

function extraerCanales(buffer: AudioBuffer): Float32Array[] {
  const n = Math.min(2, buffer.numberOfChannels);
  const out: Float32Array[] = [];
  for (let c = 0; c < n; c++) out.push(buffer.getChannelData(c).slice());
  return out;
}

let contador = 0;

function exportarEnWorker(
  buffer: AudioBuffer,
  formato: FormatoExportacion,
  calidad: CalidadExportacion,
  alProgresar?: AlProgresarExportacion,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('../workers/exportar.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      reject(
        new ErrorApp(
          'conversion-fallo',
          'No se ha podido iniciar el conversor de audio.',
        ),
      );
      return;
    }
    const id = ++contador;
    const limpiar = () => worker.terminate();

    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as {
        id: number;
        tipo: 'fase' | 'progreso' | 'hecho' | 'error';
        fase?: string;
        porcentaje?: number;
        datos?: ArrayBuffer;
        mime?: string;
      };
      if (msg.id !== id) return;
      if (msg.tipo === 'fase') {
        alProgresar?.(msg.fase ?? 'Codificando audio…', null);
      } else if (msg.tipo === 'progreso') {
        alProgresar?.('Codificando audio…', msg.porcentaje ?? null);
      } else if (msg.tipo === 'hecho' && msg.datos) {
        limpiar();
        resolve(new Blob([msg.datos], { type: msg.mime || 'application/octet-stream' }));
      } else if (msg.tipo === 'error') {
        limpiar();
        reject(
          new ErrorApp(
            'conversion-fallo',
            'No se ha podido convertir el audio a este formato. Prueba con otro formato.',
          ),
        );
      }
    };
    worker.onerror = () => {
      limpiar();
      reject(
        new ErrorApp(
          'conversion-fallo',
          'No se ha podido convertir el audio a este formato. Prueba con otro formato.',
        ),
      );
    };

    const canales = extraerCanales(buffer);
    alProgresar?.('Preparando tu audio…', 0);
    worker.postMessage(
      { id, formato, calidad, sampleRate: buffer.sampleRate, canales },
      canales.map((c) => c.buffer),
    );
  });
}

/**
 * Exporta un AudioBuffer al formato y calidad elegidos.
 */
export async function exportarAudio(
  buffer: AudioBuffer,
  formato: FormatoExportacion,
  calidad: CalidadExportacion,
  alProgresar?: AlProgresarExportacion,
): Promise<Blob> {
  if (formato === 'wav') {
    alProgresar?.('Preparando tu audio…', null);
    // En WAV la "calidad" se refleja en la frecuencia de muestreo.
    const destino = calidad === 'ligera' ? 22050 : calidad === 'alta' ? 48000 : 44100;
    const b = buffer.sampleRate === destino ? buffer : await remuestrear(buffer, destino);
    return canalesAWav(extraerCanales(b), destino);
  }
  return exportarEnWorker(buffer, formato, calidad, alProgresar);
}

/** Nombre de archivo sugerido: base + formato. */
export function nombreArchivoExportacion(base: string, formato: FormatoExportacion): string {
  const limpio = base
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${limpio || 'audio'}.${formato}`;
}
