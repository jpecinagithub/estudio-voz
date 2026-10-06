/**
 * Worker de síntesis de voz (Piper es_ES vía sherpa-onnx WASM, build web oficial).
 *
 * Worker clásico que se carga desde /tts/tts.worker.js. Usa el runtime web de
 * sherpa-onnx (sherpa-onnx-wasm-main-tts.js/.wasm), descarga los modelos bajo
 * demanda con progreso, los guarda en Cache Storage y los escribe en el MEMFS
 * del WASM. Todo el TTS vive en este worker para no bloquear la interfaz.
 *
 * Protocolo:
 *   main → worker: { tipo: 'iniciar', baseUrl }
 *   main → worker: { tipo: 'preparar', peticionId, vozId }
 *   main → worker: { tipo: 'sintetizar', peticionId, vozId, texto, velocidad }
 *   worker → main: { tipo: 'listo' }
 *   worker → main: { tipo: 'preparada', peticionId, vozId }
 *   worker → main: { tipo: 'progreso', peticionId, fase, porcentaje, detalle }
 *   worker → main: { tipo: 'resultado', peticionId, muestras, frecuenciaMuestreo }
 *   worker → main: { tipo: 'error', peticionId, mensaje }
 */

/* global importScripts, self, caches, fetch */

// El build web de sherpa-onnx lee self.Module ANTES de importScripts.
self.Module = {
  locateFile: function (ruta) {
    if (ruta.endsWith('.wasm')) return 'sherpa-onnx-wasm-main-tts.wasm';
    return ruta;
  },
  onRuntimeInitialized: function () {
    if (typeof alRuntimeListo === 'function') alRuntimeListo();
  },
};

importScripts('sherpa-onnx-wasm-main-tts.js', 'sherpa-onnx-tts.js');

const NOMBRE_CACHE = 'estudio-voz-tts-v1';
const FRECUENCIA_ESPERADA = 22050;

/** Archivos de espeak-ng necesarios para el español (rutas relativas a /modelos/espeak-ng-data/). */
const ARCHIVOS_ESPEAK = [
  'es_dict',
  'phondata',
  'phondata-manifest',
  'phonindex',
  'phontab',
  'intonations',
  'voices/es',
  'lang/roa/es',
];

let baseUrl = '';
let runtimeListo = false;
let resolverRuntime = null;
let espeakListo = false;
const ttsPorVoz = new Map();

/** Peticiones canceladas por el hilo principal (se comprueban entre fases). */
const cancelados = new Set();
/** Permite abortar la descarga en curso de una petición. */
const abortadoresDescarga = new Map();

function alRuntimeListo() {
  runtimeListo = true;
  if (resolverRuntime) {
    const r = resolverRuntime;
    resolverRuntime = null;
    r();
  }
}

function publicar(msg, transferir) {
  if (transferir) self.postMessage(msg, transferir);
  else self.postMessage(msg);
}

function progreso(peticionId, fase, porcentaje, detalle) {
  publicar({ tipo: 'progreso', peticionId, fase, porcentaje, detalle });
}

function esperarRuntime() {
  if (runtimeListo) return Promise.resolve();
  return new Promise((resolver) => {
    resolverRuntime = resolver;
  });
}

function comprobarCancelacion(peticionId) {
  if (peticionId && cancelados.has(peticionId)) {
    throw new DOMException('Cancelado', 'AbortError');
  }
}

/** Descarga un archivo con progreso; usa Cache Storage para no repetir descargas.
 * Incluye detección de atasco: si pasan 45 s sin recibir datos, la descarga
 * se cancela con un error en español para que el usuario pueda reintentar.
 * La descarga también puede cancelarse desde el hilo principal (petición
 * 'cancelar'): en ese caso se propaga un AbortError sin mensaje de red. */
