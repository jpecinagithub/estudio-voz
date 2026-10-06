/**
 * Editor básico de audio: recortar inicio/fin, volumen, normalizar y fundidos.
 * Todo con Web Audio API, en el dispositivo.
 */
import { useMemo, useState } from 'react';
import {
  aplicarFundido,
  aplicarGanancia,
  audioBufferAWav,
  calcularPicos,
  normalizarAudio,
  recortarAudio,
} from '../audio/motor';
import { ReproductorAudio } from './ReproductorAudio';
import { formatearTiempo } from '../utils/formato';
import { mensajeAmigable } from '../utils/errores';
import { Aviso, Boton, Deslizador, Interruptor, Tarjeta } from './ui';

interface Props {
  buffer: AudioBuffer;
  titulo?: string;
  nombreSugerido?: string;
  textoBotonGuardar?: string;
  alGuardar: (resultado: { buffer: AudioBuffer; nombre: string }) => void;
  alCancelar: () => void;
}

export function EditorAudio({
  buffer,
  titulo = 'Editar audio',
  nombreSugerido = 'mi-audio',
  textoBotonGuardar = 'Guardar',
  alGuardar,
  alCancelar,
}: Props) {
  const duracion = buffer.duration;
  const [inicio, setInicio] = useState(0);
  const [fin, setFin] = useState(duracion);
  const [volumen, setVolumen] = useState(100);
  const [normalizar, setNormalizar] = useState(false);
  const [fundidoEntrada, setFundidoEntrada] = useState(0);
  const [fundidoSalida, setFundidoSalida] = useState(0);
  const [nombre, setNombre] = useState(nombreSugerido);

  const picos = useMemo(() => calcularPicos(buffer, 160), [buffer]);

  const vistaPrevia = useMemo(() => {
    try {
      let b = recortarAudio(buffer, inicio, Math.max(inicio + 0.1, fin));
      if (volumen !== 100) b = aplicarGanancia(b, volumen / 100);
      if (normalizar) b = normalizarAudio(b);
      if (fundidoEntrada > 0 || fundidoSalida > 0) {
        b = aplicarFundido(b, fundidoEntrada, fundidoSalida);
      }
      return { buffer: b as AudioBuffer | null, blob: audioBufferAWav(b), error: null as string | null };
    } catch (e) {
      return { buffer: null as AudioBuffer | null, blob: null as Blob | null, error: mensajeAmigable(e) };
    }
  }, [buffer, inicio, fin, volumen, normalizar, fundidoEntrada, fundidoSalida]);

  const guardar = () => {
    if (!vistaPrevia.buffer) return;
    alGuardar({ buffer: vistaPrevia.buffer, nombre: nombre.trim() || nombreSugerido });
  };

  return (
    <Tarjeta elevada>
      <h2 className="tarjeta-titulo">{titulo}</h2>
      <p className="tarjeta-descripcion">
        Ajusta el audio y escucha el resultado antes de guardarlo. Duración original:{' '}
        {formatearTiempo(duracion)}.
      </p>

      {vistaPrevia.error && <Aviso tipo="error">{vistaPrevia.error}</Aviso>}

      <ReproductorAudio
        blob={vistaPrevia.blob}
        picos={vistaPrevia.buffer ? calcularPicos(vistaPrevia.buffer, 160) : picos}
        titulo="Vista previa"
        subtitulo={`Duración: ${formatearTiempo(vistaPrevia.buffer?.duration ?? 0)}`}
      />

      <div className="rejilla rejilla-2 espaciado">
        <div>
          <Deslizador
            etiqueta="Inicio del recorte"
            valor={inicio}
            min={0}
            max={Math.max(0, duracion - 0.1)}
            paso={0.1}
            alCambiar={(v) => setInicio(Math.min(v, fin - 0.1))}
            formatoValor={(v) => formatearTiempo(v)}
          />
          <Deslizador
            etiqueta="Fin del recorte"
            valor={fin}
            min={0.1}
            max={duracion}
            paso={0.1}
            alCambiar={(v) => setFin(Math.max(v, inicio + 0.1))}
            formatoValor={(v) => formatearTiempo(v)}
          />
        </div>
        <div>
          <Deslizador
            etiqueta="Volumen"
            valor={volumen}
            min={0}
            max={200}
            alCambiar={setVolumen}
            formatoValor={(v) => `${v} %`}
          />
          <Interruptor
            etiqueta="Normalizar volumen"
            activado={normalizar}
            alCambiar={setNormalizar}
            ayuda="Ajusta el pico máximo a un nivel óptimo."
          />
        </div>
      </div>

      <div className="rejilla rejilla-2">
        <Deslizador
          etiqueta="Fundido de entrada"
          valor={fundidoEntrada}
          min={0}
          max={Math.min(10, duracion / 2)}
          paso={0.1}
          alCambiar={setFundidoEntrada}
          formatoValor={(v) => `${v.toFixed(1)} s`}
          ayuda="El audio empieza suavemente."
        />
        <Deslizador
          etiqueta="Fundido de salida"
          valor={fundidoSalida}
          min={0}
          max={Math.min(10, duracion / 2)}
          paso={0.1}
          alCambiar={setFundidoSalida}
          formatoValor={(v) => `${v.toFixed(1)} s`}
          ayuda="El audio termina suavemente."
        />
      </div>

      <div className="campo espaciado">
        <label className="campo-etiqueta" htmlFor="editor-nombre">
          Nombre
        </label>
        <input
          id="editor-nombre"
          className="entrada"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={80}
        />
      </div>

      <div className="grupo-botones">
        <Boton variante="primario" onClick={guardar} disabled={!vistaPrevia.buffer}>
          {textoBotonGuardar}
        </Boton>
        <Boton onClick={alCancelar}>Cancelar</Boton>
      </div>
    </Tarjeta>
  );
}
