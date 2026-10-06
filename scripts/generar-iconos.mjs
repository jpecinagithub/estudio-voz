/**
 * Genera los iconos PWA de Estudio Voz (PNG 192/512 + maskable) y el favicon SVG.
 * Dibujo 100% propio con matemáticas de píxeles (sin dependencias).
 *
 * Uso: npm run generar-iconos
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = join(RAIZ, 'public', 'iconos');
mkdirSync(DESTINO, { recursive: true });

/* ── PNG mínimo ─────────────────────────────────────────────── */

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozo(tipo, datos) {
  const t = Buffer.from(tipo, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(datos.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, datos])));
  return Buffer.concat([len, t, datos, crc]);
}

function aPng(ancho, alto, pixeles) {
  const firma = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // profundidad
  ihdr[9] = 6; // RGBA
  const crudo = Buffer.alloc((ancho * 4 + 1) * alto);
  for (let y = 0; y < alto; y++) {
    crudo[y * (ancho * 4 + 1)] = 0;
    pixeles[y].copy(crudo, y * (ancho * 4 + 1) + 1);
  }
  return Buffer.concat([firma, trozo('IHDR', ihdr), trozo('IDAT', deflateSync(crudo)), trozo('IEND', Buffer.alloc(0))]);
}

/* ── Dibujo del icono ───────────────────────────────────────── */

const FONDO = [13, 17, 23, 255];
const ACENTO = [61, 220, 151, 255];
const ACENTO_SUAVE = [61, 220, 151, 110];

function crearLienzo(n) {
  const filas = [];
  for (let y = 0; y < n; y++) {
    const fila = Buffer.alloc(n * 4);
    for (let x = 0; x < n; x++) {
      fila[x * 4] = FONDO[0];
      fila[x * 4 + 1] = FONDO[1];
      fila[x * 4 + 2] = FONDO[2];
      fila[x * 4 + 3] = FONDO[3];
    }
    filas.push(fila);
  }
  return filas;
}

function rectRedondeado(lienzo, n, x0, y0, x1, y1, radio, color) {
  for (let y = Math.max(0, y0); y < Math.min(n, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(n, x1); x++) {
      const dx = Math.min(x - x0, x1 - 1 - x);
      const dy = Math.min(y - y0, y1 - 1 - y);
      let dentro = true;
      if (dx < radio && dy < radio) {
        const cx = radio - dx - 1;
        const cy = radio - dy - 1;
        dentro = cx * cx + cy * cy <= radio * radio;
      }
      if (dentro) {
        const f = lienzo[y];
        // Mezcla simple sobre el fondo
        const a = color[3] / 255;
        f[x * 4] = Math.round(f[x * 4] * (1 - a) + color[0] * a);
        f[x * 4 + 1] = Math.round(f[x * 4 + 1] * (1 - a) + color[1] * a);
        f[x * 4 + 2] = Math.round(f[x * 4 + 2] * (1 - a) + color[2] * a);
      }
    }
  }
}

/** Dibuja la marca: 5 barras de onda. `escala` = tamaño relativo al lienzo. */
function dibujarMarca(lienzo, n, escala, cy, colorPrincipal, colorSecundario) {
  const alturas = [0.32, 0.58, 1.0, 0.58, 0.32];
  const anchoBarra = Math.round(n * 0.075 * escala);
  const paso = Math.round(n * 0.145 * escala);
  const totalAncho = paso * (alturas.length - 1) + anchoBarra;
  let x = Math.round((n - totalAncho) / 2);
  const maxH = n * 0.42 * escala;
  alturas.forEach((h, i) => {
    const bh = Math.round(maxH * h);
    const y0 = Math.round(cy - bh / 2);
    rectRedondeado(lienzo, n, x, y0, x + anchoBarra, y0 + bh, Math.floor(anchoBarra / 2), i === 2 ? colorPrincipal : colorSecundario);
    x += paso;
  });
}

function icono(n, maskable) {
  const lienzo = crearLienzo(n);
  if (!maskable) {
    // Esquinas redondeadas del propio icono (el resto queda transparente)
    const radio = Math.round(n * 0.22);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dx = Math.min(x, n - 1 - x);
        const dy = Math.min(y, n - 1 - y);
        if (dx < radio && dy < radio) {
          const cx = radio - dx;
          const cy = radio - dy;
          if (cx * cx + cy * cy > radio * radio) lienzo[y][x * 4 + 3] = 0;
        }
      }
    }
    dibujarMarca(lienzo, n, 1.0, n / 2, ACENTO, ACENTO_SUAVE);
  } else {
    // Maskable: fondo a sangre, marca centrada con aire
    dibujarMarca(lienzo, n, 0.62, n / 2, ACENTO, ACENTO_SUAVE);
  }
  return aPng(n, n, lienzo);
}

writeFileSync(join(DESTINO, 'icono-192.png'), icono(192, false));
writeFileSync(join(DESTINO, 'icono-512.png'), icono(512, false));
writeFileSync(join(DESTINO, 'icono-maskable-512.png'), icono(512, true));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="2" y="2" width="60" height="60" rx="14" fill="#0d1117"/>
  <g fill="#3ddc97">
    <rect x="12" y="24" width="6" height="16" rx="3"/>
    <rect x="21" y="18" width="6" height="28" rx="3" opacity="0.65"/>
    <rect x="30" y="10" width="6" height="44" rx="3"/>
    <rect x="39" y="18" width="6" height="28" rx="3" opacity="0.65"/>
    <rect x="48" y="24" width="6" height="16" rx="3"/>
  </g>
</svg>
`;
writeFileSync(join(RAIZ, 'public', 'favicon.svg'), svg);
console.log('Iconos generados en public/iconos/ + favicon.svg');