async function obtenerBytes(rutaRelativa, peticionId, etiqueta) {
  const url = baseUrl + rutaRelativa;
  comprobarCancelacion(peticionId);
  const cache = await caches.open(NOMBRE_CACHE);
  const enCache = await cache.match(url);
  if (enCache) {
    return new Uint8Array(await enCache.arrayBuffer());
  }
  const controlador = new AbortController();
  // Marca si la cancelación la pidió el usuario (frente a un atasco de red).
  const motivo = { usuario: false };
  if (peticionId) {
    abortadoresDescarga.set(peticionId, () => {
      motivo.usuario = true;
      controlador.abort();
    });
  }
  let respuesta;
  try {
    respuesta = await fetch(url, { signal: controlador.signal });
  } catch (e) {
    if (peticionId) abortadoresDescarga.delete(peticionId);
    if (motivo.usuario) throw new DOMException('Cancelado', 'AbortError');
    throw new Error(
      'No se ha podido descargar ' + etiqueta + '. Comprueba tu conexión a internet y pulsa Reintentar.',
    );
  }
  if (!respuesta.ok) {
    if (peticionId) abortadoresDescarga.delete(peticionId);
    throw new Error('No se ha podido descargar ' + etiqueta + '.');
  }
  const total = Number(respuesta.headers.get('content-length')) || 0;
  const lector = respuesta.body.getReader();
  const trozos = [];
  let recibidos = 0;
  const LIMITE_INACTIVIDAD_MS = 45000;
  let temporizador = setTimeout(() => controlador.abort(), LIMITE_INACTIVIDAD_MS);
  const rearmarTemporizador = () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => controlador.abort(), LIMITE_INACTIVIDAD_MS);
  };
  try {
    for (;;) {
      const { done, value } = await lector.read();
      clearTimeout(temporizador);
      if (done) break;
      trozos.push(value);
      recibidos += value.length;
      if (total > 0 && peticionId) {
        progreso(peticionId, 'descargando-modelo', Math.round((recibidos / total) * 100),
          etiqueta + ': ' + Math.round((recibidos / 1048576) * 10) / 10 + ' de ' +
          Math.round((total / 1048576) * 10) / 10 + ' MB');
      }
      rearmarTemporizador();
    }
  } catch (e) {
    clearTimeout(temporizador);
    try {
      await lector.cancel();
    } catch (_) {
      /* ignorar */
    }
    if (motivo.usuario) throw new DOMException('Cancelado', 'AbortError');
    throw new Error(
      'La descarga de ' + etiqueta + ' se interrumpió. Comprueba tu conexión a internet y pulsa Reintentar.',
    );
  } finally {
    clearTimeout(temporizador);
    if (peticionId) abortadoresDescarga.delete(peticionId);
  }
  const bytes = new Uint8Array(recibidos);
  let offset = 0;
  for (const t of trozos) {
    bytes.set(t, offset);
    offset += t.length;
  }
  await cache.put(url, new Response(bytes.slice(), {
    headers: { 'content-type': 'application/octet-stream' },
  }));
  return bytes;
}

function escribirEnMemoria(rutaVirtual, bytes) {
  const M = self.Module;
  const partes = rutaVirtual.split('/').filter(Boolean);
  const nombre = partes.pop();
  let actual = '';
  for (const parte of partes) {
    const padre = actual || '/';
    actual += '/' + parte;
    try {
      M.FS_createPath(padre, parte, true, true);
    } catch (e) {
      /* ya existe */
    }
  }
  const padre = partes.length > 0 ? '/' + partes.join('/') : '/';
  // Si el archivo ya existe (de una ejecución anterior), lo eliminamos primero.
  try {
    M.FS_unlink(rutaVirtual);
  } catch (e) {
    /* no existía */
  }
  M.FS_createDataFile(padre, nombre, bytes, true, true);
}

/** Prepara los datos de espeak para español en el sistema de archivos virtual. */
async function prepararEspeak(peticionId) {
  if (espeakListo) return;
  const base = '/espeak-ng-data';
  for (const archivo of ARCHIVOS_ESPEAK) {
    const bytes = await obtenerBytes('modelos/espeak-ng-data/' + archivo, peticionId, 'Datos de voz');
    escribirEnMemoria(base + '/' + archivo, bytes);
  }
  espeakListo = true;
}

