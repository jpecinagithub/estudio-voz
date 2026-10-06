/**
 * POST /api/blob/token — Genera un token de subida directa (navegador → Vercel Blob).
 *
 * Habla el protocolo que espera `upload()` de @vercel/blob/client cuando se usa
 * `handleUploadUrl`: recibe { type: 'blob.generate-client-token', payload: {...} }
 * y responde { clientToken }. El BLOB_READ_WRITE_TOKEN nunca sale del servidor.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';

const TIPOS_PERMITIDOS = [
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
];

/** Tope funcional: lo que acepta Groq en capa gratuita. */
const MAX_BYTES = 25 * 1024 * 1024;

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

function nombreSeguro(nombre: string): string {
  return nombre.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || 'audio';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({
      codigo: 'blob-no-configurado',
      error: 'La carga optimizada no está disponible. Inténtalo más tarde.',
    });
  }

  try {
    const body = leerJson(req);
    if (body.type === 'blob.upload-completed') {
      return res.status(200).json({ ok: true });
    }
    if (body.type !== 'blob.generate-client-token') {
      return res.status(400).json({ error: 'Petición no válida.' });
    }

    const payload = (body.payload as Record<string, unknown>) ?? {};
    let datosCliente: { contentType?: string; size?: number } = {};
    try {
      datosCliente = JSON.parse(String(payload.clientPayload || '{}'));
    } catch {
      datosCliente = {};
    }

    const contentType = String(datosCliente.contentType || '');
    const size = Number(datosCliente.size || 0);
    if (!TIPOS_PERMITIDOS.includes(contentType)) {
      return res.status(400).json({
        codigo: 'archivo-no-compatible',
        error: 'Este archivo no es un audio compatible.',
      });
    }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) {
      return res.status(400).json({
        codigo: 'archivo-supera-limite',
        error: 'El archivo supera el tamaño máximo de 25 MB para la transcripción.',
      });
    }

    const base = nombreSeguro(String(payload.pathname || 'audio'));
    const pathname = `transcripciones/${Date.now()}-${base}`;

    const clientToken = await generateClientTokenFromReadWriteToken({
      token: process.env.BLOB_READ_WRITE_TOKEN,
      pathname,
      allowedContentTypes: TIPOS_PERMITIDOS,
      maximumSizeInBytes: MAX_BYTES,
      addRandomSuffix: true,
      validUntil: Date.now() + 10 * 60 * 1000,
    });

    return res.status(200).json({ clientToken });
  } catch (error) {
    console.error('[blob/token]', error);
    return res.status(500).json({
      codigo: 'blob-fallo',
      error: 'No se pudo preparar la carga optimizada. Pulsa Reintentar.',
    });
  }
}
