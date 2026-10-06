/**
 * Página «Mis audios»: historial local de trabajos guardados en IndexedDB.
 * Permite filtrar, reproducir, abrir en otras pantallas, descargar y eliminar.
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { Aviso, Boton, Cargando, EstadoVacio, Modal } from '../componentes/ui';
import {
  IconoAbrir,
  IconoCarpeta,
  IconoDescargar,
  IconoMezcla,
  IconoMicrofono,
  IconoPapelera,
  IconoReproducir,
  IconoTextoVoz,
  IconoTranscribir,
} from '../componentes/iconos';
import { ReproductorAudio } from '../componentes/ReproductorAudio';
import { calcularPicos, decodificarAudio } from '../audio/motor';
import { eliminarTrabajo, listarTrabajos, vaciarHistorial } from '../storage/db';
import { NOMBRES_TIPO_TRABAJO, type TipoTrabajo, type TrabajoAudio } from '../tipos';
import { formatearFechaHora, formatearTiempo } from '../utils/formato';
import { descargarBlob } from '../utils/descarga';
import { mensajeAmigable } from '../utils/errores';

type Filtro = 'todos' | TipoTrabajo;

const FILTROS: Array<{ valor: Filtro; etiqueta: string }> = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'voz', etiqueta: NOMBRES_TIPO_TRABAJO.voz },
  { valor: 'grabacion', etiqueta: NOMBRES_TIPO_TRABAJO.grabacion },
  { valor: 'transcripcion', etiqueta: NOMBRES_TIPO_TRABAJO.transcripcion },
  { valor: 'mezcla', etiqueta: NOMBRES_TIPO_TRABAJO.mezcla },
];

const ICONOS_TIPO: Record<TipoTrabajo, (p: { size?: number }) => ReactElement> = {
  voz: IconoTextoVoz,
  grabacion: IconoMicrofono,
  transcripcion: IconoTranscribir,
  mezcla: IconoMezcla,
};

/** Limpia un nombre para usarlo como nombre de archivo descargado. */
function nombreSeguro(nombre: string): string {
  const limpio = nombre.replace(/[\\/:*?"<>|]/g, '-').trim();
  return limpio === '' ? 'audio' : limpio;
}

export function PaginaMisAudios() {
  const navigate = useNavigate();
  const [trabajos, setTrabajos] = useState<TrabajoAudio[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [idExpandido, setIdExpandido] = useState<string | null>(null);
  const [picosPorId, setPicosPorId] = useState<Record<string, Float32Array>>({});
  const [aEliminar, setAEliminar] = useState<TrabajoAudio | null>(null);
  const [confirmarVaciar, setConfirmarVaciar] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setTrabajos(await listarTrabajos());
    } catch (e) {
      setError(mensajeAmigable(e));
      setTrabajos([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const alternarReproduccion = useCallback(
    (trabajo: TrabajoAudio) => {
      if (idExpandido === trabajo.id) {
        setIdExpandido(null);
        return;
      }
      setIdExpandido(trabajo.id);
      // Calcula la onda bajo demanda; si falla, el audio se reproduce sin onda.
      if (trabajo.audio && !picosPorId[trabajo.id]) {
        void decodificarAudio(trabajo.audio)
          .then((buffer) => {
            setPicosPorId((anterior) => ({
              ...anterior,
              [trabajo.id]: calcularPicos(buffer, 160),
            }));
          })
          .catch(() => undefined);
      }
    },
    [idExpandido, picosPorId],
  );

  const abrirTrabajo = useCallback(
    (trabajo: TrabajoAudio) => {
      if (trabajo.tipo === 'transcripcion') {
        navigate(`/audio-texto?transcripcion=${trabajo.id}`);
      } else {
        navigate(`/mezclador?voz=historial:${trabajo.id}`);
      }
    },
    [navigate],
  );

  const descargarTrabajo = useCallback((trabajo: TrabajoAudio) => {
    const nombre = nombreSeguro(trabajo.nombre);
    if (trabajo.tipo === 'transcripcion') {
      const texto = trabajo.texto ?? '';
      descargarBlob(new Blob([texto], { type: 'text/plain;charset=utf-8' }), `${nombre}.txt`);
      return;
    }
    if (trabajo.audio) {
      descargarBlob(trabajo.audio, `${nombre}.wav`);
    }
  }, []);

  const confirmarEliminacion = useCallback(async () => {
    if (!aEliminar) return;
    try {
      await eliminarTrabajo(aEliminar.id);
      setAEliminar(null);
      setIdExpandido((id) => (id === aEliminar.id ? null : id));
      await cargar();
    } catch (e) {
      setAEliminar(null);
      setError(mensajeAmigable(e));
    }
  }, [aEliminar, cargar]);

  const confirmarVaciarHistorial = useCallback(async () => {
    try {
      await vaciarHistorial();
      setConfirmarVaciar(false);
      setIdExpandido(null);
      setTrabajos([]);
    } catch (e) {
      setConfirmarVaciar(false);
      setError(mensajeAmigable(e));
    }
  }, []);

  const visibles = (trabajos ?? []).filter(
    (t) => filtro === 'todos' || t.tipo === filtro,
  );

  return (
    <div>
      <header className="espaciado">
        <h1>Mis audios</h1>
        <p className="subtitulo-pagina">
          Tus voces generadas, grabaciones, transcripciones y mezclas, guardadas solo en este
          navegador.
        </p>
      </header>

      {cargando && (
        <div className="centrado espaciado">
          <Cargando texto="Cargando tus audios…" />
        </div>
      )}

      {!cargando && error && (
        <div className="espaciado">
          <Aviso
            tipo="error"
            accion={
              <Boton pequeno onClick={() => void cargar()}>
                Reintentar
              </Boton>
            }
          >
            {error}
          </Aviso>
        </div>
      )}

      {!cargando && !error && trabajos !== null && (
        <>
          {trabajos.length === 0 ? (
            <EstadoVacio
              icono={<IconoCarpeta size={40} />}
              titulo="Aún no tienes audios"
              texto="Tus voces generadas, grabaciones, transcripciones y mezclas aparecerán aquí."
              accion={
                <Boton variante="primario" onClick={() => navigate('/texto-voz')}>
                  Crear mi primer audio
                </Boton>
              }
            />
          ) : (
            <>
              <div
                className="grupo-botones espaciado"
                role="group"
                aria-label="Filtrar por tipo de audio"
              >
                {FILTROS.map((f) => (
                  <Boton
                    key={f.valor}
                    pequeno
                    variante={filtro === f.valor ? 'primario' : 'secundario'}
                    aria-pressed={filtro === f.valor}
                    onClick={() => setFiltro(f.valor)}
                  >
                    {f.etiqueta}
                  </Boton>
                ))}
              </div>

              {visibles.length === 0 ? (
                <p className="subtitulo-pagina">No hay audios de este tipo todavía.</p>
              ) : (
                <div className="lista-trabajos">
                  {visibles.map((trabajo) => {
                    const Icono = ICONOS_TIPO[trabajo.tipo];
                    const expandido = idExpandido === trabajo.id;
                    const descargable =
                      trabajo.tipo === 'transcripcion' ? trabajo.texto != null : !!trabajo.audio;
                    return (
                      <div key={trabajo.id}>
                        <article className="item-trabajo" aria-label={trabajo.nombre}>
                          <div className="item-trabajo-icono" aria-hidden="true">
                            <Icono size={24} />
                          </div>
                          <div className="item-trabajo-info">
                            <p className="item-trabajo-nombre">{trabajo.nombre}</p>
                            <p className="item-trabajo-meta">
                              <span className="etiqueta">{NOMBRES_TIPO_TRABAJO[trabajo.tipo]}</span>{' '}
                              {formatearFechaHora(trabajo.fecha)} ·{' '}
                              {formatearTiempo(trabajo.duracionSeg)}
                            </p>
                          </div>
                          <div className="item-trabajo-acciones">
                            {trabajo.audio && (
                              <button
                                type="button"
                                className="btn-icono pequeno"
                                aria-expanded={expandido}
                                aria-label={
                                  expandido
                                    ? `Ocultar el reproductor de «${trabajo.nombre}»`
                                    : `Reproducir «${trabajo.nombre}»`
                                }
                                title={expandido ? 'Ocultar reproductor' : 'Reproducir'}
                                onClick={() => alternarReproduccion(trabajo)}
                              >
                                <IconoReproducir size={18} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-icono pequeno"
                              aria-label={`Abrir «${trabajo.nombre}»`}
                              title="Abrir"
                              onClick={() => abrirTrabajo(trabajo)}
                            >
                              <IconoAbrir size={18} />
                            </button>
                            {descargable && (
                              <button
                                type="button"
                                className="btn-icono pequeno"
                                aria-label={`Descargar «${trabajo.nombre}»`}
                                title="Descargar"
                                onClick={() => descargarTrabajo(trabajo)}
                              >
                                <IconoDescargar size={18} />
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn-icono pequeno"
                              aria-label={`Eliminar «${trabajo.nombre}»`}
                              title="Eliminar"
                              onClick={() => setAEliminar(trabajo)}
                            >
                              <IconoPapelera size={18} />
                            </button>
                          </div>
                        </article>
                        {expandido && trabajo.audio && (
                          <div className="espaciado">
                            <ReproductorAudio
                              blob={trabajo.audio}
                              picos={picosPorId[trabajo.id] ?? null}
                              titulo={trabajo.nombre}
                              subtitulo={`${NOMBRES_TIPO_TRABAJO[trabajo.tipo]} · ${formatearFechaHora(trabajo.fecha)}`}
                              autoReproducir
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="espaciado" style={{ textAlign: 'right' }}>
                <Boton variante="peligro" pequeno onClick={() => setConfirmarVaciar(true)}>
                  Vaciar historial
                </Boton>
              </div>
            </>
          )}
        </>
      )}

      {aEliminar && (
        <Modal titulo="Eliminar trabajo" alCerrar={() => setAEliminar(null)}>
          <p className="modal-texto">
            ¿Seguro que quieres eliminar «{aEliminar.nombre}»? Esta acción no se puede deshacer.
          </p>
          <div className="grupo-botones">
            <Boton variante="peligro" onClick={() => void confirmarEliminacion()}>
              Eliminar
            </Boton>
            <Boton onClick={() => setAEliminar(null)}>Cancelar</Boton>
          </div>
        </Modal>
      )}

      {confirmarVaciar && (
        <Modal titulo="Vaciar historial" alCerrar={() => setConfirmarVaciar(false)}>
          <p className="modal-texto">
            Se eliminarán todos los trabajos de «Mis audios». Esta acción no se puede deshacer.
          </p>
          <div className="grupo-botones">
            <Boton variante="peligro" onClick={() => void confirmarVaciarHistorial()}>
              Vaciar historial
            </Boton>
            <Boton onClick={() => setConfirmarVaciar(false)}>Cancelar</Boton>
          </div>
        </Modal>
      )}
    </div>
  );
}
