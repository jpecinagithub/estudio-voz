/**
 * Página "Texto a voz": editor de texto, selección de voz, ajustes de
 * velocidad, generación, descarga del modelo, resultado y exportación.
 * Todo el texto visible está en español.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { VOCES, type Voz } from '../config';
import { estadoVoz, prepararVoz, sintetizarVoz } from '../tts/motor';
import type { EstadoModeloVoz, IdVoz } from '../tts/motor';
import { audioBufferAWav, calcularPicos, estimarDuracionTexto } from '../audio/motor';
import { exportarAudio, nombreArchivoExportacion } from '../exportar/codificadores';
import { crearId, guardarTrabajo } from '../storage/db';
import { guardarAudioSesion } from '../audio/sesion';
import { descargarBlob } from '../utils/descarga';
import { formatearTiempo } from '../utils/formato';
import { mensajeAmigable, puedeReintentarse } from '../utils/errores';
import { leerAjustes } from '../utils/ajustes';
import {
  Aviso,
  BarraProgreso,
  Boton,
  Cargando,
  Deslizador,
  Tarjeta,
} from '../componentes/ui';
import { ReproductorAudio } from '../componentes/ReproductorAudio';
import {
  IconoAbrir,
  IconoCheck,
  IconoDescargar,
  IconoMusica,
  IconoPausa,
  IconoReproducir,
} from '../componentes/iconos';

const MAX_CARACTERES = 5000;
const CLAVE_SESION_MEZCLA = 'tts-mezcla';

interface ErrorVisible {
  mensaje: string;
  reintentable: boolean;
  reintentar: () => void;
}

interface ResultadoVoz {
  blob: Blob;
  buffer: AudioBuffer;
  picos: Float32Array;
  vozNombre: string;
  duracion: number;
}

interface DescargaModelo {
  vozId: IdVoz;
  porcentaje: number | null;
  tamano?: string;
  detalle?: string;
}

export function PaginaTextoVoz() {
  const navegar = useNavigate();

  const [texto, setTexto] = useState('');
  const [vozId, setVozId] = useState<IdVoz>(() => leerAjustes().vozPorDefecto);
  const [velocidad, setVelocidad] = useState<number>(() => leerAjustes().velocidadVoz);

  const [generando, setGenerando] = useState(false);
  const [descarga, setDescarga] = useState<DescargaModelo | null>(null);
  const [error, setError] = useState<ErrorVisible | null>(null);
  const [resultado, setResultado] = useState<ResultadoVoz | null>(null);

  const [exportando, setExportando] = useState(false);
  const [faseExportacion, setFaseExportacion] = useState<string | null>(null);

  const [muestraVozId, setMuestraVozId] = useState<IdVoz | null>(null);
  const [muestraCargando, setMuestraCargando] = useState(false);

  /** Preparación de modelo en curso, para cancelarla al cambiar de voz. */
  const prepRef = useRef<{ controlador: AbortController; vozId: IdVoz } | null>(null);
  const audioMuestraRef = useRef<HTMLAudioElement | null>(null);
  const urlMuestraRef = useRef<string | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  /* ── Limpieza al desmontar: cancela la descarga y revoca la URL de la muestra. */
  useEffect(() => {
    return () => {
      prepRef.current?.controlador.abort();
      if (urlMuestraRef.current) URL.revokeObjectURL(urlMuestraRef.current);
    };
  }, []);

  function mostrarError(fallo: unknown, reintentar: () => void) {
    setError({
      mensaje: mensajeAmigable(fallo),
      reintentable: puedeReintentarse(fallo),
      reintentar,
    });
  }

  /**
   * Garantiza que el modelo de la voz esté listo, descargándolo la primera vez.
   * Informa del progreso y puede cancelarse con el controlador interno.
   */
  async function asegurarVozLista(id: IdVoz): Promise<void> {
    if (estadoVoz(id).estado === 'listo') return;
    // Cancela cualquier preparación anterior (p. ej. otra voz).
    prepRef.current?.controlador.abort();
    const controlador = new AbortController();
    prepRef.current = { controlador, vozId: id };
    setDescarga({ vozId: id, porcentaje: null });
    try {
      await prepararVoz(
        id,
        (estado: EstadoModeloVoz) => {
          setDescarga({
            vozId: id,
            porcentaje: estado.porcentaje,
            tamano: estado.tamanoAproximado,
            detalle: estado.detalle,
          });
        },
        controlador.signal,
      );
    } finally {
      if (prepRef.current?.controlador === controlador) {
        prepRef.current = null;
        setDescarga(null);
      }
    }
  }

  function detenerMuestra() {
    const audio = audioMuestraRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    if (urlMuestraRef.current) {
      URL.revokeObjectURL(urlMuestraRef.current);
      urlMuestraRef.current = null;
    }
    setMuestraVozId(null);
    setMuestraCargando(false);
  }

  /** Reproduce (o detiene) la muestra de una voz con un elemento <audio> dedicado. */
  async function escucharMuestra(voz: Voz) {
    // Si esta muestra ya está sonando o preparándose, se detiene.
    if (muestraVozId === voz.id) {
      detenerMuestra();
      return;
    }
    detenerMuestra();
    setError(null);
    setMuestraVozId(voz.id);
    setMuestraCargando(true);
    try {
      await asegurarVozLista(voz.id);
      const buffer = await sintetizarVoz(voz.textoMuestra, voz.id, 1);
      const url = URL.createObjectURL(audioBufferAWav(buffer));
      urlMuestraRef.current = url;
      const audio = audioMuestraRef.current;
      if (!audio) return;
      audio.src = url;
      setMuestraCargando(false);
      await audio.play();
    } catch (fallo) {
      detenerMuestra();
      // Cancelado por el usuario (cambió de voz): no es un error visible.
      if (fallo instanceof DOMException && fallo.name === 'AbortError') return;
      mostrarError(fallo, () => escucharMuestra(voz));
    }
  }

  function seleccionarVoz(id: IdVoz) {
    if (id !== vozId) {
      // Cancela la descarga en curso si el usuario cambia de voz a mitad.
      prepRef.current?.controlador.abort();
      prepRef.current = null;
      setDescarga(null);
    }
    setVozId(id);
  }

  /** Genera el audio del texto con la voz y velocidad elegidas. */
  async function generar() {
    const textoActual = texto.trim();
    const id = vozId;
    const vel = velocidad;
    if (!textoActual || generando) return;
    detenerMuestra();
    setError(null);
    setGenerando(true);
    try {
      await asegurarVozLista(id);
      const buffer = await sintetizarVoz(textoActual, id, vel);
      const blob = audioBufferAWav(buffer);
      const picos = calcularPicos(buffer, 240);
      const voz = VOCES.find((v) => v.id === id) ?? VOCES[0];
      const primeras = textoActual.split(/\s+/).slice(0, 8).join(' ');
      const nombreBase = `Voz de ${voz.nombre} — ${primeras}`;
      const nombre =
        nombreBase.length > 40 ? `${nombreBase.slice(0, 37)}…` : nombreBase;
      try {
        await guardarTrabajo({
          id: crearId(),
          nombre,
          tipo: 'voz',
          fecha: Date.now(),
          duracionSeg: Math.round(buffer.duration),
          audio: blob,
          texto: textoActual,
        });
      } catch (fallo) {
        // El audio ya está generado; el fallo solo afecta al historial.
        mostrarError(fallo, generar);
      }
      setResultado({
        blob,
        buffer,
        picos,
        vozNombre: voz.nombre,
        duracion: buffer.duration,
      });
    } catch (fallo) {
      if (fallo instanceof DOMException && fallo.name === 'AbortError') return;
      mostrarError(fallo, generar);
    } finally {
      setGenerando(false);
    }
  }

  /** Exporta el audio generado con el formato y la calidad de los ajustes. */
  async function descargar() {
    if (!resultado || exportando) return;
    const ajustes = leerAjustes();
    setError(null);
    setExportando(true);
    setFaseExportacion('Preparando tu audio…');
    try {
      const blob = await exportarAudio(
        resultado.buffer,
        ajustes.formatoExportacion,
        ajustes.calidadExportacion,
        (fase) => setFaseExportacion(fase),
      );
      descargarBlob(blob, nombreArchivoExportacion('mi-voz', ajustes.formatoExportacion));
    } catch (fallo) {
      mostrarError(fallo, descargar);
    } finally {
      setExportando(false);
      setFaseExportacion(null);
    }
  }

  /** Envía la voz al mezclador a través de la sesión en memoria. */
  function irAMezclador() {
    if (!resultado) return;
    guardarAudioSesion(CLAVE_SESION_MEZCLA, resultado.buffer);
    navegar(`/mezclador?voz=sesion:${CLAVE_SESION_MEZCLA}`);
  }

  /** Oculta el resultado, mantiene el texto y vuelve al editor. */
  function crearOtraVersion() {
    setResultado(null);
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    areaRef.current?.focus({ preventScroll: true });
  }

  function alTeclaEditor(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      void generar();
    }
  }

  const textoLimpio = texto.trim();
  const duracionEstimada = formatearTiempo(estimarDuracionTexto(texto));

  return (
    <>
      <h1 className="titulo-pagina">Texto a voz</h1>
      <p className="subtitulo-pagina">
        Escribe o pega tu texto, elige una voz y genera un audio natural en español.
      </p>

      {/* ── 1. Editor de texto ── */}
      <div ref={editorRef}>
        <Tarjeta>
          <h2 className="tarjeta-titulo">Tu texto</h2>
          <textarea
            ref={areaRef}
            className="area-texto"
            aria-label="Texto para convertir en voz"
            placeholder="Escribe o pega aquí el texto…"
            value={texto}
            maxLength={MAX_CARACTERES}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={alTeclaEditor}
            disabled={generando}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 8,
              fontSize: '0.85rem',
              color: 'var(--texto-secundario)',
            }}
          >
            <span>
              {texto.length} / {MAX_CARACTERES} caracteres
            </span>
            <span>Duración aproximada: {duracionEstimada}</span>
          </div>
          <p className="campo-ayuda">Consejo: pulsa Ctrl + Intro para generar el audio.</p>
          <div className="grupo-botones espaciado">
            <Boton
              variante="primario"
              grande
              onClick={() => void generar()}
              disabled={!textoLimpio || generando}
              aria-label={generando ? 'Generando audio, espera' : 'Generar audio'}
            >
              {generando ? <Cargando texto="Generando audio…" /> : 'Generar audio'}
            </Boton>
            <Boton
              variante="fantasma"
              onClick={() => setTexto('')}
              disabled={!texto || generando}
            >
              Borrar
            </Boton>
          </div>
        </Tarjeta>
      </div>

      {/* ── Errores con opción de reintentar ── */}
      {error && (
        <div className="espaciado">
          <Aviso
            tipo="error"
            accion={
              error.reintentable ? (
                <Boton
                  pequeno
                  onClick={() => {
                    setError(null);
                    error.reintentar();
                  }}
                >
                  Reintentar
                </Boton>
              ) : undefined
            }
          >
            {error.mensaje}
          </Aviso>
        </div>
      )}

      {/* ── 2. Selección de voz ── */}
      <Tarjeta>
        <h2 className="tarjeta-titulo">Elige una voz</h2>
        <div className="rejilla rejilla-4" role="radiogroup" aria-label="Voces disponibles">
          {VOCES.map((voz) => {
            const seleccionada = voz.id === vozId;
            const muestraActiva = muestraVozId === voz.id;
            return (
              <div
                key={voz.id}
                className={`tarjeta tarjeta-voz${seleccionada ? ' seleccionada' : ''}`}
                role="radio"
                aria-checked={seleccionada}
                tabIndex={0}
                aria-label={`${voz.nombre}, voz ${voz.genero.toLowerCase()}. ${voz.descripcion}`}
                onClick={() => seleccionarVoz(voz.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    seleccionarVoz(voz.id);
                  }
                }}
              >
                <span className="tarjeta-voz-marca" aria-hidden="true">
                  {seleccionada && <IconoCheck size={14} />}
                </span>
                <p className="tarjeta-voz-nombre">{voz.nombre}</p>
                <span className="tarjeta-voz-genero">{voz.genero}</span>
                <p className="tarjeta-voz-desc">{voz.descripcion}</p>
                <Boton
                  pequeno
                  onClick={(e) => {
                    e.stopPropagation();
                    void escucharMuestra(voz);
                  }}
                  disabled={generando}
                  aria-label={
                    muestraActiva
                      ? `Detener la muestra de ${voz.nombre}`
                      : `Escuchar una muestra de la voz de ${voz.nombre}`
                  }
                >
                  {muestraActiva ? <IconoPausa size={14} /> : <IconoReproducir size={14} />}
                  {muestraActiva ? 'Detener muestra' : 'Escuchar muestra'}
                </Boton>
                {muestraActiva && muestraCargando && (
                  <div className="espaciado">
                    <Cargando texto="Reproduciendo muestra…" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── 4. Descarga del modelo (primera vez por voz) ── */}
        {descarga && (
          <div className="espaciado">
            <BarraProgreso
              fase={descarga.detalle || 'Preparando la voz por primera vez…'}
              porcentaje={descarga.porcentaje}
            />
            <p className="campo-ayuda">
              {descarga.tamano
                ? `La descarga es de unos ${descarga.tamano}. La próxima vez será mucho más rápido.`
                : 'La próxima vez será mucho más rápido.'}
            </p>
          </div>
        )}
      </Tarjeta>

      {/* ── 3. Ajustes de voz ── */}
      <Tarjeta>
        <h2 className="tarjeta-titulo">Ajustes de voz</h2>
        <Deslizador
          etiqueta="Velocidad"
          valor={velocidad}
          min={0.5}
          max={2}
          paso={0.05}
          alCambiar={setVelocidad}
          formatoValor={(v) => `${v.toFixed(2)}×`}
          ayuda="1 es la velocidad normal."
        />
      </Tarjeta>

      {/* ── 5. Resultado ── */}
      {resultado && (
        <Tarjeta>
          <div className="espaciado">
            <Aviso tipo="exito">Audio generado correctamente</Aviso>
          </div>
          <ReproductorAudio
            blob={resultado.blob}
            picos={resultado.picos}
            titulo="Tu voz generada"
            subtitulo={`${resultado.vozNombre} · ${formatearTiempo(resultado.duracion)}`}
            acciones={
              <>
                <Boton
                  variante="primario"
                  onClick={() => void descargar()}
                  disabled={exportando}
                >
                  <IconoDescargar size={16} />
                  Descargar
                </Boton>
                <Boton onClick={irAMezclador}>
                  <IconoMusica size={16} />
                  Añadir música
                </Boton>
                <Boton onClick={irAMezclador}>
                  <IconoAbrir size={16} />
                  Abrir en mezclador
                </Boton>
                <Boton variante="fantasma" onClick={crearOtraVersion}>
                  Crear otra versión
                </Boton>
              </>
            }
          />
          {exportando && (
            <div className="espaciado">
              <Cargando texto={faseExportacion ?? 'Preparando tu audio…'} />
            </div>
          )}
        </Tarjeta>
      )}

      {/* Reproductor dedicado para las muestras de voz. */}
      <audio
        ref={audioMuestraRef}
        preload="none"
        onEnded={detenerMuestra}
        onError={detenerMuestra}
        aria-hidden="true"
      />
    </>
  );
}
