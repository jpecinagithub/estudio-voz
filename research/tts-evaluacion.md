# Evaluación de motores TTS en español 100% en navegador

**Fecha:** 2026-10-06 · **Objetivo:** elegir motor + 4 voces españolas reales (2F/2M) para "Estudio Voz" (Vite + React + TS, serverless, todo en español).
**Texto de prueba (91 caracteres):** "Hola. Esta es una prueba del estudio de voz en español. La calidad debe ser alta y natural."
**Audios generados:** [`research/audio/`](./audio/) (8 WAV + `piper_metrics.json` + `kokoro_metrics.json`).
**Entorno de prueba:** Node 24, AMD EPYC 9D64 (2 vCPU), 7 GB RAM. Piper probado con el **binario WASM exacto que usaría el navegador** (`sherpa-onnx` npm v1.13.8); Kokoro con `onnxruntime-node` 1.20/1.30 (mismo grafo ONNX que en el navegador).

---

## 1. Recomendación final

**Motor: Piper (VITS) es_ES ejecutado con `sherpa-onnx` WASM en un Web Worker.**

| Persona | Voz Piper (HuggingFace) | Género (F0 medido) | Tamaño | Licencia dataset |
|---|---|---|---|---|
| **Lucía** — femenina, clara, cálida y cercana | [`es_ES-mls_10246-low`](https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/mls_10246/low/es_ES-mls_10246-low.onnx) | F (~269 Hz) | **60,2 MB** | CC BY 4.0 (atribución en README) |
| **Elena** — femenina, serena, profesional, ligeramente más grave | [`es_ES-mls_9972-low`](https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/mls_9972/low/es_ES-mls_9972-low.onnx) | F (~269 Hz) | **60,2 MB** | CC BY 4.0 (atribución en README) |
| **Mateo** — masculina, natural, cercana y moderna | [`es_ES-davefx-medium`](https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx) | M (~126 Hz) | **60,3 MB** | CC0 |
| **Javier** — masculina, profunda, pausada y profesional | [`es_ES-sharvard-medium`](https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx) | M (~118 Hz, la más grave) | **73,2 MB** | CC-BY 3.0 (atribución en README) |

**Por qué Piper y no Kokoro:** el requisito es **exactamente 4 voces españolas reales (2F/2M), sin simular con pitch**. Kokoro-82M solo tiene **3 voces españolas** (`ef_dora`, `em_alex`, `em_santa`; verificado en el listado `voices/` del repo) y no existe una cuarta. Piper es_ES ofrece **5 voces reales** (verificado en `rhasspy/piper-voices`: davefx, sharvard, carlfm, mls_9972, mls_10246), de las que se eligen las 4 mejores. Además cada voz Piper se descarga **por separado y bajo demanda** (27–73 MB), mientras que Kokoro exige descargar el modelo completo (88 MB) aunque solo se use una voz.

### Justificación del mapeo voz → persona

- **Lucía → mls_10246-low:** femenina confirmada (F0≈269 Hz); ritmo 14,8 car/s (natural) y mejor energía (RMS 0,042) que su gemela mls_9972 → "clara y cercana".
- **Elena → mls_9972-low:** femenina confirmada (F0≈269 Hz); ritmo pausado 9,2 car/s y nivel más contenido → encaja con "serena, profesional". Es la voz más lenta del catálogo: ideal para narración pausada.
- **Mateo → davefx-medium:** masculina (F0≈126 Hz), calidad `medium` (la más alta disponible en es_ES), dataset CC0, ritmo 17,9 car/s → "natural, cercana y moderna".
- **Javier → sharvard-medium:** masculina con el F0 más grave medido (118 Hz), calidad `medium` → "profunda y profesional". (Tiene 2 speakers; usar `sid: 0`.)
- **Descartada:** `es_ES-carlfm-x_low` (M, F0≈158 Hz, 26,8 MB) — nivel `x_low` y ritmo excesivo (27,1 car/s); queda como repuesto.

> Nota honesta: la asignación de "personalidad" (cálida/serena/profunda) usa como proxy el F0 medido y el ritmo; el timbre subjetivo debe validarlo una persona escuchando los WAV de [`research/audio/`](./audio/).

---

