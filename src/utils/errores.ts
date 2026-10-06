/**
 * Catálogo de errores → mensajes en español comprensibles.
 * Nunca se muestran errores técnicos crudos al usuario.
 */
import { ErrorApp } from '../tipos';

const MENSAJES_POR_CODIGO: Record<string, string> = {
  'microfono-denegado':
    'Has denegado el acceso al micrófono. Actívalo en los ajustes de tu navegador para poder grabar.',
  'microfono-no-encontrado':
    'No se ha encontrado ningún micrófono. Conecta uno e inténtalo de nuevo.',
  'microfono-en-uso':
    'El micrófono está siendo utilizado por otra aplicación. Ciérrala e inténtalo de nuevo.',
  'navegador-incompatible':
    'Tu navegador no soporta esta función. Prueba con una versión reciente de Chrome, Edge, Firefox o Safari.',
  'modelo-tts-fallo':
    'No se ha podido preparar la voz. Comprueba tu conexión a internet e inténtalo de nuevo.',
  'modelo-tts-descarga':
    'La descarga del modelo de voz se ha interrumpido. Inténtalo de nuevo cuando tengas mejor conexión.',
  'tts-fallo':
    'No se ha podido generar el audio. Prueba con un texto más corto o inténtalo de nuevo.',
  'archivo-no-compatible':
    'Este archivo no es un audio compatible. Prueba con MP3, WAV, M4A, OGG o WEBM.',
  'archivo-demasiado-grande':
    'El archivo es demasiado grande para este método de subida. Vamos a utilizar la carga optimizada.',
  'archivo-supera-limite':
    'El archivo supera el tamaño máximo de 25 MB para la transcripción.',
  'groq-fallo':
    'El servicio de transcripción no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.',
  'groq-saturado':
    'El servicio de transcripción está saturado. Espera unos segundos y pulsa Reintentar.',
  'blob-no-configurado':
    'La carga optimizada no está disponible. Prueba con un archivo de menos de 4 MB.',
  'blob-fallo': 'No se pudo preparar la carga optimizada. Pulsa Reintentar.',
  'operacion-cancelada': 'La operación se ha cancelado.',
  'groq-sin-configurar':
    'La transcripción necesita configuración en el servidor. Revisa la clave de la API en el despliegue.',
  'transcripcion-vacia':
    'No se ha detectado voz en este audio. Prueba con una grabación más clara.',
  'sin-conexion':
    'Se ha perdido la conexión a internet. Comprueba tu conexión e inténtalo de nuevo.',
  'api-no-disponible':
    'Esta función necesita la aplicación desplegada en Vercel. En la vista previa local no está disponible.',
  'conversion-fallo':
    'No se ha podido convertir el audio a este formato. Prueba con otro formato.',
  'almacenamiento-lleno':
    'El almacenamiento local está lleno. Elimina algunos trabajos de «Mis audios» para liberar espacio.',
  'almacenamiento-fallo': 'No se ha podido acceder al almacenamiento local del navegador.',
  'edicion-invalida': 'El recorte seleccionado no es válido. Ajusta los tiempos e inténtalo de nuevo.',
  'mezcla-fallo': 'No se ha podido mezclar el audio. Inténtalo de nuevo.',
  'grabacion-fallo': 'La grabación se ha interrumpido. Inténtalo de nuevo.',
  'voz-no-disponible':
    'La voz indicada ya no está disponible. Elígela de nuevo en esta página.',
  'musica-carga-fallo':
    'No se ha podido cargar la música. Comprueba tu conexión e inténtalo de nuevo.',
};

const MENSAJE_GENERICO =
  'Algo no ha salido bien. Inténtalo de nuevo y, si persiste, recarga la página.';

/** ¿Parece un fallo de red? */
export function esFalloDeRed(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const mensaje = error instanceof Error ? error.message : String(error ?? '');
  return /failed to fetch|networkerror|network request failed|load failed/i.test(mensaje);
}

function mensajeDeDomException(error: DOMException): string | null {
  switch (error.name) {
    case 'NotAllowedError':
      return MENSAJES_POR_CODIGO['microfono-denegado'];
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return MENSAJES_POR_CODIGO['microfono-no-encontrado'];
    case 'NotReadableError':
    case 'TrackStartError':
      return MENSAJES_POR_CODIGO['microfono-en-uso'];
    case 'AbortError':
      return 'La operación se ha cancelado.';
    case 'QuotaExceededError':
      return MENSAJES_POR_CODIGO['almacenamiento-lleno'];
    case 'SecurityError':
      return 'El navegador ha bloqueado esta operación por seguridad. Asegúrate de usar HTTPS o localhost.';
    default:
      return null;
  }
}

/** Convierte cualquier error en un mensaje en español listo para mostrar. */
export function mensajeAmigable(error: unknown): string {
  if (error instanceof ErrorApp) {
    return MENSAJES_POR_CODIGO[error.codigo] ?? error.message ?? MENSAJE_GENERICO;
  }
  if (error instanceof DOMException) {
    return mensajeDeDomException(error) ?? MENSAJE_GENERICO;
  }
  if (esFalloDeRed(error)) {
    return typeof navigator !== 'undefined' && !navigator.onLine
      ? MENSAJES_POR_CODIGO['sin-conexion']
      : MENSAJES_POR_CODIGO['api-no-disponible'];
  }
  if (error instanceof Error && error.message) {
    // Evita exponer detalles técnicos crudos.
    return MENSAJE_GENERICO;
  }
  return MENSAJE_GENERICO;
}

/** ¿Tiene sentido ofrecer "Reintentar" para este error? */
export function puedeReintentarse(error: unknown): boolean {
  if (error instanceof ErrorApp) {
    return !['archivo-no-compatible', 'edicion-invalida', 'navegador-incompatible'].includes(
      error.codigo,
    );
  }
  if (error instanceof DOMException) {
    return !['NotAllowedError', 'NotFoundError', 'DevicesNotFoundError'].includes(error.name);
  }
  return true;
}
