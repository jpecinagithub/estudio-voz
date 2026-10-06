/**
 * Worker de exportación de audio.
 * Recibe los canales (Float32Array transferidos), codifica y devuelve un ArrayBuffer.
 * - MP3 / OGG: wasm-media-encoders (WASM, sin red).
 * - M4A: ffmpeg.wasm con codificador AAC, cargado bajo demanda.
 */
import { canalesAWav } from '../exportar/wav';

type FormatoWorker = 'mp3' | 'ogg' | 'm4a';
type CalidadWorker = 'ligera' | 'estandar' | 'alta';

interface Peticion {
  id: number;
  formato: FormatoWorker;
  calidad: CalidadWorker;
  sampleRate: number;
  canales: Float32Array[];
}

const BITRATE_MP3 = { ligera: 64, estandar: 128, alta: 192 } as const;
const VBR_OGG = { ligera: 0, estandar: 3.0, alta: 5.0 } as const;
const BITRATE_AAC = { ligera: '64k', estandar: '128k', alta: '192k' } as const;

const auto = self as unknown as {
  onmessage: ((e: MessageEvent<Peticion>) => void) | null;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
};

async function codificarMp3Ogg(p: Peticion): Promise<{ datos: ArrayBuffer; mime: string }> {
  const { createMp3Encoder, createOggEncoder } = await import('wasm-media-encoders');
  const encoder = p.formato === 'mp3' ? await createMp3Encoder() : await createOggEncoder();
  const numCanales = (p.canales.length > 1 ? 2 : 1) as 1 | 2;
  const canales = p.canales.slice(0, numCanales);
  if (p.formato === 'mp3') {
    encoder.configure({
      channels: numCanales,
      sampleRate: p.sampleRate,
      bitrate: BITRATE_MP3[p.calidad],
    });
  } else {
    encoder.configure({
      channels: numCanales,
      sampleRate: p.sampleRate,
      vbrQuality: VBR_OGG[p.calidad],
    });
  }
  const partes: Uint8Array[] = [];
  const BLOQUE = 115200;
  const total = canales[0].length;
  for (let i = 0; i < total; i += BLOQUE) {
    const trozo = canales.map((c) => c.slice(i, i + BLOQUE));
    const out = encoder.encode(trozo);
    // El buffer devuelto pertenece al encoder: hay que copiarlo.
    if (out.length > 0) partes.push(out.slice());
    auto.postMessage({
      id: p.id,
      tipo: 'progreso',
      porcentaje: Math.round((Math.min(i + BLOQUE, total) / total) * 100),
    });
  }
  const fin = encoder.finalize();
  if (fin.length > 0) partes.push(fin.slice());
  const blob = new Blob(partes as BlobPart[], {
    type: p.formato === 'mp3' ? 'audio/mpeg' : 'audio/ogg',
  });
  return { datos: await blob.arrayBuffer(), mime: blob.type };
}

async function codificarM4a(p: Peticion): Promise<{ datos: ArrayBuffer; mime: string }> {
  auto.postMessage({ id: p.id, tipo: 'fase', fase: 'Preparando el conversor por primera vez…' });
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
  const ffmpeg = new FFmpeg();
  ffmpeg.on('progress', ({ progress }: { progress: number }) => {
    auto.postMessage({ id: p.id, tipo: 'progreso', porcentaje: Math.round(progress * 100) });
  });
  const base = '/ffmpeg';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  auto.postMessage({ id: p.id, tipo: 'fase', fase: 'Convirtiendo a M4A…' });
  const wav = canalesAWav(p.canales.slice(0, 2), p.sampleRate);
  await ffmpeg.writeFile('entrada.wav', await fetchFile(wav));
  await ffmpeg.exec([
    '-i',
    'entrada.wav',
    '-vn',
    '-c:a',
    'aac',
    '-b:a',
    BITRATE_AAC[p.calidad],
    '-ar',
    '44100',
    '-movflags',
    '+faststart',
    'salida.m4a',
  ]);
  const datos = (await ffmpeg.readFile('salida.m4a')) as Uint8Array;
  await ffmpeg.deleteFile('entrada.wav').catch(() => undefined);
  await ffmpeg.deleteFile('salida.m4a').catch(() => undefined);
  ffmpeg.terminate();
  const copia = datos.slice().buffer as ArrayBuffer;
  return { datos: copia, mime: 'audio/mp4' };
}

auto.onmessage = async (e: MessageEvent<Peticion>) => {
  const p = e.data;
  try {
    auto.postMessage({ id: p.id, tipo: 'fase', fase: 'Codificando audio…' });
    const { datos, mime } =
      p.formato === 'm4a' ? await codificarM4a(p) : await codificarMp3Ogg(p);
    auto.postMessage({ id: p.id, tipo: 'hecho', datos, mime }, [datos]);
  } catch (error) {
    auto.postMessage({
      id: p.id,
      tipo: 'error',
      mensaje: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
};
