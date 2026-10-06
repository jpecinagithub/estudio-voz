/**
 * Reproductor de audio profesional y reutilizable:
 * onda, reproducir/pausar, ±10 s, posición, duración, volumen y velocidad.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Waveform } from './Waveform';
import { formatearTiempo } from '../utils/formato';
import {
  IconoAdelante10,
  IconoAtras10,
  IconoPausa,
  IconoReproducir,
  IconoVolumen,
} from './iconos';

interface Props {
  /** Audio a reproducir. */
  blob: Blob | null;
  /** Picos precalculados para la onda (opcional). */
  picos?: Float32Array | null;
  titulo?: string;
  subtitulo?: string;
  /** Botones adicionales (Descargar, Añadir música…). */
  acciones?: ReactNode;
  autoReproducir?: boolean;
}

const VELOCIDADES = [0.75, 1, 1.25, 1.5, 2];

export function ReproductorAudio({
  blob,
  picos = null,
  titulo,
  subtitulo,
  acciones,
  autoReproducir = false,
}: Props) {
  const refAudio = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [tiempo, setTiempo] = useState(0);
  const [duracion, setDuracion] = useState(0);
  const [volumen, setVolumen] = useState(1);
  const [velocidad, setVelocidad] = useState(1);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    setTiempo(0);
    setReproduciendo(false);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  useEffect(() => {
    const audio = refAudio.current;
    if (!audio) return;
    audio.volume = volumen;
  }, [volumen, url]);

  useEffect(() => {
    const audio = refAudio.current;
    if (!audio) return;
    audio.playbackRate = velocidad;
  }, [velocidad, url]);

  useEffect(() => {
    if (autoReproducir && url) {
      void refAudio.current?.play().catch(() => undefined);
    }
  }, [url, autoReproducir]);

  const alternar = useCallback(() => {
    const audio = refAudio.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  }, []);

  const saltar = useCallback((segundos: number) => {
    const audio = refAudio.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + segundos));
  }, []);

  const buscar = useCallback(
    (proporcion: number) => {
      const audio = refAudio.current;
      if (!audio || !Number.isFinite(audio.duration)) return;
      audio.currentTime = proporcion * audio.duration;
      setTiempo(audio.currentTime);
    },
    [],
  );

  const progreso = useMemo(
    () => (duracion > 0 ? Math.min(1, tiempo / duracion) : 0),
    [tiempo, duracion],
  );

  if (!blob) return null;

  return (
    <div className="reproductor">
      {titulo && <p className="reproductor-titulo">{titulo}</p>}
      {subtitulo && <p className="reproductor-sub">{subtitulo}</p>}

      <audio
        ref={refAudio}
        src={url ?? undefined}
        preload="metadata"
        onPlay={() => setReproduciendo(true)}
        onPause={() => setReproduciendo(false)}
        onEnded={() => setReproduciendo(false)}
        onTimeUpdate={(e) => setTiempo(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuracion(e.currentTarget.duration || 0)}
        onDurationChange={(e) => setDuracion(e.currentTarget.duration || 0)}
      />

      <Waveform
        picos={picos}
        progreso={progreso}
        alBuscar={buscar}
        etiquetaAccesible="Forma de onda. Usa las flechas del teclado para moverte por el audio."
      />

      <div className="reproductor-controles">
        <button
          type="button"
          className="btn-icono"
          onClick={() => saltar(-10)}
          aria-label="Retroceder 10 segundos"
          title="Retroceder 10 segundos"
        >
          <IconoAtras10 />
        </button>
        <button
          type="button"
          className="btn-icono principal"
          onClick={alternar}
          aria-label={reproduciendo ? 'Pausar' : 'Reproducir'}
          title={reproduciendo ? 'Pausar' : 'Reproducir'}
        >
          {reproduciendo ? <IconoPausa size={26} /> : <IconoReproducir size={26} />}
        </button>
        <button
          type="button"
          className="btn-icono"
          onClick={() => saltar(10)}
          aria-label="Avanzar 10 segundos"
          title="Avanzar 10 segundos"
        >
          <IconoAdelante10 />
        </button>
        <span className="reproductor-tiempo" aria-live="off">
          {formatearTiempo(tiempo)} / {formatearTiempo(duracion)}
        </span>

        <div className="reproductor-opciones">
          <label className="reproductor-volumen">
            <IconoVolumen size={18} />
            <span className="sr-solo">Volumen</span>
            <input
              type="range"
              className="rango"
              min={0}
              max={1}
              step={0.05}
              value={volumen}
              onChange={(e) => setVolumen(Number(e.target.value))}
              aria-label="Volumen"
            />
          </label>
          <label>
            <span className="sr-solo">Velocidad de reproducción</span>
            <select
              className="reproductor-velocidad"
              value={velocidad}
              onChange={(e) => setVelocidad(Number(e.target.value))}
              aria-label="Velocidad de reproducción"
            >
              {VELOCIDADES.map((v) => (
                <option key={v} value={v}>
                  {v}×
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {acciones && <div className="grupo-botones espaciado">{acciones}</div>}
    </div>
  );
}
