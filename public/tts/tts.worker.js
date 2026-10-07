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

/* global importScripts, self, caches, fetch, WebAssembly, DOMException */

// El build web de sherpa-onnx lee self.Module ANTES de importScripts.
self.Module = {
  locateFile: function (ruta) {
    if (ruta.endsWith('.wasm')) return 'sherpa-onnx-wasm-main-tts.wasm';
    return ruta;
  },
  onRuntimeInitialized: function () {
    if (typeof alRuntimeListo === 'function') alRuntimeListo();
  },
  /**
   * El .data preempaquetado del build oficial (96,5 MB: un modelo VITS en
   * inglés + espeak-ng-data de todos los idiomas) no se usa en esta app:
   * espeak-ng-data (español) y los modelos de voz se descargan por separado
   * y se escriben en el FS virtual. Devolver un paquete vacío evita
   * descargar 96,5 MB inútiles y satisface la contabilidad de dependencias
   * de Emscripten (sin esto, el runtime no arranca nunca: el .data da 404).
   */
  getPreloadedPackage: function () {
    return new ArrayBuffer(0);
  },
  /**
   * Carga del WASM con timeout y progreso propios.
   * El fetch interno de Emscripten no tiene timeout: si la red se queda
   * colgada, el arranque no avisa nunca. Aquí se detecta la inactividad
   * (45 s sin datos) y se informa con un error reintentable en español.
   */
  instantiateWasm: function (imports, alInstanciar) {
    const url = 'sherpa-onnx-wasm-main-tts.wasm';
    const controlador = new AbortController();
    const LIMITE_INACTIVIDAD_MS = 45000;
    let temporizador = setTimeout(() => controlador.abort(), LIMITE_INACTIVIDAD_MS);
    const rearmar = () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => controlador.abort(), LIMITE_INACTIVIDAD_MS);
    };
    fetch(url, { signal: controlador.signal })
      .then((respuesta) => {
        if (!respuesta.ok) {
          throw new Error('no-ok');
        }
        const total = Number(respuesta.headers.get('content-length')) || 0;
        const lector = respuesta.body.getReader();
        const trozos = [];
        let recibidos = 0;
        const leer = () => {
          return lector.read().then(({ done, value }) => {
            clearTimeout(temporizador);
            if (done) return trozos;
            trozos.push(value);
            recibidos += value.length;
            if (total > 0) {
              publicar({
                tipo: 'progreso',
                peticionId: 0,
                fase: 'iniciando-motor',
                porcentaje: Math.round((recibidos / total) * 100),
                detalle:
                  'Cargando el motor de voz: ' +
                  (Math.round((recibidos / 1048576) * 10) / 10) +
                  ' de ' +
                  (Math.round((total / 1048576) * 10) / 10) +
                  ' MB',
              });
            }
            rearmar();
            return leer();
          });
        };
        return leer().then(() => {
          const bytes = new Uint8Array(recibidos);
          let offset = 0;
          for (const t of trozos) {
            bytes.set(t, offset);
            offset += t.length;
          }
          return bytes;
        });
      })
      .then((bytes) => WebAssembly.instantiate(bytes, imports))
      .then(
        (resultado) => {
          clearTimeout(temporizador);
          alInstanciar(resultado.instance);
        },
        (fallo) => {
          clearTimeout(temporizador);
          throw fallo;
        },
      )
      .catch(() => {
        clearTimeout(temporizador);
        publicar({
          tipo: 'error',
          peticionId: 0,
          mensaje:
            'No se ha podido cargar el motor de voz. Comprueba tu conexión a internet y pulsa Reintentar.',
        });
      });
    // Se devuelve un objeto vacío para indicar instanciación asíncrona.
    return {};
  },
};

importScripts('sherpa-onnx-wasm-main-tts.js', 'sherpa-onnx-tts.js');

// Vigilante: si el runtime WASM no se inicializa en 2 minutos (p. ej. la
// descarga del .wasm se queda colgada), se avisa en lugar de silencio eterno.
// El hilo principal tiene su propio temporizador más corto (90 s).
setTimeout(() => {
  if (!runtimeListo) {
    publicar({
      tipo: 'error',
      peticionId: 0,
      mensaje:
        'El motor de voz no se ha podido iniciar (tiempo de espera agotado). Prueba a recargar la página.',
    });
  }
}, 120000);