## 2. Resultados medidos

### 2.1 Piper es_ES vía `sherpa-onnx` WASM (binario de navegador)

| Voz | Carga modelo | Síntesis (91 car.) | Audio | Factor tiempo real | F0 medido | RMS |
|---|---|---|---|---|---|---|
| davefx-medium (60,3 MB) | 9,2 s | 6,52 s | 5,10 s @ 22050 Hz | **1,28×** | 126 Hz (M) | 0,165 |
| sharvard-medium (73,2 MB) | 9,5 s | 10,21 s | 4,90 s | **2,08×** | 118 Hz (M) | 0,063 |
| mls_10246-low (60,2 MB) | 5,2 s | 8,40 s | 6,14 s | **1,37×** | 269 Hz (F) | 0,042 |
| mls_9972-low (60,2 MB) | 9,4 s | 22,44 s | 9,87 s | **2,27×** | 269 Hz (F) | 0,026 |
| carlfm-x_low (26,8 MB) | 5,4 s | 5,20 s | 3,36 s | **1,55×** | 158 Hz (M) | 0,066 |

Chequeo fonético objetivo: espectros con energía concentrada en 0,1–3 kHz (formantes de voz), ZCR 0,03–0,14, sin clipping (pico ≤ 0,97), duraciones coherentes (9–27 car/s). Ningún WAV es silencio ni ruido.

### 2.2 Kokoro-82M vía `@huggingface/transformers` v3 (`onnx-community/Kokoro-82M-v1.0-ONNX`, dtype `q8` → `model_quantized.onnx` **88,1 MB**)

| Voz | Síntesis (91 car.) | Audio | Factor tiempo real | F0 medido |
|---|---|---|---|---|
| ef_dora (F) | 18,78 s | 5,55 s @ 24000 Hz | **3,38×** | 166 Hz (F) ✓ |
| em_alex (M) | 19,14 s | 5,63 s | **3,40×** | 123 Hz (M) ✓ |
| em_santa (M) | 18,05 s | 5,63 s | **3,21×** | 132 Hz (M) ✓ |

Carga del modelo: 2,6–4,3 s desde caché (primera descarga: 88,1 MB + 0,5 MB por voz).

**Variantes cuantizadas del repo** (tamaños medidos por HEAD): `model_q8f16.onnx` **82,0 MB** (la menor, pero transformers.js no la mapea a ningún `dtype` estándar) · `model_quantized.onnx` **88,1 MB** (`dtype:"q8"`, la práctica) · `model_uint8f16.onnx` 108,9 MB · `model_q4f16.onnx` 147,4 MB · `model_fp16.onnx` 155,7 MB · `model_uint8.onnx` 169,2 MB · `model.onnx` (fp32) 310,5 MB · `model_q4.onnx` 305 MB. Voces: 0,5 MB cada una (`ef_dora.bin`, `em_alex.bin`, `em_santa.bin`).

### 2.3 Por qué Kokoro queda descartado como motor principal

1. **Solo 3 voces españolas reales** (verificado en `voices/` del repo: `ef_dora`, `em_alex`, `em_santa`). No existe una cuarta; `em_santa` es además una voz "navideña"/caricaturesca, inadecuada para "Javier, profesional".
2. **`kokoro-js` (wrapper oficial) no sirve para español:** su tabla de voces solo incluye voces inglesas (lanza error con `ef_dora`) y su G2P usa espeak **inglés** siempre (`phonemizer` npm solo trae datos en inglés) → pronunciaría español con fonética inglesa. Hay que usar `@huggingface/transformers@3` directamente + G2P español propio (probado: `work/es_g2p.mjs`, ver §5).
3. **transformers.js v4.x eliminó el soporte Kokoro** (v4.3.0: `Unsupported model type "style_text_to_speech_2"` en el pipeline). La vía estable es la línea v3.
4. Más lento en CPU que Piper (RTF ~3,3 vs 1,3–2,3) y descarga monolítica de 88 MB.

### 2.4 MMS español (`Xenova/mms-tts-spa`) — descartado

Un solo locutor (no puede dar 4 voces), calidad VITS 16 kHz inferior a ambas opciones, y la descarga del modelo se quedó colgada en las pruebas. No aporta nada frente a Piper.

