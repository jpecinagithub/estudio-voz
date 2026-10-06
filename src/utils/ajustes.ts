/** Ajustes persistentes de la aplicación (localStorage). */
import type { CalidadExportacion, Voz } from '../config';
import type { FormatoExportacion } from '../tipos';

export interface Ajustes {
  velocidadVoz: number;
  vozPorDefecto: Voz['id'];
  formatoExportacion: FormatoExportacion;
  calidadExportacion: CalidadExportacion;
  volumenMusica: number;
  ducking: boolean;
}

const CLAVE = 'estudio-voz:ajustes';

const POR_DEFECTO: Ajustes = {
  velocidadVoz: 1,
  vozPorDefecto: 'lucia',
  formatoExportacion: 'mp3',
  calidadExportacion: 'estandar',
  volumenMusica: 18,
  ducking: true,
};

/** Lee los ajustes guardados; si no existen, devuelve los valores por defecto. */
export function leerAjustes(): Ajustes {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return { ...POR_DEFECTO };
    const datos = JSON.parse(crudo) as Partial<Ajustes>;
    return {
      velocidadVoz:
        typeof datos.velocidadVoz === 'number' && datos.velocidadVoz > 0
          ? datos.velocidadVoz
          : POR_DEFECTO.velocidadVoz,
      vozPorDefecto:
        datos.vozPorDefecto === 'lucia' ||
        datos.vozPorDefecto === 'elena' ||
        datos.vozPorDefecto === 'mateo' ||
        datos.vozPorDefecto === 'javier'
          ? datos.vozPorDefecto
          : POR_DEFECTO.vozPorDefecto,
      formatoExportacion:
        datos.formatoExportacion === 'mp3' ||
        datos.formatoExportacion === 'wav' ||
        datos.formatoExportacion === 'ogg' ||
        datos.formatoExportacion === 'm4a'
          ? datos.formatoExportacion
          : POR_DEFECTO.formatoExportacion,
      calidadExportacion:
        datos.calidadExportacion === 'ligera' ||
        datos.calidadExportacion === 'estandar' ||
        datos.calidadExportacion === 'alta'
          ? datos.calidadExportacion
          : POR_DEFECTO.calidadExportacion,
      volumenMusica:
        typeof datos.volumenMusica === 'number' &&
        datos.volumenMusica >= 0 &&
        datos.volumenMusica <= 100
          ? datos.volumenMusica
          : POR_DEFECTO.volumenMusica,
      ducking: typeof datos.ducking === 'boolean' ? datos.ducking : POR_DEFECTO.ducking,
    };
  } catch {
    return { ...POR_DEFECTO };
  }
}

/** Guarda los ajustes en el navegador. */
export function guardarAjustes(a: Ajustes): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(a));
  } catch {
    // Almacenamiento no disponible: los ajustes se mantienen solo en esta sesión.
  }
}
