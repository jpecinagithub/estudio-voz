/**
 * Configuración central de la aplicación.
 * El nombre de la app vive aquí para poder cambiarlo fácilmente.
 * Este fichero no debe importar nada del navegador: también lo usa vite.config.ts.
 */

export const APP_NOMBRE = 'Estudio Voz';
export const APP_NOMBRE_CORTO = 'Estudio Voz';
export const APP_DESCRIPCION =
  'Crea, graba, transcribe y mezcla audio en español directamente desde tu navegador.';
export const APP_VERSION = '1.0.0';
export const COLOR_TEMA = '#0d1117';
export const CONTACTO_EMAIL = 'jpecina@gmail.com';

/** Por encima de este tamaño la transcripción usa la subida optimizada (Vercel Blob). */
export const TAMANO_MAXIMO_SUBIDA_DIRECTA = 4_000_000; // 4 MB
/** Límite de tamaño que acepta la API de transcripción. */
export const TAMANO_MAXIMO_TRANSCRIPCION = 25_000_000; // 25 MB
/** Cuántos trabajos conserva el historial local. */
export const MAX_TRABAJOS_HISTORIAL = 10;
/** Duración máxima de una grabación (10 minutos). */
export const DURACION_MAXIMA_GRABACION_SEG = 600;

export const FORMATOS_ACEPTADOS_DESCRIPCION = 'MP3, WAV, M4A, OGG, WEBM y FLAC';

export const EXTENSIONES_ACEPTADAS = ['.mp3', '.wav', '.m4a', '.ogg', '.webm', '.flac', '.mp4', '.aac'];

/** Tipos MIME de audio aceptados (respaldo cuando el archivo no tiene extensión). */
export const TIPOS_MIME_ACEPTADOS = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
  'audio/x-flac',
  'video/mp4',
  'video/webm',
];

/** Comprueba si un archivo es un audio compatible: por extensión o, si no tiene, por tipo MIME. */
export function esAudioCompatible(archivo: { name: string; type?: string }): boolean {
  const minusculas = archivo.name.toLowerCase();
  const tieneExtension = minusculas.includes('.');
  if (tieneExtension) {
    const extension = `.${minusculas.split('.').pop() ?? ''}`;
    if (EXTENSIONES_ACEPTADAS.includes(extension)) return true;
  }
  const tipoMime = (archivo.type || '').toLowerCase().split(';')[0].trim();
  return TIPOS_MIME_ACEPTADOS.includes(tipoMime);
}

/** Voces del estudio: 4 perfiles españoles reales (el motor concreto se configura en src/tts/motor.ts). */
export interface Voz {
  id: 'lucia' | 'elena' | 'mateo' | 'javier';
  nombre: string;
  genero: 'Femenina' | 'Masculina';
  descripcion: string;
  /** Texto de la muestra que se reproduce con "Escuchar muestra". */
  textoMuestra: string;
  /**
   * Velocidad base de la voz. Los modelos "low" (Lucía, Elena) hablan de forma
   * natural mucho más lento (~6 car/s frente a ~18 car/s de los "medium"),
   * por lo que se compensan con una velocidad mayor.
   */
  velocidadBase: number;
}

export const VOCES: Voz[] = [
  {
    id: 'lucia',
    nombre: 'Lucía',
    genero: 'Femenina',
    descripcion: 'Voz clara, cálida y cercana.',
    textoMuestra: 'Hola, soy Lucía. Mi voz es clara, cálida y cercana.',
    velocidadBase: 2.0,
  },
  {
    id: 'elena',
    nombre: 'Elena',
    genero: 'Femenina',
    descripcion: 'Voz serena, profesional y ligeramente más grave.',
    textoMuestra: 'Hola, soy Elena. Mi voz es serena y profesional.',
    velocidadBase: 2.0,
  },
  {
    id: 'mateo',
    nombre: 'Mateo',
    genero: 'Masculina',
    descripcion: 'Voz natural, cercana y moderna.',
    textoMuestra: 'Hola, soy Mateo. Mi voz es natural y cercana.',
    velocidadBase: 1.0,
  },
  {
    id: 'javier',
    nombre: 'Javier',
    genero: 'Masculina',
    descripcion: 'Voz profunda, pausada y profesional.',
    textoMuestra: 'Hola, soy Javier. Mi voz es profunda y pausada.',
    velocidadBase: 1.0,
  },
];

/** Las 5 pistas de música de fondo, 100% originales (generadas para este proyecto). */
export interface PistaMusica {
  id: string;
  nombre: string;
  descripcion: string;
  archivo: string;
}

export const PISTAS_MUSICA: PistaMusica[] = [
  {
    id: 'ambiente',
    nombre: 'Ambiente',
    descripcion: 'Suave, elegante y atmosférica.',
    archivo: '/musica/ambiente.mp3',
  },
  {
    id: 'piano',
    nombre: 'Piano',
    descripcion: 'Piano cálido, minimalista y emocional.',
    archivo: '/musica/piano.mp3',
  },
  {
    id: 'chill',
    nombre: 'Chill',
    descripcion: 'Base relajada y moderna.',
    archivo: '/musica/chill.mp3',
  },
  {
    id: 'inspiracion',
    nombre: 'Inspiración',
    descripcion: 'Positiva, ideal para presentaciones y narraciones.',
    archivo: '/musica/inspiracion.mp3',
  },
  {
    id: 'acustico',
    nombre: 'Acústico',
    descripcion: 'Guitarra acústica suave y cercana.',
    archivo: '/musica/acustico.mp3',
  },
];

export type CalidadExportacion = 'ligera' | 'estandar' | 'alta';

export const CALIDADES_EXPORTACION: { id: CalidadExportacion; nombre: string; descripcion: string }[] = [
  { id: 'ligera', nombre: 'Ligera', descripcion: 'Archivo pequeño, calidad suficiente para borradores.' },
  { id: 'estandar', nombre: 'Estándar', descripcion: 'Equilibrio entre calidad y tamaño. Recomendada.' },
  { id: 'alta', nombre: 'Alta', descripcion: 'Máxima calidad, archivo más pesado.' },
];
