/**
 * POST /api/mejorar-texto — Función OPCIONAL con LLM (Groq): corrige la
 * puntuación y la legibilidad de una transcripción. Nunca bloquea las
 * funciones principales. La GROQ_API_KEY vive solo en el servidor.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODELO = 'llama-3.3-70b-versatile';
const MAX_CARACTERES = 20000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  const clave = process.env.GROQ_API_KEY;
  if (!clave) {
    return res.status(503).json({
      codigo: 'groq-sin-configurar',
      error: 'Esta función opcional no está configurada.',
    });
  }

  const body =
    typeof req.body === 'string' ? JSON.parse(req.body) : (req.body as Record<string, unknown>);
  const texto = String(body?.texto || '');
  if (!texto.trim() || texto.length > MAX_CARACTERES) {
    return res.status(400).json({ error: 'Texto no válido.' });
  }

  try {
    const groqRes = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clave}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODELO,
        temperature: 0.1,
        max_tokens: Math.min(8000, texto.length * 2),
        messages: [
          {
            role: 'system',
            content:
              'Eres un corrector de transcripciones en español. Corrige la puntuación, las mayúsculas y los errores evidentes de la transcripción que te den, sin cambiar su significado ni añadir contenido nuevo. Devuelve solo el texto corregido, sin explicaciones.',
          },
          { role: 'user', content: texto },
        ],
      }),
    });

    if (!groqRes.ok) {
      console.error('[mejorar-texto] Groq', groqRes.status);
      return res.status(502).json({
        codigo: 'groq-fallo',
        error: 'No se pudo mejorar el texto ahora mismo.',
      });
    }
    const datos = (await groqRes.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const corregido = datos.choices?.[0]?.message?.content?.trim();
    if (!corregido) {
      return res.status(502).json({ codigo: 'groq-fallo', error: 'No se pudo mejorar el texto.' });
    }
    return res.status(200).json({ texto: corregido });
  } catch (error) {
    console.error('[mejorar-texto] inesperado', error);
    return res.status(500).json({ codigo: 'groq-fallo', error: 'No se pudo mejorar el texto.' });
  }
}