---

## 3. Estrategia de carga en el navegador

- **Web Worker dedicado** (`tts.worker.ts`, `new Worker(new URL('./tts.worker.ts', import.meta.url), { type: 'module' })`): el WASM de sherpa-onnx es monohilo y bloqueante; todo el TTS vive en el worker, la UI solo recibe progreso y PCM.
- **Descarga bajo demanda con progreso:** al elegir una voz por primera vez: *"Preparando la voz por primera vez…"* con % / MB / barra. Solo se descarga el `.onnx` de esa voz (+ `tokens.txt` generado del `.onnx.json`, ~KB). El runtime WASM (`sherpa-onnx`, ~15 MB) y los datos espeak-es (**~0,7 MB**, solo fonética española) se descargan una vez.
- **Caché entre sesiones:** Cache Storage (`caches.open('estudio-voz-tts-v1')`) para `.wasm`, `.onnx`, `espeak-ng-data/es*`, `tokens.txt`. Al iniciar, `cache.match()` evita redescargar. Mensaje: *"La próxima vez será mucho más rápido: la voz ya está guardada en tu navegador."*
- **Paralelismo:** `maxNumSentences: 1`, `numThreads: 1` (el build WASM es monohilo; más hilos no ayudan).
- **Sin `ffmpeg.wasm` para TTS:** el worker devuelve PCM 22050 Hz → se codifica a WAV/MP3 con `MediaRecorder` o `lamejs` según el formato de exportación.

### Parche de metadatos ONNX (paso único, documentado)

Los `.onnx` de `rhasspy/piper-voices` **no traen metadatos** y el TTS WASM de sherpa-onnx exige `sample_rate`, `n_speakers`, `language` y `comment` (verificado en `offline-tts-vits-model.cc` v1.13.8). Hay que añadirlos una vez con `onnx` (Python):

```python
import onnx
m = onnx.load("es_ES-davefx-medium.onnx")
for k, v in {"sample_rate":"22050","n_speakers":"1","language":"es",
             "comment":"piper es_ES-davefx-medium","voice":"es"}.items():
    m.metadata_props.append(onnx.StringStringEntryProto(key=k, value=v))
onnx.save(m, "es_ES-davefx-medium.onnx")  # se sube ESTE archivo al hosting de modelos
```

Los modelos parcheados se alojan en el propio proyecto (p. ej. `/models/` servidos por Vercel o un bucket) para no depender de la rama `v1.0.0` de HF en producción.

### `tokens.txt` por voz

Se genera del `phoneme_id_map` del `<voz>.onnx.json` (una línea `fonema id` por entrada). ~150 fonemas, unos pocos KB.

---

## 4. Snippet de integración con Vite

```ts
// src/tts/tts.worker.ts
import sherpaOnnxWasm from "sherpa-onnx/sherpa-onnx-wasm-nodejs.js";
import { createOfflineTts } from "sherpa-onnx/sherpa-onnx-tts.js";
// En el worker: fetch con progreso de MODEL_URL -> Cache Storage -> createOfflineTts(Module, {
//   model: { vits: { model: objectUrlOuCache, tokens: tokensUrl, dataDir: espeakDataUrl },
//            numThreads: 1, provider: "cpu" }, maxNumSentences: 1 })
// const audio = tts.generate({ text, sid: 0, speed }); // { samples: Float32Array, sampleRate: 22050 }
// postMessage({ pcm: audio.samples }, [audio.samples.buffer])
```

```ts
// src/tts/useTts.ts (hilo principal)
const worker = new Worker(new URL("./tts.worker.ts", import.meta.url), { type: "module" });
// progreso: el worker informa bytes descargados / total por voz (Content-Length conocido)
// Vite: el .wasm se sirve con `?url` o desde /public; en el worker se pasa locateFile: { locateFile: (p) => wasmUrl }
```

