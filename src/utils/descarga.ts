/** Descarga un Blob como archivo con el nombre indicado. */
export function descargarBlob(blob: Blob, nombreArchivo: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // Se libera tras un margen para que la descarga comience.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
