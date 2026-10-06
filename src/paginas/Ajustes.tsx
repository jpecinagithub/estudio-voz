/** Página de ajustes: voz, exportación, mezcla, almacenamiento e información. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Aviso, Boton, Deslizador, Interruptor, Modal, Tarjeta } from '../componentes/ui';
import { APP_VERSION, CALIDADES_EXPORTACION, VOCES } from '../config';
import { NOMBRES_FORMATO, type FormatoExportacion } from '../tipos';
import { guardarAjustes, leerAjustes, type Ajustes } from '../utils/ajustes';
import { vaciarHistorial } from '../storage/db';
import { liberarVoces } from '../tts/motor';

const FORMATOS: FormatoExportacion[] = ['mp3', 'wav', 'ogg', 'm4a'];

export function PaginaAjustes() {
  const [ajustes, setAjustes] = useState<Ajustes>(() => leerAjustes());
  const [confirmarVaciar, setConfirmarVaciar] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [vaciando, setVaciando] = useState(false);

  /** Actualiza un ajuste y lo guarda automáticamente en el navegador. */
  function actualizar(cambio: Partial<Ajustes>) {
    setAjustes((previos) => {
      const siguientes = { ...previos, ...cambio };
      guardarAjustes(siguientes);
      return siguientes;
    });
  }

  async function alConfirmarVaciar() {
    setVaciando(true);
    setMensajeError(null);
    try {
      await vaciarHistorial();
      setMensajeExito('Historial vaciado correctamente.');
    } catch {
      setMensajeError(
        'No se ha podido vaciar el historial. Cierra otras pestañas e inténtalo de nuevo.',
      );
    } finally {
      setVaciando(false);
      setConfirmarVaciar(false);
    }
  }

  function alLiberarModelos() {
    try {
      liberarVoces();
      setMensajeError(null);
      setMensajeExito(
        'Modelos de voz liberados. La próxima vez que generes audio se descargarán de nuevo.',
      );
    } catch {
      setMensajeError('No se han podido liberar los modelos de voz. Inténtalo de nuevo.');
    }
  }

  return (
    <>
      <h1 className="titulo-pagina">Ajustes</h1>
      <p className="subtitulo-pagina">
        Los cambios se guardan automáticamente en tu navegador.
      </p>

      {mensajeExito && <Aviso tipo="exito">{mensajeExito}</Aviso>}
      {mensajeError && <Aviso tipo="error">{mensajeError}</Aviso>}

      <h2 className="titulo-seccion">Voz</h2>
      <Tarjeta>
        <Deslizador
          etiqueta="Velocidad de voz"
          valor={ajustes.velocidadVoz}
          min={0.5}
          max={2}
          paso={0.05}
          alCambiar={(v) => actualizar({ velocidadVoz: v })}
          formatoValor={(v) => `${v.toFixed(2)}×`}
          ayuda="Velocidad a la que se generará la voz a partir del texto."
        />
        <div className="campo" style={{ marginTop: 16 }}>
          <label className="campo-etiqueta" htmlFor="voz-por-defecto">
            Voz por defecto
          </label>
          <select
            id="voz-por-defecto"
            className="seleccion"
            value={ajustes.vozPorDefecto}
            onChange={(e) =>
              actualizar({ vozPorDefecto: e.target.value as Ajustes['vozPorDefecto'] })
            }
          >
            {VOCES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre} ({v.genero})
              </option>
            ))}
          </select>
        </div>
      </Tarjeta>

      <h2 className="titulo-seccion">Exportación</h2>
      <Tarjeta>
        <div className="rejilla rejilla-2">
          <div className="campo">
            <label className="campo-etiqueta" htmlFor="formato-exportacion">
              Formato de descarga
            </label>
            <select
              id="formato-exportacion"
              className="seleccion"
              value={ajustes.formatoExportacion}
              onChange={(e) =>
                actualizar({ formatoExportacion: e.target.value as FormatoExportacion })
              }
            >
              {FORMATOS.map((f) => (
                <option key={f} value={f}>
                  {NOMBRES_FORMATO[f]}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label className="campo-etiqueta" htmlFor="calidad-exportacion">
              Calidad
            </label>
            <select
              id="calidad-exportacion"
              className="seleccion"
              value={ajustes.calidadExportacion}
              onChange={(e) =>
                actualizar({ calidadExportacion: e.target.value as Ajustes['calidadExportacion'] })
              }
            >
              {CALIDADES_EXPORTACION.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} — {c.descripcion}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Tarjeta>

      <h2 className="titulo-seccion">Mezcla</h2>
      <Tarjeta>
        <Deslizador
          etiqueta="Volumen de la música"
          valor={ajustes.volumenMusica}
          min={0}
          max={100}
          alCambiar={(v) => actualizar({ volumenMusica: v })}
          formatoValor={(v) => `${v} %`}
          ayuda="Volumen por defecto de la música de fondo respecto a la voz."
        />
        <Interruptor
          etiqueta="Reducir música mientras hay voz"
          activado={ajustes.ducking}
          alCambiar={(v) => actualizar({ ducking: v })}
          ayuda="Baja automáticamente la música cuando se escucha la voz para que siempre se entienda bien."
        />
      </Tarjeta>

      <h2 className="titulo-seccion">Almacenamiento</h2>
      <Tarjeta>
        <div className="grupo-botones">
          <Boton variante="peligro" onClick={() => setConfirmarVaciar(true)}>
            Vaciar historial
          </Boton>
          <Boton onClick={alLiberarModelos}>Liberar modelos de voz</Boton>
        </div>
        <p className="campo-ayuda">
          «Vaciar historial» elimina los trabajos de «Mis audios». «Liberar modelos de voz»
          borra las voces descargadas para que ocupen menos espacio en tu dispositivo.
        </p>
      </Tarjeta>

      <h2 className="titulo-seccion">Información</h2>
      <Tarjeta>
        <p style={{ margin: '0 0 10px' }}>
          <strong>Estudio Voz</strong> · versión {APP_VERSION}
        </p>
        <p style={{ margin: 0 }}>
          <Link to="/acerca">Acerca de esta aplicación</Link>
          {' · '}
          <Link to="/privacidad">Tu privacidad</Link>
        </p>
      </Tarjeta>

      {confirmarVaciar && (
        <Modal titulo="Vaciar historial" alCerrar={() => setConfirmarVaciar(false)}>
          <p>
            ¿Seguro que quieres eliminar todos los trabajos de «Mis audios»? Esta acción no
            se puede deshacer.
          </p>
          <div className="grupo-botones">
            <Boton variante="fantasma" onClick={() => setConfirmarVaciar(false)}>
              Cancelar
            </Boton>
            <Boton variante="peligro" onClick={alConfirmarVaciar} disabled={vaciando}>
              {vaciando ? 'Vaciando…' : 'Sí, vaciar historial'}
            </Boton>
          </div>
        </Modal>
      )}
    </>
  );
}
