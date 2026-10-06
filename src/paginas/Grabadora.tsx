/**
 * Página "Grabadora": graba voz desde el navegador, edita la toma y la
 * guarda en el historial local. Todo el procesado ocurre en el dispositivo.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DURACION_MAXIMA_GRABACION_SEG } from '../config';
import { audioBufferAWav, calcularPicos, decodificarAudio } from '../audio/motor';
import { guardarAudioSesion } from '../audio/sesion';
import { crearId, guardarTrabajo } from '../storage/db';
import { descargarBlob } from '../utils/descarga';
import { mensajeAmigable, puedeReintentarse } from '../utils/errores';
import { formatearTiempo } from '../utils/formato';
import { ErrorApp } from '../tipos';
import { EditorAudio } from '../componentes/EditorAudio';
import { ReproductorAudio } from '../componentes/ReproductorAudio';
import { Aviso, Boton, Tarjeta } from '../componentes/ui';
import { IconoMicrofono, IconoPausa, IconoDetener, IconoCerrar } from '../componentes/iconos';

type Estado = 'inactivo' | 'grabando' | 'pausado' | 'editor' | 'resultado';

const TIPOS_MIME = [
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/webm',
  'audio/mp4',
];

const MINUTOS_LIMITE = Math.round(DURACION_MAXIMA_GRABACION_SEG / 60);

export function PaginaGrabadora() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<Estado>('inactivo');
  const [segundos, setSegundos] = useState(0);
  const [nivel, setNivel] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [avisoLimite, setAvisoLimite] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [blobWav, setBlobWav] = useState<Blob | null>(null);
  const [nombreResultado, setNombreResultado] = useState('mi-grabacion');

  const refCanvas = useRef<HTMLCanvasElement>(null);
  const refGrabadora = useRef<MediaRecorder | null>(null);
  const refFlujo = useRef<MediaStream | null>(null);
  const refContexto = useRef<AudioContext | null>(null);
  const refAnalizador = useRef<AnalyserNode | null>(null);
  const refAnimacion = useRef<number>(0);
  const refIntervalo = useRef<number>(0);
  const refTrozos = useRef<Blob[]>([]);
  const refInicioMs = useRef(0);
  const refAcumuladoMs = useRef(0);
  const refCancelando = useRef(false);

  /* ── Limpieza de recursos (tracks + AudioContext + temporizadores) ── */

  const limpiarRecursos = useCallback(() => {
    cancelAnimationFrame(refAnimacion.current);
    window.clearInterval(refIntervalo.current);
    refAnalizador.current?.disconnect();
    refGrabadora.current = null;
    if (refContexto.current) {
      void refContexto.current.close().catch(() => undefined);
      refContexto.current = null;
    }
    if (refFlujo.current) {
      refFlujo.current.getTracks().forEach((pista) => pista.stop());
      refFlujo.current = null;
    }
  }, []);

  useEffect(() => {
    return () => limpiarRecursos();
  }, [limpiarRecursos]);

  /* ── Visualización: osciloscopio + nivel del micrófono ── */

  const dibujarOnda = useCallback(() => {
    const analizador = refAnalizador.current;
    const canvas = refCanvas.current;
    if (!analizador || !canvas) return;
    const contexto2d = canvas.getContext('2d');
    if (!contexto2d) return;

    const ancho = canvas.width;
    const alto = canvas.height;
    const datos = new Uint8Array(analizador.fftSize);
    analizador.getByteTimeDomainData(datos);

    // Nivel RMS (0–100).
    let suma = 0;
    for (let i = 0; i < datos.length; i++) {
      const v = (datos[i] - 128) / 128;
      suma += v * v;
    }
    setNivel(Math.min(100, Math.round(Math.sqrt(suma / datos.length) * 100 * 2.2)));

    contexto2d.clearRect(0, 0, ancho, alto);
    contexto2d.lineWidth = 2;
    contexto2d.strokeStyle = '#38bdf8';
    contexto2d.beginPath();
    const paso = ancho / datos.length;
    for (let i = 0; i < datos.length; i++) {
      const y = ((datos[i] - 128) / 128) * (alto / 2) + alto / 2;
      if (i === 0) contexto2d.moveTo(0, y);
      else contexto2d.lineTo(i * paso, y);
    }
    contexto2d.stroke();

    refAnimacion.current = requestAnimationFrame(dibujarOnda);
  }, []);

  const arrancarVisualizacion = useCallback(
    (contexto: AudioContext, fuente: MediaStreamAudioSourceNode) => {
      const analizador = contexto.createAnalyser();
      analizador.fftSize = 2048;
      fuente.connect(analizador);
      refAnalizador.current = analizador;
      refAnimacion.current = requestAnimationFrame(dibujarOnda);
    },
    [dibujarOnda],
  );

  /* ── Reloj de la grabación ── */

  const segundosTranscurridos = useCallback(() => {
    return Math.floor((Date.now() - refInicioMs.current + refAcumuladoMs.current) / 1000);
  }, []);

  const arrancarReloj = useCallback(
    (alDetener: () => void) => {
      refIntervalo.current = window.setInterval(() => {
        const s = segundosTranscurridos();
        setSegundos(s);
        if (s >= DURACION_MAXIMA_GRABACION_SEG) {
          window.clearInterval(refIntervalo.current);
          setAvisoLimite(true);
          alDetener();
        }
      }, 1000);
    },
    [segundosTranscurridos],
  );

  /* ── Inicio / pausa / continuación / detención / cancelación ── */

  const detener = useCallback(() => {
    window.clearInterval(refIntervalo.current);
    const grabadora = refGrabadora.current;
    if (grabadora && grabadora.state !== 'inactive') {
      grabadora.stop();
    }
  }, []);

  const procesarGrabacion = useCallback(async () => {
    setProcesando(true);
    setError(null);
    setBuffer(null);
    setEstado('editor');
    try {
      const trozos = refTrozos.current;
      const tipo = refGrabadora.current?.mimeType || 'audio/webm';
      const blob = new Blob(trozos, { type: tipo });
      const audio = await decodificarAudio(blob);
      setBuffer(audio);
    } catch (e) {
      setError(e);
    } finally {
      setProcesando(false);
    }
  }, []);

  const iniciarGrabacion = useCallback(async () => {
    setError(null);
    setAvisoLimite(false);
    refCancelando.current = false;
    refTrozos.current = [];
    refAcumuladoMs.current = 0;
    setSegundos(0);
    setNivel(0);

    try {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === 'undefined'
      ) {
        throw new ErrorApp(
          'navegador-incompatible',
          'Tu navegador no permite grabar audio.',
        );
      }
      const tipoMime = TIPOS_MIME.find((t) => {
        try {
          return MediaRecorder.isTypeSupported(t);
        } catch {
          return false;
        }
      });
      if (!tipoMime) {
        throw new ErrorApp(
          'navegador-incompatible',
          'Tu navegador no ofrece un formato de grabación compatible.',
        );
      }

      const flujo = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      refFlujo.current = flujo;

      const contexto = new AudioContext();
      refContexto.current = contexto;
      const fuente = contexto.createMediaStreamSource(flujo);
      arrancarVisualizacion(contexto, fuente);

      const grabadora = new MediaRecorder(flujo, {
        mimeType: tipoMime,
        audioBitsPerSecond: 128000,
      });
      refTrozos.current = [];
      grabadora.ondataavailable = (evento: BlobEvent) => {
        if (evento.data && evento.data.size > 0) refTrozos.current.push(evento.data);
      };
      grabadora.onstop = () => {
        if (!refCancelando.current) void procesarGrabacion();
      };
      grabadora.onerror = () => {
        if (!refCancelando.current) {
          setError(new ErrorApp('grabacion-fallo', 'La grabación se ha interrumpido.'));
          setEstado('inactivo');
        }
      };
      grabadora.start(500);
      refGrabadora.current = grabadora;

      refInicioMs.current = Date.now();
      setEstado('grabando');
      arrancarReloj(detener);
    } catch (e) {
      limpiarRecursos();
      setError(e);
      setEstado('inactivo');
    }
  }, [arrancarReloj, arrancarVisualizacion, detener, limpiarRecursos, procesarGrabacion]);

  const pausar = () => {
    const grabadora = refGrabadora.current;
    if (grabadora && grabadora.state === 'recording') {
      window.clearInterval(refIntervalo.current);
      refAcumuladoMs.current += Date.now() - refInicioMs.current;
      grabadora.pause();
      setEstado('pausado');
    }
  };

  const continuar = () => {
    const grabadora = refGrabadora.current;
    if (grabadora && grabadora.state === 'paused') {
      refInicioMs.current = Date.now();
      grabadora.resume();
      setEstado('grabando');
      arrancarReloj(detener);
    }
  };

  const cancelar = () => {
    refCancelando.current = true;
    limpiarRecursos();
    refTrozos.current = [];
    setSegundos(0);
    setNivel(0);
    setBuffer(null);
    setEstado('inactivo');
  };

  /* ── Guardar y acciones del resultado ── */

  const guardar = async (resultado: { buffer: AudioBuffer; nombre: string }) => {
    setProcesando(true);
    setError(null);
    try {
      const wav = audioBufferAWav(resultado.buffer);
      const nombre = resultado.nombre.trim() || 'mi-grabacion';
      await guardarTrabajo({
        id: crearId(),
        nombre,
        tipo: 'grabacion',
        fecha: Date.now(),
        duracionSeg: resultado.buffer.duration,
        audio: wav,
        texto: null,
      });
      setBuffer(resultado.buffer);
      setBlobWav(wav);
      setNombreResultado(nombre);
      setEstado('resultado');
    } catch (e) {
      setError(e);
    } finally {
      setProcesando(false);
    }
  };

  const irATranscribir = () => {
    if (!buffer) return;
    guardarAudioSesion('grabadora-transcribir', buffer);
    navigate('/audio-texto?sesion=grabadora-transcribir');
  };

  const irAMezclador = () => {
    if (!buffer) return;
    guardarAudioSesion('grabadora-mezcla', buffer);
    navigate('/mezclador?voz=sesion:grabadora-mezcla');
  };

  const descargar = () => {
    if (blobWav) descargarBlob(blobWav, `${nombreResultado}.wav`);
  };

  const grabarDeNuevo = () => {
    setBuffer(null);
    setBlobWav(null);
    setAvisoLimite(false);
    setError(null);
    setEstado('inactivo');
  };

  const reintentar = () => {
    setError(null);
    if (estado === 'inactivo') void iniciarGrabacion();
  };

  const estadoTexto = estado === 'grabando' ? 'Grabando' : estado === 'pausado' ? 'En pausa' : null;

  return (
    <div className="pagina">
      <h1 className="pagina-titulo">Grabadora</h1>
      <p className="pagina-descripcion">
        Graba tu voz directamente desde el micrófono. Todo se procesa en tu dispositivo.
      </p>

      {avisoLimite ? (
        <Aviso tipo="info">
          Has llegado al límite de {MINUTOS_LIMITE} minutos por grabación.
        </Aviso>
      ) : null}

      {error ? (
        <Aviso
          tipo="error"
          accion={
            puedeReintentarse(error) ? (
              <Boton variante="primario" pequeno onClick={reintentar} aria-label="Reintentar la grabación">
                Reintentar
              </Boton>
            ) : undefined
          }
        >
          {mensajeAmigable(error)}
        </Aviso>
      ) : null}

      {estado === 'inactivo' && (
        <Tarjeta elevada className="grabadora-inicio">
          <IconoMicrofono size={64} />
          <p className="tarjeta-descripcion">
            Pulsa el botón y empieza a hablar. Cuando termines, podrás editar la grabación,
            añadirle música o transcribirla.
          </p>
          <Boton variante="primario" grande onClick={() => void iniciarGrabacion()} aria-label="Empezar a grabar">
            <IconoMicrofono size={20} />
            Empezar a grabar
          </Boton>
        </Tarjeta>
      )}

      {(estado === 'grabando' || estado === 'pausado') && (
        <Tarjeta elevada>
          <div className="grabadora-cabecera">
            {estadoTexto && (
              <p className="grabadora-estado">
                {estado === 'grabando' && <span className="punto-grabacion" aria-hidden="true" />}
                {estadoTexto}
              </p>
            )}
            <p className="grabadora-tiempo" aria-live="off" aria-label={`Tiempo transcurrido: ${formatearTiempo(segundos)}`}>
              {formatearTiempo(segundos)}
            </p>
          </div>

          <canvas
            ref={refCanvas}
            width={640}
            height={120}
            className="grabadora-osciloscopio"
            role="img"
            aria-label="Osciloscopio en vivo de la grabación"
          />

          <div className="grabadora-nivel" aria-label={`Nivel del micrófono: ${nivel} por ciento`}>
            <span className="grabadora-nivel-etiqueta">Nivel</span>
            <div className="grabadora-nivel-barra">
              <div className="grabadora-nivel-relleno" style={{ width: `${nivel}%` }} />
            </div>
          </div>

          <div className="fila-botones">
            {estado === 'grabando' ? (
              <Boton variante="secundario" onClick={pausar} aria-label="Pausar la grabación">
                <IconoPausa size={18} />
                Pausar
              </Boton>
            ) : (
              <Boton variante="primario" onClick={continuar} aria-label="Continuar la grabación">
                <IconoMicrofono size={18} />
                Continuar
              </Boton>
            )}
            <Boton variante="peligro" onClick={detener} aria-label="Detener la grabación">
              <IconoDetener size={18} />
              Detener
            </Boton>
            <Boton variante="fantasma" onClick={cancelar} aria-label="Cancelar la grabación sin guardar">
              <IconoCerrar size={18} />
              Cancelar
            </Boton>
          </div>
        </Tarjeta>
      )}

      {procesando && estado === 'editor' && !buffer && (
        <p className="mensaje-carga">Procesando grabación…</p>
      )}

      {estado === 'editor' && buffer && (
        <EditorAudio
          buffer={buffer}
          titulo="Edita tu grabación"
          nombreSugerido="mi-grabacion"
          textoBotonGuardar="Guardar grabación"
          alGuardar={(resultado) => void guardar(resultado)}
          alCancelar={cancelar}
        />
      )}

      {estado === 'resultado' && buffer && (
        <>
          <Aviso tipo="exito">Grabación lista. Ya está guardada en «Mis audios».</Aviso>
          <Tarjeta elevada>
            <h2 className="tarjeta-titulo">{nombreResultado}</h2>
            <ReproductorAudio
              blob={blobWav}
              picos={calcularPicos(buffer, 160)}
              titulo="Grabación"
              subtitulo={`Duración: ${formatearTiempo(buffer.duration)}`}
              acciones={
                <div className="fila-botones">
                  <Boton variante="primario" onClick={irATranscribir} aria-label="Transcribir esta grabación">
                    Transcribir
                  </Boton>
                  <Boton variante="secundario" onClick={irAMezclador} aria-label="Abrir esta grabación en el mezclador">
                    Abrir en mezclador
                  </Boton>
                  <Boton variante="secundario" onClick={descargar} aria-label="Descargar la grabación en formato WAV">
                    Descargar
                  </Boton>
                  <Boton variante="fantasma" onClick={grabarDeNuevo} aria-label="Hacer una nueva grabación">
                    Grabar de nuevo
                  </Boton>
                </div>
              }
            />
          </Tarjeta>
        </>
      )}
    </div>
  );
}
