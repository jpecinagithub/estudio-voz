/**
 * Paso de audio entre páginas en la misma sesión (memoria).
 * Se usa p. ej. para "Abrir en mezclador" o "Transcribir esta grabación".
 * El contenido se pierde al recargar la página (para persistir: "Mis audios").
 */

const almacen = new Map<string, AudioBuffer>();

/** Guarda un buffer para recogerlo desde otra página. */
export function guardarAudioSesion(clave: string, buffer: AudioBuffer): void {
  if (almacen.size > 8) {
    const primera = almacen.keys().next().value;
    if (primera) almacen.delete(primera);
  }
  almacen.set(clave, buffer);
}

/** Recupera (y elimina) un buffer guardado. Devuelve undefined si no existe. */
export function recogerAudioSesion(clave: string): AudioBuffer | undefined {
  const buffer = almacen.get(clave);
  if (buffer) almacen.delete(clave);
  return buffer;
}

/** ¿Existe un audio guardado con esta clave? */
export function existeAudioSesion(clave: string): boolean {
  return almacen.has(clave);
}