Notas Vite:
- `sherpa-onnx` es CJS: importar los ficheros del paquete por ruta funciona en Vite (`import ... from "sherpa-onnx/sherpa-onnx-tts.js"`); el `.wasm` se referencia con `new URL("sherpa-onnx/sherpa-onnx-wasm-nodejs.wasm?url", import.meta.url)` o copiado a `public/`.
- `vite-plugin-pwa`: incluir en `workbox.runtimeCaching` los orígenes de modelos con estrategia `CacheFirst` como respaldo al Cache Storage manual.
- El worker necesita `crossOriginIsolated` **solo** si se quiere multihilo; el build WASM de sherpa-onnx es monohilo → no se requieren cabeceras COOP/COEP.

---

## 5. Hallazgo adicional: G2P español propio y funcional

`kokoro-js` usa espeak inglés para todo, así que para probar Kokoro en español se escribió `work/es_g2p.mjs`: fonemizador español→IPA estilo espeak-ng basado en reglas (silabificación, acentuación, lenición b/d/g→β/ð/ɣ, θ por c+e/i y z, ɲ, ʝ, r/ɾ, diptongos j/w). Salida para el texto de prueba:

`ˈola . ˈesta es ˈuna ˈpɾweβa del esˈtuðjo de boθ en espaˈɲol . la kaliˈðad ˈdeβe seɾ ˈalta i natuˈɾal .`

Verificado manualmente: correcto. Queda como **plan B documentado** si en el futuro se quiere Kokoro sin cargar espeak-ng.

---

## 6. Licencias a documentar en el README

| Componente | Licencia |
|---|---|
| `sherpa-onnx` (runtime WASM, incluye espeak-ng compilado) | Apache-2.0; **espeak-ng es GPL-3.0** → el binario combinado hereda obligaciones GPL (ver `docs/artifact-licenses.md` de impossible-voice). Enlazar aviso y fuente. |
| Voz davefx (dataset) | CC0 |
| Voz sharvard (dataset) | CC-BY 3.0 — atribución |
| Voces mls_9972 / mls_10246 (dataset MLS) | CC BY 4.0 — atribución |
| Modelos Piper (código) | MIT (rhasspy/piper-voices) |

---

## 7. Limitaciones honestas

1. **Calidad:** Piper VITS `medium`/`low` es bueno pero no llega al nivel de Kokoro-82M ni a ElevenLabs. Las dos voces femeninas son nivel `low` (dataset MLS, audiobook). Si el requisito de 4 voces se relajase a 3, Kokoro sería la elección por calidad.
2. **Rendimiento WASM monohilo:** RTF 1,3–2,3 en CPU de escritorio (un móvil modesto será más lento). Textos largos (párrafos) tardan decenas de segundos: la UI debe trocear por frases y mostrar progreso real. En nativo sería ~3,6× más rápido, pero en navegador no hay build multihilo estable.
3. **Primera descarga:** ~15 MB (WASM) + 0,7 MB (espeak-es) + 27–73 MB por voz. Aceptable con la pantalla de progreso exigida, pero no es instantáneo.
4. **Parche de modelos:** los `.onnx` originales de HF necesitan el parche de metadatos (§3); hay que re-empaquetar y hospedar los 4 archivos.
5. **Validación subjetiva pendiente:** F0, ritmo y espectro confirman género y fonética española, pero **ningún oído humano ha validado** naturalidad, artefactos ni adecuación de cada voz a su persona. Escuchar los 8 WAV de [`research/audio/`](./audio/) antes de cerrar el mapeo.
6. **espeak-ng es GPL-3.0:** al distribuir el WASM de sherpa-onnx (que lo embebe) hay que cumplir la GPL (ofrecer fuente correspondiente). Es la vía estándar y documentada, pero debe constar.
7. **Offline:** tras la primera descarga, el TTS funciona 100% offline (PWA). Solo la transcripción Groq requiere internet.

---

## 8. Archivos de esta investigación

- [`research/audio/`](./audio/) — 8 WAV de prueba + `piper_metrics.json` + `kokoro_metrics.json`
- `research/work/` — scripts de prueba (temporales): `piper_sherpa_test.cjs` (sherpa-onnx WASM), `kokoro_test.mjs` (transformers.js v3 + Kokoro), `es_g2p.mjs` (fonemizador español), `mms_test.mjs`
- `research/work/models/` — los 5 `.onnx` es_ES descargados (+ parcheados `.sr.onnx`), `tokens.txt` generados, `espeak-ng-data` (subconjunto es)
