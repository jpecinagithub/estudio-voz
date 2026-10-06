/**
 * Historial local ("Mis audios") con IndexedDB.
 * Todo permanece en el navegador del usuario; no hay cuentas ni servidor.
 */
import { openDB, type DBSchema } from 'idb';
import { MAX_TRABAJOS_HISTORIAL } from '../config';
import { ErrorApp, type TrabajoAudio } from '../tipos';

interface EsquemaEstudio extends DBSchema {
  trabajos: {
    key: string;
    value: TrabajoAudio;
    indexes: { 'por-fecha': number };
  };
}

const NOMBRE_BD = 'estudio-voz';
const VERSION_BD = 1;

async function abrirBD() {
  return openDB<EsquemaEstudio>(NOMBRE_BD, VERSION_BD, {
    upgrade(bd) {
      const almacen = bd.createObjectStore('trabajos', { keyPath: 'id' });
      almacen.createIndex('por-fecha', 'fecha');
    },
  });
}

function errorAlmacen(error: unknown): ErrorApp {
  const nombre = error instanceof DOMException ? error.name : '';
  if (nombre === 'QuotaExceededError') {
    return new ErrorApp(
      'almacenamiento-lleno',
      'El almacenamiento local está lleno. Elimina algunos trabajos de «Mis audios».',
    );
  }
  return new ErrorApp(
    'almacenamiento-fallo',
    'No se ha podido guardar en el almacenamiento local.',
  );
}

/** Guarda un trabajo y poda el historial a los últimos N. */
export async function guardarTrabajo(trabajo: TrabajoAudio): Promise<void> {
  try {
    const bd = await abrirBD();
    const tx = bd.transaction('trabajos', 'readwrite');
    await tx.store.put(trabajo);
    const claves = await tx.store.index('por-fecha').getAllKeys();
    if (claves.length > MAX_TRABAJOS_HISTORIAL) {
      const sobrantes = claves.slice(0, claves.length - MAX_TRABAJOS_HISTORIAL);
      await Promise.all(sobrantes.map((id) => tx.store.delete(id)));
    }
    await tx.done;
  } catch (error) {
    throw errorAlmacen(error);
  }
}

/** Lista los trabajos, del más reciente al más antiguo. */
export async function listarTrabajos(): Promise<TrabajoAudio[]> {
  try {
    const bd = await abrirBD();
    const todos = await bd.getAllFromIndex('trabajos', 'por-fecha');
    return todos.reverse();
  } catch (error) {
    throw errorAlmacen(error);
  }
}

export async function obtenerTrabajo(id: string): Promise<TrabajoAudio | undefined> {
  try {
    const bd = await abrirBD();
    return bd.get('trabajos', id);
  } catch (error) {
    throw errorAlmacen(error);
  }
}

export async function eliminarTrabajo(id: string): Promise<void> {
  try {
    const bd = await abrirBD();
    await bd.delete('trabajos', id);
  } catch (error) {
    throw errorAlmacen(error);
  }
}

export async function vaciarHistorial(): Promise<void> {
  try {
    const bd = await abrirBD();
    await bd.clear('trabajos');
  } catch (error) {
    throw errorAlmacen(error);
  }
}

/** Crea un identificador único para un trabajo. */
export function crearId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `t-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}
