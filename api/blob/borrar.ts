/**
 * POST /api/blob/borrar — Elimina un blob temporal (p. ej. tras una transcripción).
 * El borrado siempre ocurre en el servidor: el navegador nunca ve el token.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { del } from '@vercel/blob';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  const body =
    typeof req.body === 'string' ? JSON.parse(req.body) : (req.body as Record<string, unknown>);
  const url = body?.url;
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    return res.status(400).json({ error: 'URL no válida.' });
  }
  try {
    await del(url);
  } catch (error) {
    // Si el borrado falla, no se bloquea al usuario: se registra y listo.
    console.error('[blob/borrar]', error);
  }
  return res.status(200).json({ ok: true });
}