const NOMBRE_CACHE = 'estudio-voz-tts-v1';
const FRECUENCIA_ESPERADA = 22050;

/**
 * Frecuencia nativa real de cada modelo Piper (de sus config.json oficiales
 * en rhasspy/piper-voices). NO fiarse de lo que reporta el wrapper nativo
 * (_SherpaOnnxOfflineTtsSampleRate devuelve 22050 para las cuatro, incorrecto
 * para las "low").
 */
const FRECUENCIAS_NATIVAS = {
  lucia: 16000, // es_ES-mls_10246-low
  elena: 16000, // es_ES-mls_9972-low
  mateo: 22050, // es_ES-davefx-medium
  javier: 22050, // es_ES-sharvard-medium
};

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
const MAX_CARACTERES_POR_FRAGMENTO = 150;
function dividirEnFrases(texto) {
  const brutas = texto.match(/[^.!?…\n]+[.!?…\n]+|[^.!?…\n]+$/g);
  const base = brutas
    ? brutas.map((f) => f.trim()).filter((f) => f.length > 0)
    : [texto.trim()].filter((f) => f.length > 0);
  // Subdivide las frases largas por palabras: una sola llamada nativa con
  // demasiado texto puede agotar la memoria del módulo WebAssembly
  // ("memory access out of bounds").
  const fragmentos = [];
  for (const f of base) {
    if (f.length <= MAX_CARACTERES_POR_FRAGMENTO) {
      fragmentos.push(f);
      continue;
    }
    let actual = '';
    for (const palabra of f.split(/\s+/)) {
      const candidato = (actual + ' ' + palabra).trim();
      if (candidato.length > MAX_CARACTERES_POR_FRAGMENTO && actual) {
        fragmentos.push(actual.trim());
        actual = palabra;
      } else {
        actual = candidato;
      }
    }
    if (actual.trim()) fragmentos.push(actual.trim());
  }
  return fragmentos;
}

/**
 * Remuestrea por interpolación lineal. Las voces "low" (Lucía, Elena) generan
 * a 16000 Hz y las "medium" (Mateo, Javier) a 22050 Hz; se unifica todo a
 * 22050 Hz para que la reproducción, la mezcla y la exportación sean
 * consistentes. Sin esto, Lucía y Elena suenan aceleradas (chipmunk).
 */
function remuestrear(muestras, origen, destino) {
  if (!origen || origen === destino) return muestras;
  const ratio = destino / origen;
  const n = Math.max(1, Math.round(muestras.length * ratio));
  const salida = new Float32Array(n);
  const ultimo = muestras.length - 1;
  for (let i = 0; i < n; i++) {
    const pos = i / ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, ultimo);
    const frac = pos - i0;
    salida[i] = muestras[i0] * (1 - frac) + muestras[i1] * frac;
  }
  return salida;
}

async function sintetizar(peticionId, vozId, texto, velocidad) {
  progreso(peticionId, 'preparando', 0, 'Preparando la voz…');
  const tts = await obtenerTts(vozId, peticionId);
  // Frecuencia nativa según el modelo oficial (el wrapper nativo no es fiable).
  const frecuenciaNativa = FRECUENCIAS_NATIVAS[vozId] || FRECUENCIA_ESPERADA;
  const frases = dividirEnFrases(texto);
  const partes = [];
  let totalMuestras = 0;
  for (let i = 0; i < frases.length; i++) {
    comprobarCancelacion(peticionId);
    progreso(peticionId, 'sintetizando', Math.round((i / frases.length) * 100),
      'Generando la voz… (' + (i + 1) + ' de ' + frases.length + ')');
    let audio;
    try {
      audio = tts.generate({ text: frases[i], sid: 0, speed: velocidad || 1.0 });
    } catch (err) {
      // Sin memoria en el módulo WASM con un fragmento concreto.
      if (err && /memory access out of bounds/i.test(err.message || '')) {
        throw new Error(
          'No hay memoria suficiente para generar este texto. Prueba con un texto más corto o divídelo en partes.',
        );
      }
      throw err;
    }
    if (!audio || !audio.samples || audio.samples.length === 0) {
      throw new Error('La generación de voz no ha producido audio.');
    }
    // Unifica a 22050 Hz (las voces "low" generan a 16000 Hz).
    const muestras = remuestrear(audio.samples, frecuenciaNativa, FRECUENCIA_ESPERADA);
    partes.push(muestras);
    totalMuestras += muestras.length;
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
