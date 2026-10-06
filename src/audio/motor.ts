/**
 * Motor de audio: operaciones sobre AudioBuffer con Web Audio API.
 * Todo el procesamiento ocurre localmente, en el dispositivo del usuario.
 */
import { ErrorApp } from '../tipos';
import { canalesAWav } from '../exportar/wav';

let contextoCompartido: AudioContext | null = null;

/** AudioContext compartido para reproducción y análisis. */
export function obtenerContextoAudio(): AudioContext {
  if (!contextoCompartido) {
    const Constructor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) {
      throw new ErrorApp(
        'navegador-incompatible',
        'Tu navegador no soporta las funciones de audio necesarias.',
      );
    }
    contextoCompartido = new Constructor();
  }
  if (contextoCompartido.state === 'suspended') {
    void contextoCompartido.resume();
  }
  return contextoCompartido;
}

/** Decodifica un archivo de audio (Blob o ArrayBuffer) a AudioBuffer. */
export async function decodificarAudio(fuente: Blob | ArrayBuffer): Promise<AudioBuffer> {
  const datos = fuente instanceof Blob ? await fuente.arrayBuffer() : fuente;
  // OfflineAudioContext permite decodificar sin depender del contexto audible.
  const temporal = new OfflineAudioContext(1, 1, 44100);
  try {
    return await temporal.decodeAudioData(datos.slice(0));
  } catch {
    throw new ErrorApp(
      'archivo-no-compatible',
      'No se ha podido leer el audio. Prueba con MP3, WAV, M4A, OGG o WEBM.',
    );
  }
}

/** Remuestrea un AudioBuffer a la frecuencia indicada. */
export async function remuestrear(
  buffer: AudioBuffer,
  frecuenciaMuestreo: number,
): Promise<AudioBuffer> {
  if (buffer.sampleRate === frecuenciaMuestreo) return buffer;
  const numMuestras = Math.max(1, Math.ceil(buffer.duration * frecuenciaMuestreo));
  const contexto = new OfflineAudioContext(buffer.numberOfChannels, numMuestras, frecuenciaMuestreo);
  const fuente = contexto.createBufferSource();
  fuente.buffer = buffer;
  fuente.connect(contexto.destination);
  fuente.start(0);
  return contexto.startRendering();
}

/** Convierte un AudioBuffer a WAV (PCM 16 bits). */
export function audioBufferAWav(buffer: AudioBuffer): Blob {
  const canales = Math.min(buffer.numberOfChannels, 2);
  const datos: Float32Array[] = [];
  for (let c = 0; c < canales; c++) datos.push(buffer.getChannelData(c));
  return canalesAWav(datos, buffer.sampleRate);
}

/** Recorta un AudioBuffer entre dos tiempos (segundos). */
export function recortarAudio(buffer: AudioBuffer, inicioSeg: number, finSeg: number): AudioBuffer {
  const inicio = Math.max(0, Math.floor(inicioSeg * buffer.sampleRate));
  const fin = Math.min(buffer.length, Math.ceil(finSeg * buffer.sampleRate));
  if (fin <= inicio) {
    throw new ErrorApp('edicion-invalida', 'El recorte seleccionado no es válido.');
  }
  const resultado = new AudioBuffer({
    length: fin - inicio,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    resultado.getChannelData(c).set(buffer.getChannelData(c).subarray(inicio, fin));
  }
  return resultado;
}

/** Aplica una ganancia (1 = sin cambios) devolviendo un buffer nuevo. */
export function aplicarGanancia(buffer: AudioBuffer, ganancia: number): AudioBuffer {
  const resultado = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const origen = buffer.getChannelData(c);
    const destino = resultado.getChannelData(c);
    for (let i = 0; i < origen.length; i++) destino[i] = origen[i] * ganancia;
  }
  return resultado;
}

/** Normaliza el pico máximo al valor indicado (0.89 por defecto). */
export function normalizarAudio(buffer: AudioBuffer, picoObjetivo = 0.89): AudioBuffer {
  let pico = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const datos = buffer.getChannelData(c);
    for (let i = 0; i < datos.length; i++) {
      const v = Math.abs(datos[i]);
      if (v > pico) pico = v;
    }
  }
  if (pico < 0.0001) return buffer;
  return aplicarGanancia(buffer, picoObjetivo / pico);
}

