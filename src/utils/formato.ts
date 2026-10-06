/** Formato de tiempos, tamaños y fechas — todo en español. */

const FORMATO_BYTES = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

/** Segundos → "3:07". */
export function formatearTiempo(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) segundos = 0;
  const total = Math.floor(segundos);
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return `${min}:${seg.toString().padStart(2, '0')}`;
}

/** Segundos → "01:02:03" (para segmentos largos). */
export function formatearTiempoLargo(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) segundos = 0;
  const total = Math.floor(segundos);
  const h = Math.floor(total / 3600);
  const min = Math.floor((total % 3600) / 60);
  const seg = total % 60;
  const mm = min.toString().padStart(2, '0');
  const ss = seg.toString().padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Segundos → "00:01:23,456" (formato SRT). */
export function formatearTiempoSrt(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) segundos = 0;
  const ms = Math.floor(segundos * 1000);
  const h = Math.floor(ms / 3_600_000);
  const min = Math.floor((ms % 3_600_000) / 60_000);
  const seg = Math.floor((ms % 60_000) / 1000);
  const resto = ms % 1000;
  const p = (n: number, d: number) => n.toString().padStart(d, '0');
  return `${p(h, 2)}:${p(min, 2)}:${p(seg, 2)},${p(resto, 3)}`;
}

/** Bytes → "1,2 MB". */
export function formatearBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) bytes = 0;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${FORMATO_BYTES.format(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${FORMATO_BYTES.format(mb)} MB`;
  return `${FORMATO_BYTES.format(mb / 1024)} GB`;
}

/** Marca temporal → "6 oct 2026". */
export function formatearFecha(marca: number): string {
  return new Date(marca).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Marca temporal → "6 oct 2026, 09:15". */
export function formatearFechaHora(marca: number): string {
  return new Date(marca).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
