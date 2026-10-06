/** Página «Acerca de»: qué es Estudio Voz, tecnologías y filosofía de privacidad. */
import { Tarjeta } from '../componentes/ui';
import { IconoCandado } from '../componentes/iconos';

export function PaginaAcerca() {
  return (
    <>
      <h1 className="titulo-pagina">Acerca de Estudio Voz</h1>
      <p className="subtitulo-pagina">
        Estudio Voz es una herramienta para crear, grabar, transcribir y editar audio
        directamente desde el navegador.
      </p>

      <h2 className="titulo-seccion">Qué puedes hacer</h2>
      <Tarjeta>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          <li>
            Convertir texto en voz con cuatro voces naturales en español, sin salir del
            navegador.
          </li>
          <li>Grabar tu voz con el micrófono de tu ordenador y editar la grabación.</li>
          <li>Transcribir archivos de audio a texto editable en español.</li>
          <li>
            Añadir música de fondo, mezclarla con tu voz y descargar el resultado en
            formatos estándar (MP3, WAV, OGG, M4A).
          </li>
        </ul>
      </Tarjeta>

      <h2 className="titulo-seccion">Cómo funciona, sin tecnicismos</h2>
      <Tarjeta>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          <li>
            <strong>Tu navegador hace el trabajo pesado.</strong> La generación de voz, la
            grabación, la mezcla y la edición se procesan directamente en tu dispositivo
            con las capacidades de audio integradas en los navegadores modernos.
          </li>
          <li>
            <strong>La voz se genera en tu propio dispositivo.</strong> Los modelos de
            síntesis de voz se descargan una sola vez y luego funcionan sin conexión:
            nadie más escucha ni guarda lo que escribes.
          </li>
          <li>
            <strong>Solo la transcripción necesita internet.</strong> Convertir audio en
            texto requiere un servicio externo (Groq), así que esa es la única función que
            envía datos fuera de tu dispositivo.
          </li>
          <li>
            <strong>Sin registro ni cuentas.</strong> Tus trabajos se guardan en tu
            navegador y nadie más tiene acceso a ellos.
          </li>
        </ul>
      </Tarjeta>

      <h2 className="titulo-seccion">Nuestra filosofía de privacidad</h2>
      <Tarjeta>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span className="item-trabajo-icono" aria-hidden>
            <IconoCandado size={22} />
          </span>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9, flex: 1 }}>
            <li>
              Todo lo que puede procesarse en tu dispositivo, se procesa en tu dispositivo.
            </li>
            <li>
              Solo enviamos datos a un servicio externo cuando una función lo exige
              (la transcripción) y te lo indicamos claramente.
            </li>
            <li>
              No creamos cuentas, no rastreamos tu contenido y no vendemos nada: la
              herramienta es la aplicación, no tus datos.
            </li>
          </ul>
        </div>
      </Tarjeta>

      <h2 className="titulo-seccion">Autor</h2>
      <Tarjeta>
        <p style={{ margin: 0 }}>
          <strong>Creado por Jon Peciña</strong> ·{' '}
          <a href="mailto:jpecina@gmail.com">jpecina@gmail.com</a>
        </p>
      </Tarjeta>
    </>
  );
}