/** Aplica fundido de entrada y/o salida (segundos). */
export function aplicarFundido(
  buffer: AudioBuffer,
  fundidoEntradaSeg: number,
  fundidoSalidaSeg: number,
): AudioBuffer {
  const resultado = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });
  const muestrasEntrada = Math.floor(fundidoEntradaSeg * buffer.sampleRate);
  const muestrasSalida = Math.floor(fundidoSalidaSeg * buffer.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const origen = buffer.getChannelData(c);
    const destino = resultado.getChannelData(c);
    for (let i = 0; i < origen.length; i++) {
      let g = 1;
      if (i < muestrasEntrada && muestrasEntrada > 0) g = i / muestrasEntrada;
      const desdeFinal = origen.length - 1 - i;
      if (desdeFinal < muestrasSalida && muestrasSalida > 0) {
        g = Math.min(g, desdeFinal / muestrasSalida);
      }
      destino[i] = origen[i] * g;
    }
  }
  return resultado;
}

/** Calcula picos (0..1) para dibujar la forma de onda. */
export function calcularPicos(buffer: AudioBuffer, numPicos: number): Float32Array {
  const picos = new Float32Array(numPicos);
  const datos = buffer.getChannelData(0);
  const bloque = Math.max(1, Math.floor(datos.length / numPicos));
  for (let i = 0; i < numPicos; i++) {
    const inicio = i * bloque;
    const fin = Math.min(datos.length, inicio + bloque);
    let max = 0;
    for (let j = inicio; j < fin; j += 8) {
      const v = Math.abs(datos[j]);
      if (v > max) max = v;
    }
    picos[i] = max;
  }
  return picos;
}

/** Estima la duración de una locución en español (~900 caracteres por minuto). */
export function estimarDuracionTexto(texto: string): number {
  const caracteres = texto.trim().length;
  if (caracteres === 0) return 0;
  return Math.max(1, Math.round(caracteres / 15));
}

export interface OpcionesMezcla {
  voz: AudioBuffer;
  musica: AudioBuffer | null;
  volumenVoz: number; // 0..1.5
  volumenMusica: number; // 0..1
  silenciarVoz: boolean;
  silenciarMusica: boolean;
  /** Dónde empieza la música respecto al inicio de la voz (segundos). */
  desplazamientoMusicaSeg: number;
  fundidoEntradaMusicaSeg: number;
  fundidoSalidaMusicaSeg: number;
  cortarMusicaAlFinalizarVoz: boolean;
  repetirMusica: boolean;
  /** 0 = desactivado, 1 = atenuación fuerte de la música mientras hay voz. */
  reduccionMusicaConVoz: number;
}

/** Envolvente de actividad de voz (0..1) con ataque rápido y relajación lenta. */
function envolventeActividadVoz(voz: AudioBuffer, puntosPorSegundo: number): Float32Array {
  const total = Math.max(1, Math.ceil(voz.duration * puntosPorSegundo));
  const curva = new Float32Array(total);
  const datos = voz.getChannelData(0);
  const ventana = Math.max(1, Math.floor(voz.sampleRate / puntosPorSegundo));
  let max = 0;
  const rms = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const inicio = i * ventana;
    const fin = Math.min(datos.length, inicio + ventana);
    let suma = 0;
    for (let j = inicio; j < fin; j += 4) suma += datos[j] * datos[j];
    const valor = Math.sqrt(suma / Math.max(1, (fin - inicio) / 4));
    rms[i] = valor;
    if (valor > max) max = valor;
  }
  const umbral = max * 0.12;
  let nivel = 0;
  for (let i = 0; i < total; i++) {
    const objetivo = rms[i] > umbral ? Math.min(1, rms[i] / (max * 0.6)) : 0;
    // Ataque rápido, relajación lenta para evitar bombeo.
    const coef = objetivo > nivel ? 0.5 : 0.06;
    nivel += (objetivo - nivel) * coef;
    curva[i] = nivel;
  }
  return curva;
}

