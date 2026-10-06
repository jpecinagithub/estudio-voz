/** Codifica canales Float32Array a WAV (PCM 16 bits). Sin dependencias. */
export function canalesAWav(canales: Float32Array[], sampleRate: number): Blob {
  const numCanales = canales.length;
  const numMuestras = canales[0].length;
  const bloqueAlineacion = numCanales * 2;
  const buffer = new ArrayBuffer(44 + numMuestras * bloqueAlineacion);
  const vista = new DataView(buffer);

  const escribirTexto = (pos: number, texto: string) => {
    for (let i = 0; i < texto.length; i++) vista.setUint8(pos + i, texto.charCodeAt(i));
  };
  escribirTexto(0, 'RIFF');
  vista.setUint32(4, 36 + numMuestras * bloqueAlineacion, true);
  escribirTexto(8, 'WAVE');
  escribirTexto(12, 'fmt ');
  vista.setUint32(16, 16, true);
  vista.setUint16(20, 1, true); // PCM
  vista.setUint16(22, numCanales, true);
  vista.setUint32(24, sampleRate, true);
  vista.setUint32(28, sampleRate * bloqueAlineacion, true);
  vista.setUint16(32, bloqueAlineacion, true);
  vista.setUint16(34, 16, true);
  escribirTexto(36, 'data');
  vista.setUint32(40, numMuestras * bloqueAlineacion, true);

  let pos = 44;
  for (let i = 0; i < numMuestras; i++) {
    for (let c = 0; c < numCanales; c++) {
      const m = Math.max(-1, Math.min(1, canales[c][i]));
      vista.setInt16(pos, m < 0 ? m * 0x8000 : m * 0x7fff, true);
      pos += 2;
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
