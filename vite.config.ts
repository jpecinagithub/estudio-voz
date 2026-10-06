import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { APP_NOMBRE, APP_DESCRIPCION, COLOR_TEMA } from './src/config';

function marcaVersion(): string {
  const fecha = new Date().toISOString().slice(0, 16).replace('T', ' ');
  let commit = '';
  try {
    commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    /* sin git disponible */
  }
  return commit ? `${fecha} UTC (${commit})` : `${fecha} UTC`;
}

// https://vite.dev/config/
export default defineConfig({
  // Marca de versión visible en "Acerca de": permite saber qué despliegue
  // está ejecutando el navegador (útil tras actualizaciones).
  define: {
    __VERSION_APP__: JSON.stringify(marcaVersion()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: `${APP_NOMBRE} — Crea audio en español`,
        short_name: APP_NOMBRE,
        description: APP_DESCRIPCION,
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: COLOR_TEMA,
        theme_color: COLOR_TEMA,
        categories: ['music', 'productivity', 'utilities'],
        icons: [
          {
            src: '/iconos/icono-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/iconos/icono-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/iconos/icono-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // ffmpeg-core.wasm (32 MB), el runtime TTS (15 MB) y los modelos de voz
        // (60-73 MB) se descargan bajo demanda: no deben precachearse.
        globIgnores: ['**/ffmpeg-core.wasm', 'tts/*.wasm', 'modelos/**'],
        // Los modelos de voz se descargan de HuggingFace bajo demanda:
        // se cachean para que la segunda vez sea instantáneo.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[^/]*huggingface\.co\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'modelos-voz',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 120,
              },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
          {
            urlPattern: /^https:\/\/cdn-lfs\.[^/]*\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'modelos-voz',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 120,
              },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
});
