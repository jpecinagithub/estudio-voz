import { Suspense, lazy, useEffect } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './componentes/Layout';
import { Cargando } from './componentes/ui';
import { PaginaInicio } from './paginas/Inicio';
import { PaginaAjustes } from './paginas/Ajustes';
import { PaginaAcerca } from './paginas/Acerca';
import { PaginaPrivacidad } from './paginas/Privacidad';
import { APP_NOMBRE } from './config';

// Las páginas pesadas se cargan bajo demanda (code splitting).
const PaginaTextoVoz = lazy(() =>
  import('./paginas/TextoVoz').then((m) => ({ default: m.PaginaTextoVoz })),
);
const PaginaAudioTexto = lazy(() =>
  import('./paginas/AudioTexto').then((m) => ({ default: m.PaginaAudioTexto })),
);
const PaginaGrabadora = lazy(() =>
  import('./paginas/Grabadora').then((m) => ({ default: m.PaginaGrabadora })),
);
const PaginaMezclador = lazy(() =>
  import('./paginas/Mezclador').then((m) => ({ default: m.PaginaMezclador })),
);
const PaginaMisAudios = lazy(() =>
  import('./paginas/MisAudios').then((m) => ({ default: m.PaginaMisAudios })),
);

const TITULOS: Record<string, string> = {
  '/': `Inicio — ${APP_NOMBRE}`,
  '/texto-voz': `Texto a voz — ${APP_NOMBRE}`,
  '/audio-texto': `Audio a texto — ${APP_NOMBRE}`,
  '/grabadora': `Grabadora — ${APP_NOMBRE}`,
  '/mezclador': `Mezclador — ${APP_NOMBRE}`,
  '/mis-audios': `Mis audios — ${APP_NOMBRE}`,
  '/ajustes': `Ajustes — ${APP_NOMBRE}`,
  '/acerca': `Acerca de — ${APP_NOMBRE}`,
  '/privacidad': `Tu privacidad — ${APP_NOMBRE}`,
};

function GestorRuta() {
  const ubicacion = useLocation();
  useEffect(() => {
    document.title = TITULOS[ubicacion.pathname] ?? APP_NOMBRE;
    window.scrollTo(0, 0);
  }, [ubicacion.pathname]);
  return null;
}

function CargandoPagina() {
  return (
    <div className="centrado espaciado">
      <Cargando texto="Cargando…" />
    </div>
  );
}

export function App() {
  return (
    <HashRouter>
      <GestorRuta />
      <Suspense fallback={<CargandoPagina />}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<PaginaInicio />} />
            <Route path="texto-voz" element={<PaginaTextoVoz />} />
            <Route path="audio-texto" element={<PaginaAudioTexto />} />
            <Route path="grabadora" element={<PaginaGrabadora />} />
            <Route path="mezclador" element={<PaginaMezclador />} />
            <Route path="mis-audios" element={<PaginaMisAudios />} />
            <Route path="ajustes" element={<PaginaAjustes />} />
            <Route path="acerca" element={<PaginaAcerca />} />
            <Route path="privacidad" element={<PaginaPrivacidad />} />
            <Route path="*" element={<PaginaInicio />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
