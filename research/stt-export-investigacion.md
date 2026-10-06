# Investigación: STT (Groq) + Exportación de audio en el navegador

**Fecha:** 2026-10-06
**Objetivo:** decisiones técnicas verificadas para el backend serverless (Vercel Functions + Vercel Blob + Groq STT) y la exportación de audio 100% en navegador (Web Worker) del proyecto Estudio Voz.
**Fuentes:** documentación oficial de Groq (console.groq.com/docs, leída el 2026-10-06), documentación oficial de Vercel (vercel.com/docs, leída el 2026-10-06), registro npm (versiones consultadas el 2026-10-06 vía registry.npmjs.org), MDN, changelog oficial de `@vercel/blob` (vercel/storage en GitHub).

---

## 0. Resumen de decisiones

| Área | Decisión recomendada |
|---|---|
| STT | Groq `whisper-large-v3-turbo`, endpoint `https://api.groq.com/openai/v1/audio/transcriptions`, `language: "es"`, `response_format: "verbose_json"` + `timestamp_granularities[]: segment` (y `word` si se quiere SRT palabra a palabra) |
| Límite por archivo | **25 MB** (capa gratuita). Archivos > 25 MB: rechazar con mensaje claro o trocear en cliente |
| Ruta de subida | ≤ 4 MB → multipart directo a `/api/transcribir`. > 4 MB → **Vercel Blob (client upload)** → la Function pasa la URL pública a Groq con el parámetro `url` → `del()` del blob tras transcribir |
| Multipart en la Function | `busboy@1.6.0` (streaming, sin dependencias pesadas) |
| `maxDuration` | 300 s por defecto (Hobby, Fluid Compute) es suficiente; fijar `120` en `vercel.json` para fallar rápido es opcional |
| MP3 | `wasm-media-encoders@0.7.0` (WASM, ~66 KiB gzip). CBR: Ligera 64 kbps / Estándar 128 kbps / Alta 192 kbps |
| OGG Vorbis | `wasm-media-encoders@0.7.0` (~158 KiB gzip). VBR: Ligera `vbrQuality: 0` / Estándar `3.0` / Alta `5.0` |
| WAV | cabecera RIFF de 44 bytes escrita a mano + PCM 16-bit (sin dependencias) |
| M4A/AAC | `@ffmpeg/ffmpeg@0.12.15` + `@ffmpeg/core@0.12.10` (~31 MB, carga bajo demanda en el worker), codificador `aac` nativo. Ofrecer solo si se acepta la descarga bajo demanda |
| Grabadora | Orden de `mimeType`: `audio/webm;codecs=opus` → `audio/ogg;codecs=opus` → `audio/webm` → `audio/mp4` (detección con `MediaRecorder.isTypeSupported`) |
| getUserMedia | `{ echoCancellation: true, noiseSuppression: true, autoGainControl: true }` explícitos |

**Corrección importante:** el endpoint correcto incluye `/v1/`: `https://api.groq.com/openai/v1/audio/transcriptions`. Sin `/v1/` la petición falla (404).

---

## 1. Groq Speech-to-Text

### 1.1 Endpoint y modelos (verificado en docs oficiales)