/**
 * Mezcla voz + música con OfflineAudioContext.
 * Incluye fundidos, desplazamiento, repetición y "ducking" (la música baja mientras hay voz).
 */
export async function mezclarPistas(opciones: OpcionesMezcla): Promise<AudioBuffer> {
  const frecuencia = 44100;
  const voz = await remuestrear(opciones.voz, frecuencia);
  const musica = opciones.musica ? await remuestrear(opciones.musica, frecuencia) : null;

  let duracion = voz.duration;
  if (musica && !opciones.silenciarMusica) {
    const finMusica = opciones.desplazamientoMusicaSeg + musica.duration;
    if (!opciones.cortarMusicaAlFinalizarVoz && !opciones.repetirMusica) {
      duracion = Math.max(duracion, finMusica);
    }
  }
  duracion = Math.max(0.5, duracion);

  const contexto = new OfflineAudioContext(
    2,
    Math.ceil(duracion * frecuencia),
    frecuencia,
  );

  // ── Voz ──
  const fuenteVoz = contexto.createBufferSource();
  fuenteVoz.buffer = voz;
  const gananciaVoz = contexto.createGain();
  gananciaVoz.gain.value = opciones.silenciarVoz ? 0 : opciones.volumenVoz;
  fuenteVoz.connect(gananciaVoz);
  gananciaVoz.connect(contexto.destination);
  fuenteVoz.start(0);

  // ── Música ──
  if (musica && !opciones.silenciarMusica) {
    const fuenteMusica = contexto.createBufferSource();
    fuenteMusica.buffer = musica;
    if (opciones.repetirMusica) fuenteMusica.loop = true;

    const gananciaMusica = contexto.createGain();
    const puntosPorSegundo = 20;
    const total = Math.max(1, Math.ceil(duracion * puntosPorSegundo));
    const curva = new Float32Array(total);
    const actividad = envolventeActividadVoz(voz, puntosPorSegundo);
    const inicioMusica = opciones.desplazamientoMusicaSeg;
    const finVoz = voz.duration;

    for (let i = 0; i < total; i++) {
      const t = i / puntosPorSegundo;
      let g = opciones.volumenMusica;
      // Antes del inicio o después del corte: silencio.
      if (t < inicioMusica) g = 0;
      if (opciones.cortarMusicaAlFinalizarVoz && t > finVoz) g = 0;
      // Ducking: la música baja mientras hay voz.
      if (opciones.reduccionMusicaConVoz > 0 && t <= finVoz && t >= inicioMusica) {
        g *= 1 - opciones.reduccionMusicaConVoz * actividad[i];
      }
      // Fundidos de la música.
      const tMusica = t - inicioMusica;
      if (opciones.fundidoEntradaMusicaSeg > 0 && tMusica < opciones.fundidoEntradaMusicaSeg) {
        g *= Math.max(0, tMusica / opciones.fundidoEntradaMusicaSeg);
      }
      const finEfectivo = opciones.cortarMusicaAlFinalizarVoz
        ? finVoz
        : Math.min(duracion, inicioMusica + musica.duration);
      const hastaFin = finEfectivo - t;
      if (opciones.fundidoSalidaMusicaSeg > 0 && hastaFin < opciones.fundidoSalidaMusicaSeg) {
        g *= Math.max(0, hastaFin / opciones.fundidoSalidaMusicaSeg);
      }
      curva[i] = Math.max(0, g);
    }
    gananciaMusica.gain.setValueCurveAtTime(curva, 0, duracion);

    fuenteMusica.connect(gananciaMusica);
    gananciaMusica.connect(contexto.destination);
    const cuandoEmpezar = Math.max(0, inicioMusica);
    const cuandoTerminar = opciones.cortarMusicaAlFinalizarVoz
      ? Math.min(duracion, finVoz)
      : duracion;
    try {
      fuenteMusica.start(cuandoEmpezar);
      fuenteMusica.stop(Math.max(cuandoEmpezar + 0.1, cuandoTerminar));
    } catch {
      // Si los tiempos no son válidos, se deja sonar sin corte programado.
      fuenteMusica.start(cuandoEmpezar);
    }
  }

  return contexto.startRendering();
}