/** Obtiene (creando si hace falta) la instancia TTS para una voz. */
async function obtenerTts(vozId, peticionId) {
  if (ttsPorVoz.has(vozId)) return ttsPorVoz.get(vozId);
  await prepararEspeak(peticionId);
  comprobarCancelacion(peticionId);
  const bytesModelo = await obtenerBytes('modelos/' + vozId + '.onnx', peticionId, 'Modelo de voz');
  comprobarCancelacion(peticionId);
  const bytesTokens = await obtenerBytes('modelos/' + vozId + '.tokens.txt', peticionId, 'Datos de voz');
  comprobarCancelacion(peticionId);
  escribirEnMemoria('/' + vozId + '.onnx', bytesModelo);
  escribirEnMemoria('/' + vozId + '.tokens.txt', bytesTokens);
  comprobarCancelacion(peticionId);
  // La carga del modelo en memoria puede tardar hasta un minuto en equipos
  // lentos; se avisa para que no parezca que el proceso se ha atascado.
  if (peticionId) {
    progreso(peticionId, 'preparando', 100, 'Cargando el modelo de voz en memoria… puede tardar un minuto.');
  }
  const tts = createOfflineTts(self.Module, {
    model: {
      vits: {
        model: '/' + vozId + '.onnx',
        tokens: '/' + vozId + '.tokens.txt',
        dataDir: '/espeak-ng-data',
      },
      numThreads: 1,
      debug: false,
      provider: 'cpu',
    },
    maxNumSentences: 1,
  });
  ttsPorVoz.set(vozId, tts);
  return tts;
}

/** Divide el texto en frases para sintetizar por partes con progreso real. */
function dividirEnFrases(texto) {
  const frases = texto.match(/[^.!?…\n]+[.!?…\n]+|[^.!?…\n]+$/g);
  if (!frases) return [texto];
  return frases.map((f) => f.trim()).filter((f) => f.length > 0);
}

async function sintetizar(peticionId, vozId, texto, velocidad) {
  progreso(peticionId, 'preparando', 0, 'Preparando la voz…');
  const tts = await obtenerTts(vozId, peticionId);
  const frases = dividirEnFrases(texto);
  const partes = [];
  let totalMuestras = 0;
  for (let i = 0; i < frases.length; i++) {
    comprobarCancelacion(peticionId);
    progreso(peticionId, 'sintetizando', Math.round((i / frases.length) * 100),
      'Generando la voz… (' + (i + 1) + ' de ' + frases.length + ')');
    const audio = tts.generate({ text: frases[i], sid: 0, speed: velocidad || 1.0 });
    if (!audio || !audio.samples || audio.samples.length === 0) {
      throw new Error('La generación de voz no ha producido audio.');
    }
    partes.push(audio.samples);
    totalMuestras += audio.samples.length;
  }
  const muestras = new Float32Array(totalMuestras);
  let offset = 0;
  for (const p of partes) {
    muestras.set(p, offset);
    offset += p.length;
  }
  progreso(peticionId, 'sintetizando', 100, 'Voz lista.');
  publicar(
    {
      tipo: 'resultado',
      peticionId,
      muestras,
      frecuenciaMuestreo: FRECUENCIA_ESPERADA,
    },
    [muestras.buffer],
  );
}

self.onmessage = async (evento) => {
  const msg = evento.data;
  if (msg.tipo === 'cancelar') {
    // El hilo principal abandona una petición: se marca como cancelada y,
    // si está descargando, se aborta la descarga para liberar el worker.
    if (msg.peticionId) {
      cancelados.add(msg.peticionId);
      const abortar = abortadoresDescarga.get(msg.peticionId);
      if (abortar) abortar();
    }
    return;
  }
  try {
    if (msg.tipo === 'iniciar') {
      baseUrl = msg.baseUrl || '';
      if (!baseUrl.endsWith('/')) baseUrl += '/';
      await esperarRuntime();
      publicar({ tipo: 'listo' });
    } else if (msg.tipo === 'sintetizar') {
      await esperarRuntime();
      await sintetizar(msg.peticionId, msg.vozId, msg.texto, msg.velocidad);
    } else if (msg.tipo === 'preparar') {
      await esperarRuntime();
      progreso(msg.peticionId, 'preparando', 0, 'Preparando la voz…');
      await obtenerTts(msg.vozId, msg.peticionId);
      progreso(msg.peticionId, 'preparando', 100, 'Voz lista.');
      publicar({ tipo: 'preparada', peticionId: msg.peticionId, vozId: msg.vozId });
    }
  } catch (err) {
    // Las cancelaciones del usuario no son errores: el hilo principal ya
    // abandonó la petición y no espera respuesta.
    if (err instanceof DOMException && err.name === 'AbortError') {
      return;
    }
    publicar({
      tipo: 'error',
      peticionId: msg.peticionId || null,
      mensaje: err && err.message ? err.message : 'Error desconocido en la síntesis de voz.',
    });
  } finally {
    if (msg.peticionId) cancelados.delete(msg.peticionId);
  }
};

// El runtime WASM se inicializa solo al cargar los scripts;
// 'listo' se publica al recibir 'iniciar'.
