/** Página de inicio: acciones principales y trabajos recientes. */
import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { EstadoVacio, Tarjeta } from '../componentes/ui';
import {
  IconoAbrir,
  IconoMezcla,
  IconoMicrofono,
  IconoOnda,
  IconoTextoVoz,
  IconoTranscribir,
} from '../componentes/iconos';
import { listarTrabajos } from '../storage/db';
import { NOMBRES_TIPO_TRABAJO, type TrabajoAudio } from '../tipos';
import { formatearFecha, formatearTiempo } from '../utils/formato';

const ACCIONES = [
  {
    ruta: '/texto-voz',
    Icono: IconoTextoVoz,
    titulo: 'Texto a voz',
    descripcion: 'Convierte cualquier texto en una voz natural en español.',
  },
  {
    ruta: '/audio-texto',
    Icono: IconoTranscribir,
    titulo: 'Audio a texto',
    descripcion: 'Obtén una transcripción editable de tus archivos de audio.',
  },
  {
    ruta: '/grabadora',
    Icono: IconoMicrofono,
    titulo: 'Grabar audio',
    descripcion: 'Graba directamente desde el micrófono de tu ordenador.',
  },
  {
    ruta: '/mezclador',
    Icono: IconoMezcla,
    titulo: 'Mezclar audio',
    descripcion: 'Añade música, ajusta volúmenes y exporta tu creación.',
  },
];

export function PaginaInicio() {
  const [trabajos, setTrabajos] = useState<TrabajoAudio[]>([]);

  useEffect(() => {
    let vivo = true;
    listarTrabajos()
      .then((todos) => {
        if (vivo) setTrabajos(todos.slice(0, 4));
      })
      .catch(() => {
        /* Sin trabajos: se muestra el estado vacío. */
      });
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <>
      <h1 className="titulo-pagina">¿Qué quieres crear hoy?</h1>
      <p className="subtitulo-pagina">
        Crea voces, transcribe audios, graba desde el micrófono o mezcla tus proyectos,
        todo desde el navegador.
      </p>

      <div className="rejilla rejilla-2">
        {ACCIONES.map(({ ruta, Icono, titulo, descripcion }) => (
          <NavLink
            key={ruta}
            to={ruta}
            className="tarjeta"
            aria-label={titulo}
            style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
          >
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span className="item-trabajo-icono" aria-hidden>
                <Icono size={26} />
              </span>
              <div>
                <h2 className="tarjeta-titulo">{titulo}</h2>
                <p className="tarjeta-descripcion" style={{ marginBottom: 0 }}>
                  {descripcion}
                </p>
              </div>
            </div>
          </NavLink>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <h2 className="titulo-seccion">Trabajos recientes</h2>
        <Link to="/mis-audios">Ver todos</Link>
      </div>

      {trabajos.length === 0 ? (
        <EstadoVacio
          icono={<IconoOnda size={44} />}
          titulo="Aún no hay trabajos"
          texto="Aún no tienes trabajos. Tus creaciones recientes aparecerán aquí."
          accion={
            <Link to="/texto-voz">
              <span className="btn btn-primario">Crear mi primer audio</span>
            </Link>
          }
        />
      ) : (
        <div className="lista-trabajos">
          {trabajos.map((t) => (
            <div className="item-trabajo" key={t.id}>
              <span className="item-trabajo-icono" aria-hidden>
                <IconoOnda size={22} />
              </span>
              <div className="item-trabajo-info">
                <p className="item-trabajo-nombre">{t.nombre}</p>
                <p className="item-trabajo-meta">
                  {NOMBRES_TIPO_TRABAJO[t.tipo]} · {formatearFecha(t.fecha)} ·{' '}
                  {formatearTiempo(t.duracionSeg)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <Tarjeta>
          <p style={{ margin: 0, fontSize: '0.92rem' }}>
            <strong>Sin registro:</strong> tus audios se guardan solo en tu navegador.{' '}
            <Link to="/privacidad">
              Leer la política de privacidad <IconoAbrir size={14} aria-hidden />
            </Link>
          </p>
        </Tarjeta>
      </div>
    </>
  );
}
