/**
 * Copia el core de ffmpeg.wasm a public/ffmpeg/ para servirlo en local.
 * Se ejecuta como parte del build (ver package.json).
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const origen = join(raiz, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm');
const destino = join(raiz, 'public', 'ffmpeg');

mkdirSync(destino, { recursive: true });
copyFileSync(join(origen, 'ffmpeg-core.js'), join(destino, 'ffmpeg-core.js'));
copyFileSync(join(origen, 'ffmpeg-core.wasm'), join(destino, 'ffmpeg-core.wasm'));
console.log('Core de ffmpeg.wasm copiado a public/ffmpeg/');
