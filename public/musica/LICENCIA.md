# Música de fondo — Licencia y procedencia

Las 5 pistas de `public/musica/` son **100% originales**: fueron compuestas y
sintetizadas por código en `scripts/generar-musica.mjs`, sin samples, sin MIDI
externos y sin material protegido por derechos de autor.

- `ambiente.mp3` — Ambiente: pads suaves y atmosféricos (síntesis aditiva).
- `piano.mp3` — Piano: melodía original con piano de síntesis aditiva.
- `chill.mp3` — Chill: base relajada con percusión y bajo sintetizados.
- `inspiracion.mp3` — Inspiración: arpegios positivos y pads.
- `acustico.mp3` — Acústico: fingerpicking con síntesis Karplus-Strong (guitarra).

Formato: MP3 128 kbps, 44,1 kHz, estéreo.
Licencia: uso libre dentro de la aplicación, sin atribución requerida.
Para regenerarlas: `npm run generar-musica`.
