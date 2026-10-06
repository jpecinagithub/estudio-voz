# Estudio Voz

Estudio Voz es una aplicación web progresiva (PWA) para crear, grabar, transcribir y
mezclar audio en español, directamente desde el navegador. Sin registro, sin cuentas:
tus proyectos se guardan solo en tu dispositivo.

## Qué puedes hacer

- **Texto a voz**: convierte cualquier texto en una voz natural en español, con cuatro
  voces reales (Lucía, Elena, Mateo y Javier). La voz se genera en tu propio
  dispositivo, sin conexión una vez descargado el modelo.
- **Audio a texto**: transcribe archivos de audio o grabaciones a texto editable en
  español (Whisper vía Groq), con segmentos y marcas de tiempo, y descarga en TXT o SRT.
- **Grabar**: graba con el micrófono del ordenador (pausa, reanuda, edita, normaliza).
- **Mezclar**: combina tu voz con música de fondo, ajusta volúmenes, fundidos y
  reducción automática de la música cuando hablas (*ducking*).
- **Música original**: 5 pistas compuestas y sintetizadas por código, más la opción de
  subir la tuya.
- **Exportar**: descarga en MP3, WAV, OGG o M4A/AAC, en tres calidades.
- **Historial local**: tus últimos 10 trabajos se guardan en tu navegador (IndexedDB).

## Tecnología

- **Vite + React 19 + TypeScript**, React Router.
- **Web Audio API** para generación, edición y mezcla; **MediaRecorder** para grabar.
- **IndexedDB** (`idb`) para el historial local; `localStorage` para ajustes.
- **PWA** con `vite-plugin-pwa`: manifiesto e iconos, funciona instalable.
- **Funciones serverless de Vercel** solo para la transcripción y utilidades.
- **@vercel/analytics** para analíticas (sin datos de contenido).

## Requisitos

- Node.js 20 o superior.
- Navegador moderno con Web Audio API e IndexedDB (Chrome, Edge, Firefox, Safari).

## Instalación

```bash
npm install
npm run dev
```

La aplicación se abre en `http://localhost:5173`.

> Nota: `npm run dev` (Vite) no ejecuta las funciones de `api/`. Para probar la
> transcripción en local, usa el CLI de Vercel:

```bash
vercel dev
```

## Variables de entorno

Copia `.env.example` a `.env.local` y configura:

| Variable | Obligatoria | Para qué |
|---|---|---|
| `GROQ_API_KEY` | Sí, para transcribir | Clave de la API de Groq (servidor). |
| `BLOB_READ_WRITE_TOKEN` | Solo para audios > 4 MB | Token de Vercel Blob (servidor). |

**Nunca** pongas estas claves en el código del cliente: ambas se usan solo en las
funciones de `api/`.

## Transcripción: configuración de Groq

1. Crea una cuenta en [Groq](https://groq.com) y genera una clave de API.
2. En Vercel (o `.env.local` con `vercel dev`), define `GROQ_API_KEY`.
3. La aplicación usa el modelo `whisper-large-v3-turbo` con `language: "es"` y marcas
   de tiempo por segmento.

**Cómo funciona con archivos grandes**: los audios de hasta 4 MB se envían
directamente a la función `/api/transcribir`; los mayores (hasta 25 MB) se suben
primero a un Blob temporal de Vercel y la función pide a Groq que lo transcriba desde
la URL. El Blob temporal se elimina siempre al terminar.

La mejora opcional de puntuación del texto (`/api/mejorar-texto`) también usa Groq y
nunca bloquea la transcripción principal.

## Música de fondo

Las 5 pistas (`public/musica/`) son **100% originales**: compuestas y sintetizadas por
código en `scripts/generar-musica.mjs`, sin samples ni material protegido. Formato MP3
128 kbps, 44,1 kHz, estéreo. Licencia: uso libre dentro de la aplicación. Para
regenerarlas:

```bash
npm run generar-musica
```

## Voces (texto a voz)

Las cuatro voces se generan localmente en el navegador con modelos Piper (VITS) en
español, ejecutados con el runtime **sherpa-onnx** (WebAssembly, build web oficial
`wasm-simd`, v1.13.8) en un Web Worker clásico. Cada modelo se descarga una sola vez
(con barra de progreso) y queda cacheado en el navegador (Cache Storage); después
funciona sin conexión.

| Voz | Modelo Piper es_ES | Género | Tamaño | Licencia del dataset |
|---|---|---|---|---|
| Lucía — clara, cálida y cercana | `es_ES-mls_10246-low` | Femenina | 60 MB | CC BY 4.0 |
| Elena — serena, profesional | `es_ES-mls_9972-low` | Femenina | 60 MB | CC BY 4.0 |
| Mateo — natural, cercano y moderno | `es_ES-davefx-medium` | Masculina | 60 MB | CC0 |
| Javier — profunda y profesional | `es_ES-sharvard-medium` | Masculina | 73 MB | CC BY 3.0 |

- Código de los modelos Piper: MIT (rhasspy/piper-voices).
- Runtime `sherpa-onnx`: Apache-2.0. Incluye espeak-ng compilado (GPL-3.0); el aviso
  y la fuente correspondientes se enlazan desde la documentación del proyecto.
- Los `.onnx` llevan un parche de metadatos (sample_rate, n_speakers, language)
  exigido por el runtime; ver `research/tts-evaluacion.md`.
- La elección se documenta en `research/tts-evaluacion.md` (comparativa con
  Kokoro-82M y MMS, con audios de prueba y métricas).

## Licencias de terceros

- **Codificadores** (`wasm-media-encoders`): MP3 y OGG Vorbis.
- **ffmpeg.wasm** (`@ffmpeg/core`, `@ffmpeg/ffmpeg`, `@ffmpeg/util`): solo se carga
  cuando eliges exportar en M4A/AAC (~32 MB descargados una vez).
- Modelos de transcripción: Whisper vía Groq (servicio externo, requiere internet).
- Voces: ver sección anterior.

## Privacidad

- Grabar, editar, mezclar y generar voz ocurre **en tu dispositivo**.
- El historial y los ajustes se guardan **solo en tu navegador**.
- **La única función que envía datos fuera** es la transcripción de audio a texto
  (al proveedor configurado, Groq). Los Blobs temporales de archivos grandes se
  eliminan tras transcribir.
- El service worker nunca almacena en caché audio, textos, transcripciones ni
  respuestas de la API.

## Comandos

```bash
npm run dev            # desarrollo
npm run build          # compilación de producción (incluye preparar ffmpeg)
npm run preview        # vista previa de la compilación
npm run generar-musica # regenerar las 5 pistas originales
npm run generar-iconos # regenerar los iconos de la PWA
```

## Autor

Creado por **Jon Peciña** · [jpecina@gmail.com](mailto:jpecina@gmail.com)
