/** Estructura principal: barra lateral (escritorio) + navegación inferior (móvil). */
import { NavLink, Outlet } from 'react-router-dom';
import { APP_NOMBRE, CONTACTO_EMAIL } from '../config';
import {
  IconoAjustes,
  IconoCarpeta,
  IconoInicio,
  IconoLogo,
  IconoMezcla,
  IconoMicrofono,
  IconoTextoVoz,
  IconoTranscribir,
} from './iconos';

const ENLACES = [
  { ruta: '/', etiqueta: 'Inicio', icono: IconoInicio, exacta: true },
  { ruta: '/texto-voz', etiqueta: 'Texto a voz', icono: IconoTextoVoz },
  { ruta: '/audio-texto', etiqueta: 'Audio a texto', icono: IconoTranscribir },
  { ruta: '/grabadora', etiqueta: 'Grabadora', icono: IconoMicrofono },
  { ruta: '/mezclador', etiqueta: 'Mezclador', icono: IconoMezcla },
  { ruta: '/mis-audios', etiqueta: 'Mis audios', icono: IconoCarpeta },
  { ruta: '/ajustes', etiqueta: 'Ajustes', icono: IconoAjustes },
];

function Marca() {
  return (
    <NavLink to="/" className="marca" aria-label={`${APP_NOMBRE} — Inicio`}>
      <span className="marca-logo">
        <IconoLogo size={22} />
      </span>
      <span>
        <span className="marca-nombre">{APP_NOMBRE}</span>
        <br />
        <span className="marca-sub">Estudio de audio</span>
      </span>
    </NavLink>
  );
}

export function Layout() {
  return (
    <div className="app">
      <aside className="barra-lateral" aria-label="Navegación principal">
        <Marca />
        <nav>
          {ENLACES.map(({ ruta, etiqueta, icono: Icono, exacta }) => (
            <NavLink
              key={ruta}
              to={ruta}
              end={exacta}
              className={({ isActive }) => `nav-enlace${isActive ? ' activo' : ''}`}
            >
              <Icono />
              {etiqueta}
            </NavLink>
          ))}
        </nav>
        <div className="barra-lateral-pie">
          <NavLink to="/privacidad">Tu privacidad</NavLink>
          <NavLink to="/acerca">Acerca de {APP_NOMBRE}</NavLink>
        </div>
      </aside>

      <div className="contenido">
        <header className="cabecera-movil">
          <span className="marca-logo" style={{ width: 30, height: 30 }}>
            <IconoLogo size={18} />
          </span>
          <span className="marca-nombre" style={{ fontSize: '0.98rem' }}>
            {APP_NOMBRE}
          </span>
        </header>

        <main className="pagina">
          <Outlet />
        </main>

        <footer className="pie-pagina">
          <span>
            <strong>{APP_NOMBRE}</strong> — tu estudio de voz en español. Creado por{' '}
            <strong>Jon Peciña</strong> ·{' '}
            <a href={`mailto:${CONTACTO_EMAIL}`}>{CONTACTO_EMAIL}</a>
          </span>
          <NavLink to="/privacidad">Tu privacidad</NavLink>
          <NavLink to="/acerca">Acerca de</NavLink>
          <NavLink to="/ajustes">Ajustes</NavLink>
        </footer>
      </div>

      <nav className="nav-inferior" aria-label="Navegación principal">
        {ENLACES.map(({ ruta, etiqueta, icono: Icono, exacta }) => (
          <NavLink
            key={ruta}
            to={ruta}
            end={exacta}
            className={({ isActive }) => `nav-enlace${isActive ? ' activo' : ''}`}
          >
            <Icono size={21} />
            {etiqueta}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