- **Endpoint:** `POST https://api.groq.com/openai/v1/audio/transcriptions` (fuente: https://console.groq.com/docs/speech-to-text)
- **Autenticación:** cabecera `Authorization: Bearer $GROQ_API_KEY`
- **Modelo recomendado:** `whisper-large-v3-turbo` — 0,04 $/hora, 216x tiempo real, multilingüe. Alternativa de máxima precisión: `whisper-large-v3` (0,111 $/hora, 189x). `distil-whisper-large-v3-en` fue retirado en agosto de 2025: no usarlo.

### 1.2 Parámetros válidos (tabla oficial)

| Parámetro | Tipo | Valor a usar | Notas |
|---|---|---|---|
| `file` | binario | requerido salvo que se use `url` | multipart/form-data |
| `url` | string | URL pública del audio (o Base64URL) | alternativa a `file`; Groq lo descarga directamente |
| `model` | string | `"whisper-large-v3-turbo"` | requerido |
| `language` | string | `"es"` | ISO-639-1; mejora precisión y latencia frente a autodetección |
| `response_format` | string | `"verbose_json"` | `json` \| `verbose_json` \| `text`. **No existen `srt` ni `vtt`**: el SRT se sintetiza en cliente desde los segmentos |
| `timestamp_granularities[]` | array | `["segment"]` (o `["word","segment"]`) | solo con `verbose_json`; `segment` = metadatos completos, `word` = palabra/inicio/fin |
| `temperature` | float | `0` | rango 0–1; la doc recomienda el valor por defecto 0 |
| `prompt` | string | opcional | guía de estilo/ortografía, **máx. 224 tokens**, en el mismo idioma del audio |

En multipart, `timestamp_granularities[]` se envía como campo repetido (`form.append("timestamp_granularities[]", "segment")` y opcionalmente `"word"`).

### 1.3 Límites reales (docs oficiales)

- **Tamaño máximo de archivo: 25 MB (capa gratuita), 100 MB (capa dev).** Si se supera, Groq devuelve error; la app debe validar antes de enviar.
- **"Max Attachment File Size": 25 MB** — para archivos mayores, usar el parámetro `url` en lugar de subir bytes.
- **Duración mínima facturable: 10 segundos** por petición (aunque el audio dure 2 s, se descuentan 10 s de cuota).
- **Duración mínima del archivo: 0,01 s.**
- **Formatos aceptados:** `flac`, `mp3`, `mp4`, `mpeg`, `mpga`, `m4a`, `ogg`, `wav`, `webm`. Una sola pista (en archivos multipista solo se transcribe la primera).
- Groq **remuestrea a 16 kHz mono** internamente; para archivos grandes la doc recomienda pre-convertir a FLAC 16 kHz mono para reducir tamaño sin pérdida (hacerlo en el navegador con Web Audio antes de enviar es una optimización válida, no obligatoria).

### 1.4 Límites de tasa en capa gratuita (verificado en múltiples fuentes 2026 que citan console.groq.com/docs/rate-limits)

Para `whisper-large-v3-turbo` y `whisper-large-v3` en el plan gratuito:

| Límite | Valor | Significado práctico |
|---|---|---|
| RPM | **20** | 20 peticiones/minuto |
| RPD | **2.000** | 2.000 peticiones/día |
| ASH | **7.200** | 7.200 segundos de audio/hora = 2 h de audio por hora |
| ASD | **28.800** | 28.800 segundos de audio/día = 8 h de audio al día |

Notas:
- Los límites son **por organización**, no por clave: crear varias claves no multiplica la cuota.
- El 429 no distingue qué techo se ha alcanzado; respetar la cabecera `retry-after` y aplicar backoff exponencial.
- En plan dev (pago): `whisper-large-v3-turbo` sube a 400 RPM / 400K ASH (verificar siempre en la consola de Groq, los límites cambian).
- Se han reportado 500 intermitentes en el endpoint: implementar reintento (2 intentos con backoff) es obligatorio, no opcional.

### 1.5 Ejemplo: Vercel Function Node con fetch + FormData (`api/transcribir.ts`)

```ts
// api/transcribir.ts — Node.js Serverless Function (Vercel)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Busboy from 'busboy';

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MAX_DIRECT_BYTES = 4 * 1024 * 1024; // ver sección 3: umbral Blob

type ArchivoSubido = { buffer: Buffer; filename: string; mimeType: string };

// Parsea multipart en streaming con busboy. En Vercel Functions Node,
// `req` es un IncomingMessage crudo: NO hay bodyParser automático,
// se puede hacer req.pipe(busboy) directamente.
function parseMultipart(req: VercelRequest): Promise<{ fields: Record<string, string>; file: ArchivoSubido | null }> {
  return new Promise((resolve, reject) => {
    const fields: Record<string, string> = {};
    let file: ArchivoSubido | null = null;
    const chunks: Buffer[] = [];
    let fileInfo = { filename: 'audio', mimeType: 'application/octet-stream' };

    const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_DIRECT_BYTES } });
    bb.on('file', (_name, stream, info) => {
      fileInfo = { filename: info.filename || 'audio', mimeType: info.mimeType || 'application/octet-stream' };
      stream.on('data', (d: Buffer) => chunks.push(d));
      stream.on('limit', () => reject(Object.assign(new Error('PAYLOAD_TOO_LARGE'), { status: 413 })));
      stream.on('end', () => { file = { buffer: Buffer.concat(chunks), ...fileInfo }; });
    });
    bb.on('field', (name, val) => { fields[name] = val; });
    bb.on('error', reject);
    bb.on('close', () => resolve({ fields, file }));
    req.pipe(bb);
  });
}

async function transcribirConGroq(apiKey: string, form: FormData): Promise<Response> {
  return fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    // Nunca exponer el motivo interno al detalle; mensaje en español para el usuario.
    return res.status(503).json({ error: 'El servicio de transcripción no está configurado. Inténtalo más tarde.' });
  }

  try {
    const contentType = req.headers['content-type'] || '';
    const form = new FormData();
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', 'es');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    form.append('temperature', '0');

    if (contentType.includes('multipart/form-data')) {
      // Ruta A: archivo pequeño enviado directamente (≤ 4 MB)
      const { file } = await parseMultipart(req);
      if (!file) return res.status(400).json({ error: 'No se recibió ningún archivo de audio.' });
      form.append('file', new Blob([file.buffer], { type: file.mimeType }), file.filename);
    } else {
      // Ruta B: JSON { blobUrl } — archivo grande vía Vercel Blob.
      // Groq descarga la URL directamente: la Function no toca los bytes.
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const blobUrl = body?.blobUrl;
      if (typeof blobUrl !== 'string' || !blobUrl.startsWith('https://')) {
        return res.status(400).json({ error: 'Falta la URL del archivo de audio.' });
      }
      form.append('url', blobUrl);
    }

    const groqRes = await transcribirConGroq(apiKey, form);

    if (groqRes.status === 429) {
      return res.status(429).json({ error: 'El servicio de transcripción está saturado. Espera unos segundos y pulsa Reintentar.' });
    }
    if (!groqRes.ok) {
      const detalle = await groqRes.text().catch(() => '');
      console.error('[transcribir] Groq error', groqRes.status, detalle.slice(0, 500));
      return res.status(502).json({ error: 'No se pudo transcribir el audio. Comprueba tu conexión y pulsa Reintentar.' });
    }

    const data = await groqRes.json();
    // data = { text, segments: [{ id, start, end, text, ... }], ... }
    return res.status(200).json(data);
  } catch (err: any) {
    if (err?.status === 413 || err?.message === 'PAYLOAD_TOO_LARGE') {
      return res.status(413).json({ error: 'El archivo es demasiado grande para este método de subida. Vamos a utilizar la carga optimizada.' });
    }
    console.error('[transcribir] error inesperado', err);
    return res.status(500).json({ error: 'Ocurrió un error inesperado al transcribir. Pulsa Reintentar.' });
  }
}
```

Notas del snippet:
- `verbose_json` devuelve `{ text, segments: [{ id, seek, start, end, text, tokens, temperature, avg_logprob, compression_ratio, no_speech_prob }] }`. Con `timestamp_granularities[] = word` además hay `words: [{ word, start, end }]` por segmento.
- El SRT se genera en cliente: por cada segmento, `HH:MM:SS,mmm --> HH:MM:SS,mmm` + texto.
- Si se quiere pedir también `word`, añadir otro `form.append('timestamp_granularities[]', 'word')`.

---

## 2. Vercel Functions

### 2.1 Límite del cuerpo de la petición: 4,5 MB en todos los planes

- **Request body máximo: 4,5 MB** y **response body máximo: 4,5 MB**, en Hobby, Pro y Enterprise (fuente: vercel.com/docs/functions/limitations, verificado 2026-09-08 por terceros; múltiples casos reales de `413 FUNCTION_PAYLOAD_TOO_LARGE` en producción).
- El rechazo ocurre **en el proxy, antes de que el handler se ejecute**: la Function no puede interceptarlo ni personalizar el mensaje. Por eso el **cliente debe validar el tamaño antes de enviar** y elegir la ruta Blob.
- El límite aplica igual a la respuesta: un `verbose_json` con timestamps de un audio de 25 MB cabe de sobra, pero no devolver nunca el audio por la Function.

### 2.2 Recibir `multipart/form-data`: `busboy@1.6.0`

- **Recomendada: `busboy` 1.6.0** (streaming, ~sin dependencias, API estable). Alternativa mantenida: `@fastify/busboy` (fork usado por Fastify). `formidable` es más pesada y escribe a disco por defecto: evitarla en serverless.
- En Functions Node de Vercel **no hay bodyParser automático** (eso solo existe en Next.js Pages API): `req` es el stream crudo y `req.pipe(busboy)` funciona directamente. Ver snippet de `parseMultipart` en 1.5.
- Poner siempre `limits: { files: 1, fileSize: ... }` y validar MIME/extensión en el evento `file` (no fiarse del `Content-Type` declarado sin más; lista blanca de extensiones).

### 2.3 `maxDuration` recomendado

- Con Fluid Compute (por defecto en proyectos nuevos desde 2025-04-23): **Hobby: 300 s por defecto y como máximo**; Pro/Enterprise: 300 s por defecto, 800 s máximo (1.800 s en beta opt-in).
- Para una transcripción, el trabajo pesado lo hace Groq (216x tiempo real: 25 MB ≈ minutos de audio se transcriben en segundos). El cuello es la **subida** del cliente, que no consume duración de la Function (el reloj cuenta desde que el handler empieza, tras recibir el cuerpo completo).
- **Recomendación:** no tocar `maxDuration` (300 s en Hobby cubre de sobra) o fijar `120` en `vercel.json` para fallar rápido ante cuelgues. En Functions Node puras (`api/*.ts` en un proyecto Vite) `maxDuration` **no** se exporta desde el código (eso es de Next.js App Router): se configura en `vercel.json`:

```json
{
  "functions": {
    "api/transcribir.ts": { "maxDuration": 120 },
    "api/blob/token.ts": { "maxDuration": 30 }
  }
}
```

### 2.4 Patrón: Function → Blob URL → Groq (sin llenar disco efímero)

La vía óptima **no descarga nada**: Groq acepta el parámetro `url` (ver 1.5, Ruta B). Requisitos:

1. El blob debe ser **público** (`access: 'public'` en el client upload) para que Groq pueda descargarlo. Alternativa: URL firmada temporal.
2. Tras recibir la transcripción, la Function (o el cliente) ejecuta `del(blobUrl)` para no almacenar grabaciones de usuarios.
3. Si por política el blob debe ser **privado**, entonces sí hay que hacer streaming: `fetch(blobUrl)` → su `body` (ReadableStream) → re-empaquetar en multipart hacia Groq. En Node 20+ se puede construir el `FormData` con un `Blob` a partir del stream consumido en memoria, o mejor: usar `fetch` con `duplex: 'half'` y un cuerpo stream. Es más frágil; preferir la vía `url` + blob público efímero.

Límite a recordar: aunque el blob evite el tope de 4,5 MB de Vercel, **Groq sigue limitando a 25 MB en capa gratuita** (100 MB en dev). El cliente debe rechazar > 25 MB con mensaje en español antes de subir nada.

---

## 3. Vercel Blob (client upload)

Versión verificada: `@vercel/blob@2.8.0` (cambios relevantes: desde 0.12.0, las utilidades de cliente viven en `@vercel/blob/client`: `upload`, `handleUpload`, `generateClientTokenFromReadWriteToken`; `handleBlobUpload` fue renombrado).

### 3.1 Cómo no exponer `BLOB_READ_WRITE_TOKEN`

El token **solo vive en el servidor** (variable de entorno de Vercel). El navegador nunca lo ve. Flujo:

1. El navegador pide a `/api/blob/token` un **token de cliente** indicando `pathname` (y opcionalmente `clientPayload`).
2. El servidor valida (tamaño, tipo MIME, caducidad) y responde `{ clientToken }` firmado con `BLOB_READ_WRITE_TOKEN`.
3. `upload()` del SDK usa ese token para subir **directo del navegador a Blob**, sin pasar por la Function.

`onBeforeGenerateToken` es el punto de control: `allowedContentTypes`, `maximumSizeInBytes`, `validUntil`, `addRandomSuffix`, `tokenPayload`.

### 3.2 Endpoint de token en Function Node pura (`api/blob/token.ts`)

```ts
// api/blob/token.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';

const TIPOS_PERMITIDOS = [
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac',
  'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/flac',
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'La carga optimizada no está disponible. Inténtalo más tarde.' });
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const filename = String(body?.filename || 'audio').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const contentType = String(body?.contentType || '');
  if (!TIPOS_PERMITIDOS.includes(contentType)) {
    return res.status(400).json({ error: 'Tipo de archivo no compatible.' });
  }

  const pathname = `transcripciones/${Date.now()}-${Math.random().toString(36).slice(2)}-${filename}`;
  const { clientToken } = await generateClientTokenFromReadWriteToken({
    pathname,
    onBeforeGenerateToken: async () => ({
      allowedContentTypes: TIPOS_PERMITIDOS,
      maximumSizeInBytes: 25 * 1024 * 1024, // tope Groq capa gratuita
      addRandomSuffix: true,
      validUntil: Date.now() + 10 * 60 * 1000, // el token caduca en 10 minutos
    }),
  });
  return res.status(200).json({ clientToken, pathname });
}
```

> Nota: `generateClientTokenFromReadWriteToken` es la vía simple para Functions Node puras. `handleUpload({ body, request, onBeforeGenerateToken, onUploadCompleted })` es la alternativa completa (gestiona el handshake `blob.generate-client-token`/`blob.upload-completed` y el webhook de subida), documentada para Next.js; en Node puro obliga a reconstruir un `Request` y traducir su `Response`, por eso se recomienda el token directo.

### 3.3 Subida desde el navegador + transcripción + borrado

```ts
// Cliente (navegador)
import { upload } from '@vercel/blob/client';

async function transcribirArchivoGrande(file: File): Promise<Transcripcion> {
  // 1. Pedir token de subida (el servidor valida tipo/tamaño sin ver los bytes)
  const tokRes = await fetch('/api/blob/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type }),
  });
  if (!tokRes.ok) throw new Error('No se pudo preparar la carga optimizada.');
  const { clientToken, pathname } = await tokRes.json();

  // 2. Subida directa navegador → Blob (onUploadProgress disponible)
  const blob = await upload(pathname, file, {
    access: 'public', // necesario para que Groq pueda descargarlo vía `url`
    handleUploadUrl: '/api/blob/token', // upload() pedirá { clientToken } aquí
    clientPayload: JSON.stringify({ proposito: 'transcripcion' }),
  });
  // Nota: cuando se usa handleUploadUrl, upload() llama al endpoint con
  // { type: 'blob.generate-client-token', payload: { pathname, clientPayload } }
  // y espera { clientToken }. Nuestro endpoint debe responder a ese formato
  // (ver variante con handleUpload si se prefiere el handshake completo).

  try {
    // 3. La Function ordena la transcripción pasando la URL a Groq (cuerpo JSON, bytes insignificantes)
    const tRes = await fetch('/api/transcribir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blobUrl: blob.url }),
    });
    if (!tRes.ok) throw new Error('No se pudo transcribir el audio.');
    return await tRes.json();
  } finally {
    // 4. Borrar el blob: las grabaciones no se almacenan indefinidamente.
    // `del` requiere el token de servidor → hacerlo en /api/blob/borrar.
    await fetch('/api/blob/borrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: blob.url }),
    }).catch(() => {});
  }
}
```

```ts
// api/blob/borrar.ts — el borrado SIEMPRE en servidor
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { del } from '@vercel/blob';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const url = body?.url;
  if (typeof url !== 'string' || !url.startsWith('https://')) return res.status(400).end();
  try { await del(url); } catch (e) { console.error('[blob/borrar]', e); }
  return res.status(200).json({ ok: true });
}
```

### 3.4 Umbral y flujo completo paso a paso

**Umbral recomendado: 4 MB.**
- El tope duro de Vercel es 4,5 MB *incluyendo* el overhead del multipart (cabeceras, boundary, codificación). 4 MB deja ~0,5 MB de margen: ningún archivo legítimo de ≤ 4 MB fallará con 413.
- Por encima de 4 MB (hasta 25 MB): ruta Blob.

**Flujo completo:**

1. Usuario selecciona/graba un audio. El cliente mide `file.size`.
2. Si `size <= 4 MB`: `POST multipart/form-data` a `/api/transcribir` (Ruta A). Estado: "Transcribiendo audio...".
3. Si `4 MB < size <= 25 MB`: informar —"El archivo es grande. Vamos a utilizar la carga optimizada: se subirá temporalmente de forma segura y se eliminará tras la transcripción."— y ejecutar la secuencia de 3.3 (token → upload directo → `/api/transcribir` con `{ blobUrl }` → `del`).
4. Si `size > 25 MB`: rechazar en cliente —"El archivo supera el límite de 25 MB del servicio de transcripción."— sin subir nada. (Opción futura: troceo en cliente.)
5. La Function valida `GROQ_API_KEY` (503 en español si falta), llama a Groq con `language: "es"` + `verbose_json` + `segment`, traduce errores (429/5xx → mensajes en español + botón Reintentar).
6. El cliente muestra el editor con el texto, timestamps asociados, y botones Copiar / Descargar TXT / Descargar SRT / Volver a escuchar.
7. Sin conexión a internet: la transcripción no puede funcionar (Groq es remota); mostrarlo explícitamente, no un error genérico.

**Coste/límites de Blob a tener en cuenta:** Blob está disponible en todos los planes; el client upload evita que los bytes pasen por la Function (sin coste de invocación por MB). La subida directa admite archivos muy grandes (documentado "hasta 5 TB" en client upload), pero nuestro tope funcional lo marca Groq (25 MB).

---

## 4. Exportación de audio en el navegador (todo en Web Worker)

Principio: el worker recibe `Float32Array` por canal (+ sampleRate) vía `postMessage` con transferables, codifica y devuelve un `Blob`. Nada de esto toca la red.

### 4.1 MP3 — `wasm-media-encoders@0.7.0` ✅ recomendado

- **Por qué este y no `lamejs`:** `lamejs@1.2.1` (original) está abandonado desde hace años; el fork mantenido `@breezystack/lamejs@1.2.7` es JS puro (lento) y exige alimentar a mano en bloques de 1152 muestras sin remuestreo. `wasm-media-encoders` compila el **LAME de referencia a WASM**: MP3 = 130 KiB de WASM (66 KiB gzip), OGG = 440 KiB (158 KiB gzip); tree-shaking separa ambos.
- API: `createMp3Encoder()` → `configure({ sampleRate, channels, bitrate | vbrQuality })` → `encode(Float32Array[])` (¡copiar el `Uint8Array` devuelto antes de la siguiente llamada: sigue siendo propiedad del encoder!) → `finalize()`.
- Bitrates CBR válidos: 8, 16, 24, 32, 40, 48, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320. VBR: `vbrQuality` 0.0 (mejor) – 9.999.

**Calidades propuestas (voz + música, estéreo o mono):**

| Calidad | MP3 | OGG Vorbis |
|---|---|---|
| Ligera | CBR **64 kbps** | `vbrQuality: 0` (~64 kbps) |
| Estándar | CBR **128 kbps** | `vbrQuality: 3.0` (~112 kbps, valor por defecto del encoder) |
| Alta | CBR **192 kbps** | `vbrQuality: 5.0` (~160 kbps) |

```ts
// worker mp3/ogg (resumen)
import { createMp3Encoder, createOggEncoder } from 'wasm-media-encoders';

export async function codificarMp3(canales: Float32Array[], sampleRate: number, bitrateKbps: number): Promise<Blob> {
  const encoder = await createMp3Encoder();
  encoder.configure({ sampleRate, channels: canales.length, bitrate: bitrateKbps });
  const partes: Uint8Array[] = [];
  const BLOQUE = 115200; // ~2,4 s a 48 kHz; encode() acepta cualquier longitud
  for (let i = 0; i < canales[0].length; i += BLOQUE) {
    const trozo = canales.map(c => c.slice(i, i + BLOQUE));
    const out = encoder.encode(trozo);
    if (out.length) partes.push(out.slice()); // copiar: el buffer es del encoder
  }
  const fin = encoder.finalize();
  if (fin.length) partes.push(fin.slice());
  return new Blob(partes as BlobPart[], { type: 'audio/mpeg' });
}
```

- El WASM puede cargarse desde el propio paquete (`wasm-media-encoders/wasm/mp3.wasm`, `ogg.wasm`) servido por Vite como asset estático, o inline en base64 (aumenta el bundle ~30 %): preferir asset separado + `import.meta.url` y precarga bajo demanda (solo cuando el usuario elige MP3/OGG).
- `outputSampleRate` opcional si se quiere forzar 44100/48000.

### 4.2 OGG Vorbis — `wasm-media-encoders@0.7.0` (mismo paquete) ✅

- **No existe `ogg-vorbis-encoder-js` en npm** (verificado: 404 en registry.npmjs.org el 2026-10-06). La opción actual es `createOggEncoder()` del mismo paquete.
- Solo admite VBR (`vbrQuality` −1.0 a 10.0); el resto de la API es idéntica al MP3. Calidad Alta `6.0` ≈ 192 kbps en estéreo 44,1 kHz.

### 4.3 WAV — codificación manual ✅ (sin dependencias)

WAV PCM 16-bit: cabecera RIFF de 44 bytes + muestras intercaladas. Enfoque confirmado y estándar:

```ts
export function codificarWav(canales: Float32Array[], sampleRate: number): Blob {
  const numCanales = canales.length;
  const numMuestras = canales[0].length;
  const bytesPorMuestra = 2;
  const bloqueAlineacion = numCanales * bytesPorMuestra;
  const buffer = new ArrayBuffer(44 + numMuestras * bloqueAlineacion);
  const vista = new DataView(buffer);

  const escribirTexto = (offset: number, texto: string) => {
    for (let i = 0; i < texto.length; i++) vista.setUint8(offset + i, texto.charCodeAt(i));
  };
  escribirTexto(0, 'RIFF');
  vista.setUint32(4, 36 + numMuestras * bloqueAlineacion, true);
  escribirTexto(8, 'WAVE');
  escribirTexto(12, 'fmt ');
  vista.setUint32(16, 16, true);            // tamaño del subchunk fmt
  vista.setUint16(20, 1, true);             // PCM
  vista.setUint16(22, numCanales, true);
  vista.setUint32(24, sampleRate, true);
  vista.setUint32(28, sampleRate * bloqueAlineacion, true); // byte rate
  vista.setUint16(32, bloqueAlineacion, true);
  vista.setUint16(34, 16, true);            // bits por muestra
  escribirTexto(36, 'data');
  vista.setUint32(40, numMuestras * bloqueAlineacion, true);

  let offset = 44;
  for (let i = 0; i < numMuestras; i++) {
    for (let c = 0; c < numCanales; c++) {
      const m = Math.max(-1, Math.min(1, canales[c][i]));
      vista.setInt16(offset, m < 0 ? m * 0x8000 : m * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
```

- Las calidades Ligera/Estándar/Alta en WAV no cambian el bitrate (PCM es sin compresión): mapear a **sampleRate de salida** si se quiere diferenciar — p. ej. Ligera 22050 Hz / Estándar 44100 Hz / Alta 48000 Hz — o simplemente no ofrecer selector de calidad para WAV (es honesto: el formato no tiene calidades).

### 4.4 M4A/AAC — `@ffmpeg/ffmpeg@0.12.15` + `@ffmpeg/core@0.12.10` ⚠️ con condiciones

- El core de ffmpeg.wasm **incluye el codificador AAC nativo** (`-c:a aac`): no hace falta ningún paquete extra. Verificado en guías de implementación 2026.
- **Peso: ~31–33 MB** de descarga del core (WASM). Carga bajo demanda en el worker la primera vez que el usuario elige M4A; cachear en Cache Storage/IndexedDB para usos posteriores. El core single-thread **no exige SharedArrayBuffer ni cabeceras COOP/COEP**.
- `libxaac-wasm` (encoder AAC-LC mínimo, Apache-2.0, sin COOP/COEP) existe solo en GitHub —**no está publicado en npm** (404 verificado)—: no usarlo como dependencia salvo vendorización manual, que añade riesgo de mantenimiento.
- Alternativa nativa: `AudioEncoder` de WebCodecs **no** codifica AAC en Firefox ni en Linux: no es fiable como única vía.

```ts
// worker m4a (resumen) — solo se importa al elegir M4A
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

const ffmpeg = new FFmpeg();
await ffmpeg.load({
  coreURL: await toBlobURL('/ffmpeg/ffmpeg-core.js', 'text/javascript'),
  wasmURL: await toBlobURL('/ffmpeg/ffmpeg-core.wasm', 'application/wasm'),
});
// entrada: WAV generado con codificarWav()
await ffmpeg.writeFile('entrada.wav', await fetchFile(new Blob([wav]))); // o Uint8Array
await ffmpeg.exec(['-i', 'entrada.wav', '-vn', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-movflags', '+faststart', 'salida.m4a']);
const datos = await ffmpeg.readFile('salida.m4a');
await ffmpeg.deleteFile('entrada.wav');
await ffmpeg.deleteFile('salida.m4a');
const blob = new Blob([datos], { type: 'audio/mp4' });
```

- Bitrates AAC por calidad: Ligera 64k / Estándar 128k / Alta 192k (`-b:a 64k|128k|192k`).
- **Decisión:** ofrecer M4A solo si se acepta la descarga bajo demanda de ~31 MB con su barra de progreso ("Preparando el conversor de audio por primera vez..."). Si no, no mostrar el formato (regla: no mostrar formatos que no se puedan generar de verdad).

### 4.5 Resumen de paquetes (versiones exactas, verificadas 2026-10-06)

| Paquete | Versión | Uso |
|---|---|---|
| `wasm-media-encoders` | **0.7.0** | MP3 (LAME) + OGG Vorbis en worker |
| `@ffmpeg/ffmpeg` | **0.12.15** | M4A/AAC (solo si se ofrece M4A) |
| `@ffmpeg/core` | **0.12.10** | core WASM de ffmpeg (~31 MB, lazy) |
| `@ffmpeg/util` | **0.12.2** | `fetchFile`, `toBlobURL` |
| `@vercel/blob` | **2.8.0** | client upload + `del` |
| `busboy` | **1.6.0** | parsear multipart en la Function |
| `@vercel/analytics` | (la última al instalar) | Analytics (lo inyecta Vercel; el usuario lo activa en el dashboard) |
| `vite-plugin-pwa` | (la última al instalar) | PWA |

---

## 5. MediaRecorder y getUserMedia

### 5.1 `mimeType` soportados por navegador (verificado con pruebas en motores reales, 2026)

| `mimeType` | Chrome/Edge | Firefox | Safari |
|---|---|---|---|
| `audio/webm;codecs=opus` | ✅ sí | ✅ sí | ❌ no |
| `audio/ogg;codecs=opus` | ❌ no | ✅ sí | ❌ no |
| `audio/webm` | ✅ sí | ✅ sí | ❌ no |
| `audio/mp4` | ✅ sí | ❌ no | ✅ sí (única opción) |

**Orden de preferencia recomendado** (primero que devuelva `true` en `MediaRecorder.isTypeSupported`):

```ts
const CANDIDATOS = [
  'audio/webm;codecs=opus', // Chrome/Edge/Firefox: Opus, la mejor calidad/tamaño
  'audio/ogg;codecs=opus',  // Firefox alternativo
  'audio/webm',             // fallback Chromium/Firefox
  'audio/mp4',              // Safari (AAC en MP4)
];
const mimeType = CANDIDATOS.find(t => window.MediaRecorder?.isTypeSupported(t)) ?? '';
const recorder = new MediaRecorder(stream, {
  ...(mimeType ? { mimeType } : {}),
  audioBitsPerSecond: 128_000,
});
```

Notas:
- Todos estos contenedores/codecs los acepta Groq directamente (ogg, webm, mp4/m4a están en su lista), así que la grabación puede enviarse a transcripción **sin conversión**.
- Safari solo graba `audio/mp4` (AAC): funciona, pero el archivo pesa más que Opus a igual calidad.
- `audio/wav` **no** es un mimeType real de MediaRecorder (aunque aparezca en ejemplos antiguos): no incluirlo en la lista.
- Para "volver a escuchar" y para el mezclador, el Blob resultante se reproduce con `<audio>`/`AudioContext.decodeAudioData` sin problema en los tres navegadores.

### 5.2 `getUserMedia`: constraints recomendados

```ts
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,   // cancelación de eco
    noiseSuppression: true,    // supresión de ruido
    autoGainControl: true,     // control automático de ganancia
    // Opcionales según necesidad:
    // sampleRate: 48000,
    // channelCount: 1,        // mono: la mitad de datos, ideal para voz
  }
});
```

- **Poner los tres en `true` explícitamente**: no depender de los valores por defecto del navegador (Chrome/Firefox los activan por defecto al pedir `audio: true`, pero hacerlo explícito es determinista y documenta la intención; Safari los respeta cuando se indican).
- `channelCount: 1` es recomendable para voz (menos datos, Groq lo pasa a mono de todos modos), pero algunos dispositivos lo ignoran: no marcarlo como `exact` para no provocar `OverconstrainedError`.
- **Permiso:** llamar a `getUserMedia` solo desde un gesto de usuario ("Empezar a grabar"); si el permiso se deniega una vez, el navegador recordará la decisión y habrá que guiar al usuario a los ajustes del sitio (mensaje específico, no genérico).
- Para el osciloscopio/nivel del micrófono: `MediaStreamAudioSourceNode` + `AnalyserNode` sobre el mismo stream, en paralelo a MediaRecorder (no interfiere).

---

## 6. Casos borde y riesgos

1. **Sin `GROQ_API_KEY`**: la Function responde 503 con mensaje en español ("El servicio de transcripción no está configurado..."). El frontend debe detectarlo y explicar que la transcripción requiere conexión y configuración, sin mostrar el nombre de la variable ni detalles técnicos.
2. **`vite dev` sin `/api`**: `npm run dev` no sirve las Functions; las llamadas a `/api/*` darán 404. Para desarrollo local con API usar **`vercel dev`** (requiere `vercel env pull` para `GROQ_API_KEY`/`BLOB_READ_WRITE_TOKEN`). Documentarlo en el README.
3. **413 por encima del handler**: como Vercel rechaza > 4,5 MB antes del código, el cliente valida el tamaño **antes** de enviar y elige la ruta Blob. Nunca confiar en capturar el 413 en la Function.
4. **Groq 429**: respetar `retry-after`, backoff exponencial, máximo 2-3 reintentos; mensaje "servicio saturado, pulsa Reintentar".
5. **Groq 500 intermitentes**: reportados por usuarios; el reintento con backoff los mitiga.
6. **Límites de cuota gratuita**: 20 RPM / 2.000 RPD / 7.200 s-hora / 28.800 s-día **por organización**. Con varios usuarios simultáneos el techo real lo marcan los segundos de audio, no las peticiones. Si la app crece, pasar a plan dev de Groq (los límites suben a 400 RPM / 400K ASH en turbo).
7. **Facturación mínima**: cada petición descuenta mínimo 10 s de cuota aunque el audio dure 2 s.
8. **Blob sin `BLOB_READ_WRITE_TOKEN`**: el endpoint `/api/blob/token` responde 503 y el frontend deshabilita la ruta optimizada con mensaje claro; los archivos ≤ 4 MB siguen funcionando.
9. **Privacidad del blob público**: la URL pública existe solo durante la transcripción y se borra con `del()` en `finally`. El `pathname` incluye sufijo aleatorio (`addRandomSuffix: true`) para que no sea adivinable. Explicarlo en "Tu privacidad".
10. **Respuesta > 4,5 MB**: no devolver nunca audio por la Function; el JSON de `verbose_json` de un audio de 25 MB está muy por debajo del límite.
11. **`timestamp_granularities: ["word"]`** multiplica el tamaño de la respuesta; para SRT por segmentos basta `["segment"]`.
12. **ffmpeg.wasm en móviles**: 31 MB + compilación WASM puede fallar por memoria en gamas bajas; si se ofrece M4A, capturar el error y sugerir MP3/OGG/WAV como alternativa.
13. **Safari y Service Worker**: el worker de exportación es un Web Worker clásico (no depende del SW); los `.wasm` servidos como assets deben tener MIME `application/wasm` (Vercel lo sirve correctamente por defecto).
14. **IndexedDB lleno**: envolver guardados en try/catch de `QuotaExceededError` y avisar "El almacenamiento local está lleno; elimina trabajos antiguos en Mis audios".
15. **`temperature`**: dejar en 0 (recomendación oficial); subirla solo aumenta creatividad/halucinaciones en la transcripción.
16. **Idioma fijo**: enviar siempre `language: "es"` (sin selector de idioma en la UI, según spec). La autodetección es más lenta y menos precisa.

---

## 7. Checklist de implementación derivada

- [ ] `api/transcribir.ts` (Ruta A multipart con busboy + Ruta B `{ blobUrl }` con parámetro `url` de Groq)
- [ ] `api/blob/token.ts` (`generateClientTokenFromReadWriteToken`, validación de tipo/tamaño, `validUntil` 10 min)
- [ ] `api/blob/borrar.ts` (`del` en servidor)
- [ ] `vercel.json` con `maxDuration` por función
- [ ] `.env.example` con `GROQ_API_KEY=` y `BLOB_READ_WRITE_TOKEN=` (sin valores reales)
- [ ] Worker `exportMp3`/`exportOgg` con `wasm-media-encoders@0.7.0` (transferables, progreso por bloques)
- [ ] `codificarWav` manual (44 bytes RIFF + PCM16)
- [ ] Worker `exportM4a` con `@ffmpeg/ffmpeg@0.12.15` lazy (~31 MB, barra de progreso, cache)
- [ ] `MediaRecorder` con detección de mimeType en el orden indicado + `audioBitsPerSecond: 128000`
- [ ] `getUserMedia` con los tres procesados en `true` explícitos + gestión de `NotAllowedError`/`NotFoundError`/`OverconstrainedError` con mensajes en español
- [ ] Generador SRT desde `segments` (y `words` si se pide granularidad de palabra)
- [ ] Mensajes de error en español para: 413, 429, 5xx de Groq, sin clave, sin conexión, archivo > 25 MB, tipo no soportado, IndexedDB lleno
- [ ] README en español con: `vercel dev` para API local, variables de entorno, límites (4 MB / 25 MB), licencias de encoders (LAME: LGPL; Vorbis: BSD; ffmpeg.wasm: GPL/LGPL según build — verificar la licencia del core 0.12.10 antes de publicar)
