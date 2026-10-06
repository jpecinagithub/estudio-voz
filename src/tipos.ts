/** Tipos compartidos por toda la aplicación. */

export type TipoTrabajo = 'voz' | 'grabacion' | 'transcripcion' | 'mezcla';

export const NOMBRES_TIPO_TRABAJO: Record<TipoTrabajo, string> = {
  voz: 'Voz generada',
  grabacion: 'Grabación',
  transcripcion: 'Transcripción',
  mezcla: 'Mezcla',
};

export type FormatoExportacion = 'mp3' | 'wav' | 'ogg' | 'm4a';

export const NOMBRES_FORMATO: Record<FormatoExportacion, string> = {
  mp3: 'MP3',
  wav: 'WAV',
  ogg: 'OGG',
  m4a: 'M4A',
};

export interface TrabajoAudio {
  id: string;
  nombre: string;
  tipo: TipoTrabajo;
  /** Marca de tiempo (ms) de creación. */
  fecha: number;
  duracionSeg: number;
  audio: Blob | null;
  /** Solo para transcripciones: el texto transcrito. */
  texto: string | null;
  formatoOrigen?: string;
}

export interface SegmentoTranscripcion {
  inicio: number;
  fin: number;
  texto: string;
}

export interface ResultadoTranscripcion {
  texto: string;
  segmentos: SegmentoTranscripcion[];
  duracionSeg: number;
  /** true cuando el audio se subió temporalmente a un almacenamiento externo. */
  subidaTemporal?: boolean;
}

/** Progreso de una operación larga. `porcentaje` puede ser null si es indeterminado. */
export interface ProgresoOperacion {
  fase: string;
  porcentaje: number | null;
}

/** Error con código conocido para traducir a mensajes en español. */
export class ErrorApp extends Error {
  codigo: string;
  constructor(codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorApp';
    this.codigo = codigo;
  }
}
