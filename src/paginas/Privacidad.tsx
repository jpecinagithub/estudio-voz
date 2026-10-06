/** Página «Tu privacidad»: qué datos se procesan y dónde. */
import { Tarjeta } from '../componentes/ui';
import { IconoCandado, IconoInfo } from '../componentes/iconos';

export function PaginaPrivacidad() {
  return (
    <>
      <h1 className="titulo-pagina">Tu privacidad</h1>
      <p className="subtitulo-pagina">
        Estudio Voz está diseñada para que tu audio se quede contigo siempre que sea
        posible. Aquí te explicamos exactamente qué ocurre con tus datos.
      </p>

      <h2 className="titulo-seccion">Qué se queda en tu dispositivo</h2>
      <Tarjeta>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          <li>
            <strong>Las grabaciones se procesan localmente</strong> siempre que es posible:
            grabar, editar, añadir música y mezclar ocurre íntegramente en tu navegador.
          </li>
          <li>
            <strong>La mezcla de audio ocurre en tu dispositivo.</strong> Tu voz y la música
            nunca viajan a ningún servidor para mezclarse.
          </li>
          <li>
            <strong>Tus proyectos del historial permanecen en tu navegador.</strong> Se
            guardan en el almacenamiento local de tu dispositivo y solo tú puedes verlos.
          </li>
          <li>
            <strong>No necesitas crear una cuenta</strong> y no asociamos tu actividad a
            ninguna identidad.
          </li>
        </ul>
      </Tarjeta>

      <h2 className="titulo-seccion">La única excepción: la transcripción</h2>
      <Tarjeta>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span className="item-trabajo-icono" aria-hidden>
            <IconoInfo size={22} />
          </span>
          <div>
            <p style={{ margin: '0 0 10px' }}>
              Convertir audio en texto requiere un servicio externo: es la{' '}
              <strong>única función que envía datos fuera de tu dispositivo</strong>. El
              audio se envía de forma segura al proveedor configurado (Groq) para
              transcribirlo, y <strong>esta función necesita conexión a internet</strong>.
            </p>
            <p style={{ margin: 0 }}>
              Si el archivo es muy grande, se utiliza un almacenamiento temporal
              intermedio que se elimina después de la transcripción: no se conservan
              copias de tus audios.
            </p>
          </div>
        </div>
      </Tarjeta>

      <h2 className="titulo-seccion">Tu control</h2>
      <Tarjeta>
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          <li>
            Puedes eliminar cualquier trabajo en «Mis audios» o vaciar todo el historial
            desde <strong>Ajustes → Almacenamiento</strong>.
          </li>
          <li>
            También puedes liberar los modelos de voz descargados para recuperar espacio
            en tu dispositivo.
          </li>
          <li>
            No recopilamos el contenido de tus textos, transcripciones ni nombres de
            archivo para analíticas.
          </li>
        </ul>
        <p
          className="campo-ayuda"
          style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14 }}
        >
          <IconoCandado size={16} aria-hidden />
          No afirmamos que «nada sale nunca de tu dispositivo»: la transcripción envía
          tu audio al proveedor configurado. Todo lo demás se queda contigo.
        </p>
      </Tarjeta>
    </>
  );
}
