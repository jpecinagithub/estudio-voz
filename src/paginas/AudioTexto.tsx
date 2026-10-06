/**
 * Página "Audio a texto": subir / arrastrar / elegir un audio,
 * transcribirlo con Groq (vía /api/transcribir) y editar el resultado.
 * Todo el texto visible está en español.
 */
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Aviso,
  BarraProgreso,
  Boton,
  Tarjeta,
} from '../componentes/ui';
import { ReproductorAudio } from '../componentes/ReproductorAudio';
import {
  IconoCopiar,
  IconoDescargar,
  IconoEditar,
  IconoMicrofono,
  IconoOnda,
  IconoReproducir,
  IconoSeleccionarTodo,
  IconoSubir,
  IconoTranscribir,
} from '../componentes/iconos';
import { mejorarPuntuacion, transcribirAudio } from '../stt/cliente';
import {
  EXTENSIONES_ACEPTADAS,
  FORMATOS_ACEPTADOS_DESCRIPCION,
  TAMANO_MAXIMO_SUBIDA_DIRECTA,
  TAMANO_MAXIMO_TRANSCRIPCION,
  esAudioCompatible,
} from '../config';
import {
  crearId,
  guardarTrabajo,
  listarTrabajos,
  obtenerTrabajo,
} from '../storage/db';
import { recogerAudioSesion } from '../audio/sesion';
import { audioBufferAWav, calcularPicos, decodificarAudio } from '../audio/motor';
import { descargarBlob } from '../utils/descarga';
import { formatearBytes, formatearTiempo, formatearTiempoSrt } from '../utils/formato';
import { mensajeAmigable, puedeReintentarse } from '../utils/errores';
import {
  ErrorApp,
  NOMBRES_TIPO_TRABAJO,
  type SegmentoTranscripcion,
  type TrabajoAudio,
} from '../tipos';

interface AudioCargado {
  blob: Blob;
  nombre: string;
  duracionSeg: number | null;
}

type ContextoError = 'archivo' | 'transcripcion' | 'origen' | null;

/** Quita la extensión del nombre para nombrar los archivos descargados. */
function nombreBase(nombre: string): string {
  const sinExtension = nombre.replace(/\.[a-z0-9]+$/i, '').trim();
  return sinExtension || 'audio';
}

/** Comprueba la extensión (o el tipo MIME si no hay extensión) y el tamaño antes de aceptar un archivo. */
function validarArchivo(archivo: File): void {
  if (!esAudioCompatible(archivo)) {
    throw new ErrorApp(
      'archivo-no-compatible',
      'Este archivo no es un audio compatible.',
    );
  }
  if (archivo.size > TAMANO_MAXIMO_TRANSCRIPCION) {
    throw new ErrorApp(
      'archivo-supera-limite',
      'El archivo supera el tamaño máximo de transcripción.',
    );
  }
  if (archivo.size === 0) {
    throw new ErrorApp('archivo-no-compatible', 'El archivo está vacío.');
  }
}

export function PaginaAudioTexto() {
  const [params] = useSearchParams();

  const [audio, setAudio] = useState<AudioCargado | null>(null);
  const [picos, setPicos] = useState<Float32Array | null>(null);
  const [urlAudio, setUrlAudio] = useState<string | null>(null);

  const [trabajos, setTrabajos] = useState<TrabajoAudio[] | null>(null);

  const [transcribiendo, setTranscribiendo] = useState(false);
  const [fase, setFase] = useState('Preparando…');
  const [porcentaje, setPorcentaje] = useState<number | null>(null);

  const [texto, setTexto] = useState('');
  const [segmentos, setSegmentos] = useState<SegmentoTranscripcion[]>([]);
  const [resultadoListo, setResultadoListo] = useState(false);

  const [error, setError] = useState<unknown>(null);
  const [contextoError, setContextoError] = useState<ContextoError>(null);
  const [notaInfo, setNotaInfo] = useState<string | null>(null);
  const [avisoCopiado, setAvisoCopiado] = useState<string | null>(null);
  const [avisoMejora, setAvisoMejora] = useState<string | null>(null);
  const [mejorando, setMejorando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);

  const refEntradaArchivo = useRef<HTMLInputElement>(null);
  const refAreaTexto = useRef<HTMLTextAreaElement>(null);
  const refAudioSegmento = useRef<HTMLAudioElement>(null);
  const refCancelador = useRef<AbortController | null>(null);
  const refParamsProcesados = useRef(false);

  /* ── Orígenes por parámetros de la URL: ?sesion=<clave> o ?transcripcion=<id> ── */
  useEffect(() => {
    if (refParamsProcesados.current) return;
    refParamsProcesados.current = true;

    const claveSesion = params.get('sesion');
    const idTranscripcion = params.get('transcripcion');

    if (claveSesion) {
      const buffer = recogerAudioSesion(claveSesion);
      if (buffer) {
        const blob = audioBufferAWav(buffer);
        setAudio({ blob, nombre: 'Grabación de la grabadora', duracionSeg: buffer.duration });
      } else {
        setError(
          new ErrorApp(
            'origen-no-encontrado',
            'No se ha encontrado el audio de la sesión. Graba de nuevo o elige un archivo.',
          ),
        );
        setContextoError('origen');
      }
      return;
    }

    if (idTranscripcion) {
      void (async () => {
        try {
          const trabajo = await obtenerTrabajo(idTranscripcion);
          if (trabajo?.texto) {
            setTexto(trabajo.texto);
            setSegmentos([]);
            setResultadoListo(true);
            if (trabajo.audio) {
              setAudio({
                blob: trabajo.audio,
                nombre: trabajo.nombre,
                duracionSeg: trabajo.duracionSeg,
              });
            }
          } else {
            setError(
              new ErrorApp(
                'origen-no-encontrado',
                'No se ha encontrado esa transcripción en «Mis audios».',
              ),
            );
            setContextoError('origen');
          }
        } catch (e) {
          setError(e);
          setContextoError('origen');
        }
      })();
    }
    // Solo al montar: la Grabadora enlaza aquí con ?sesion= o ?transcripcion=.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Historial para "Usar una grabación" (solo cuando no hay audio cargado) ── */
  useEffect(() => {
    if (audio) return;
    let activo = true;
    void listarTrabajos()
      .then((todos) => {
        if (!activo) return;
        setTrabajos(
          todos.filter(
            (t) =>
              (t.tipo === 'grabacion' || t.tipo === 'voz' || t.tipo === 'mezcla') &&
              t.audio !== null,
          ),
        );
      })
      .catch(() => {
        if (activo) setTrabajos([]);
      });
    return () => {
      activo = false;
    };
  }, [audio === null]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Onda del reproductor (calculada bajo demanda) ── */
  useEffect(() => {
    if (!audio) {
      setPicos(null);
      setUrlAudio(null);
      return;
    }
    const url = URL.createObjectURL(audio.blob);
    setUrlAudio(url);
    let activo = true;
    void decodificarAudio(audio.blob)
      .then((buffer) => {
        if (!activo) return;
        setPicos(calcularPicos(buffer, 160));
        setAudio((anterior) =>
          anterior && anterior.duracionSeg == null
            ? { ...anterior, duracionSeg: buffer.duration }
            : anterior,
        );
      })
      .catch(() => {
        if (activo) setPicos(null);
      });
    return () => {
      activo = false;
      URL.revokeObjectURL(url);
    };
  }, [audio]);

  function mostrarError(e: unknown, contexto: ContextoError): void {
    setError(e);
    setContextoError(contexto);
  }

  function recibirArchivo(archivo: File): void {
    try {
      validarArchivo(archivo);
    } catch (e) {
      mostrarError(e, 'archivo');
      return;
    }
    setError(null);
    setContextoError(null);
    setNotaInfo(null);
    setTexto('');
    setSegmentos([]);
    setResultadoListo(false);
    setAudio({ blob: archivo, nombre: archivo.name, duracionSeg: null });
  }

  function usarGrabacion(trabajo: TrabajoAudio): void {
    if (!trabajo.audio) return;
    setError(null);
    setContextoError(null);
    setTexto('');
    setSegmentos([]);
    setResultadoListo(false);
    setAudio({ blob: trabajo.audio, nombre: trabajo.nombre, duracionSeg: trabajo.duracionSeg });
  }

  function reiniciar(): void {
    refCancelador.current?.abort();
    refCancelador.current = null;
    setAudio(null);
    setTexto('');
    setSegmentos([]);
    setResultadoListo(false);
    setTranscribiendo(false);
    setError(null);
    setContextoError(null);
    setNotaInfo(null);
    setAvisoCopiado(null);
    setAvisoMejora(null);
  }

  async function transcribir(): Promise<void> {
    if (!audio || transcribiendo) return;
    const controlador = new AbortController();
    refCancelador.current = controlador;
    setTranscribiendo(true);
    setError(null);
    setContextoError(null);
    setNotaInfo(null);
    setFase('Preparando…');
    setPorcentaje(null);
    try {
      const resultado = await transcribirAudio(audio.blob, audio.nombre, {
        alProgresar: (faseRecibida, porcentajeRecibido) => {
          setFase(faseRecibida);
          setPorcentaje(porcentajeRecibido);
        },
        senal: controlador.signal,
      });
      setTexto(resultado.texto);
      setSegmentos(resultado.segmentos);
      setResultadoListo(true);
      await guardarTrabajo({
        id: crearId(),
        nombre: `Transcripción de ${nombreBase(audio.nombre)}`,
        tipo: 'transcripcion',
        fecha: Date.now(),
        duracionSeg: resultado.duracionSeg,
        audio: audio.blob,
        texto: resultado.texto,
      });
    } catch (e) {
      if (controlador.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) {
        setNotaInfo('Transcripción cancelada.');
      } else {
        mostrarError(e, 'transcripcion');
      }
    } finally {
      refCancelador.current = null;
      setTranscribiendo(false);
    }
  }

  function cancelarTranscripcion(): void {
    refCancelador.current?.abort();
  }

  function escucharSegmento(segmento: SegmentoTranscripcion): void {
    const elemento = refAudioSegmento.current;
    if (!elemento) return;
    try {
      elemento.currentTime = segmento.inicio;
    } catch {
      // Si el audio aún no está listo, se ignora el salto.
    }
    void elemento.play().catch(() => undefined);
  }

  async function copiarTexto(): Promise<void> {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      setAvisoCopiado('Texto copiado');
      window.setTimeout(() => setAvisoCopiado(null), 3000);
    } catch {
      refAreaTexto.current?.select();
      refAreaTexto.current?.focus();
      setNotaInfo('El portapapeles no está disponible. El texto está seleccionado: cópialo con Ctrl+C.');
    }
  }

  function seleccionarTodo(): void {
    refAreaTexto.current?.select();
    refAreaTexto.current?.focus();
  }

  function descargarTxt(): void {
    descargarBlob(
      new Blob([texto], { type: 'text/plain;charset=utf-8' }),
      `transcripcion-${nombreBase(audio?.nombre ?? 'texto')}.txt`,
    );
  }

  function descargarSrt(): void {
    const lineas: string[] = [];
    segmentos.forEach((s, i) => {
      lineas.push(
        String(i + 1),
        `${formatearTiempoSrt(s.inicio)} --> ${formatearTiempoSrt(s.fin)}`,
        s.texto,
        '',
      );
    });
    descargarBlob(
      new Blob([lineas.join('\n')], { type: 'text/plain;charset=utf-8' }),
      `transcripcion-${nombreBase(audio?.nombre ?? 'texto')}.srt`,
    );
  }

  async function mejorarTexto(): Promise<void> {
    if (mejorando || !texto.trim()) return;
    setMejorando(true);
    setAvisoMejora(null);
    try {
      const mejorado = await mejorarPuntuacion(texto);
      setTexto(mejorado);
    } catch {
      setAvisoMejora('No se ha podido mejorar el texto, pero puedes seguir editándolo.');
    } finally {
      setMejorando(false);
    }
  }

  function reintentarError(): void {
    if (contextoError === 'transcripcion') {
      void transcribir();
    } else if (contextoError === 'archivo' || contextoError === 'origen') {
      setError(null);
      setContextoError(null);
      refEntradaArchivo.current?.click();
    }
  }

  const audioEsGrande = audio !== null && audio.blob.size > TAMANO_MAXIMO_SUBIDA_DIRECTA;

  return (
    <div className="pagina">
      <h1 className="titulo-pagina">Audio a texto</h1>
      <p className="subtitulo-pagina">
        Obtén una transcripción editable de tus archivos de audio, en español.
      </p>

      {/* Elemento oculto para preescuchar segmentos con marcas de tiempo */}
      <audio
        ref={refAudioSegmento}
        src={urlAudio ?? undefined}
        preload="metadata"
        aria-hidden
        className="sr-solo"
        tabIndex={-1}
      />

      {error !== null && (
        <div className="espaciado">
          <Aviso
            tipo="error"
            accion={
              puedeReintentarse(error) ? (
                <Boton pequeno onClick={reintentarError}>
                  Reintentar
                </Boton>
              ) : undefined
            }
          >
            {mensajeAmigable(error)}
          </Aviso>
        </div>
      )}

      {notaInfo && (
        <div className="espaciado">
          <Aviso tipo="info">{notaInfo}</Aviso>
        </div>
      )}

      {/* ── 1. Orígenes de audio ── */}
      {!audio && (
        <>
          <div className="rejilla rejilla-2">
            <Tarjeta elevada>
              <h2 className="titulo-seccion">Subir un archivo</h2>
              <div
                className={`zona-arrastre${arrastrando ? ' arrastrando' : ''}`}
                role="button"
                tabIndex={0}
                aria-label="Subir archivo de audio. Pulsa para elegir un archivo o arrastra y suelta aquí."
                onClick={() => refEntradaArchivo.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    refEntradaArchivo.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setArrastrando(true);
                }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setArrastrando(false);
                  const archivo = e.dataTransfer.files?.[0];
                  if (archivo) recibirArchivo(archivo);
                }}
              >
                <IconoSubir size={34} />
                <p style={{ margin: '12px 0 4px', fontWeight: 650, color: 'var(--texto)' }}>
                  Arrastra un archivo de audio aquí
                </p>
                <p style={{ margin: 0 }}>o pulsa para elegirlo de tu dispositivo</p>
                <p className="campo-ayuda" style={{ marginTop: 12 }}>
                  {FORMATOS_ACEPTADOS_DESCRIPCION}. Tamaño máximo:{' '}
                  {formatearBytes(TAMANO_MAXIMO_TRANSCRIPCION)}.
                </p>
              </div>
              <input
                ref={refEntradaArchivo}
                type="file"
                className="sr-solo"
                accept={EXTENSIONES_ACEPTADAS.join(',')}
                aria-label="Elegir archivo de audio"
                onChange={(e) => {
                  const archivo = e.target.files?.[0];
                  e.target.value = '';
                  if (archivo) recibirArchivo(archivo);
                }}
              />
            </Tarjeta>

            <Tarjeta elevada>
              <h2 className="titulo-seccion">Usar una grabación</h2>
              <p className="tarjeta-descripcion">
                Elige un audio de «Mis audios» para transcribirlo.
              </p>
              {trabajos === null ? (
                <p className="campo-ayuda">Cargando tus audios…</p>
              ) : trabajos.length === 0 ? (
                <p className="campo-ayuda">
                  Todavía no tienes grabaciones guardadas. Graba algo en la Grabadora o genera
                  una voz y aparecerá aquí.
                </p>
              ) : (
                <div className="lista-trabajos">
                  {trabajos.map((t) => (
                    <div key={t.id} className="item-trabajo">
                      <span className="item-trabajo-icono" aria-hidden>
                        <IconoOnda />
                      </span>
                      <div className="item-trabajo-info">
                        <p className="item-trabajo-nombre">{t.nombre}</p>
                        <p className="item-trabajo-meta">
                          {NOMBRES_TIPO_TRABAJO[t.tipo]} · {formatearTiempo(t.duracionSeg)}
                        </p>
                      </div>
                      <div className="item-trabajo-acciones">
                        <Boton pequeno onClick={() => usarGrabacion(t)}>
                          Usar
                        </Boton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Tarjeta>
          </div>

          <div className="espaciado">
            <Aviso tipo="info">
              La transcripción necesita conexión a internet. El audio se procesa de forma segura
              y no se conserva.
            </Aviso>
          </div>
        </>
      )}

      {/* ── 2. Audio cargado ── */}
      {audio && (
        <Tarjeta elevada>
          <h2 className="titulo-seccion">Tu audio</h2>
          <ReproductorAudio
            blob={audio.blob}
            picos={picos}
            titulo={audio.nombre}
            subtitulo={`${formatearBytes(audio.blob.size)}${
              audio.duracionSeg != null ? ` · ${formatearTiempo(audio.duracionSeg)}` : ''
            }`}
          />

          {audioEsGrande && (
            <div className="espaciado">
              <Aviso tipo="info">
                El archivo es grande. Usaremos la carga optimizada: se subirá temporalmente de
                forma segura y se eliminará después de la transcripción.
              </Aviso>
            </div>
          )}

          {!transcribiendo && !resultadoListo && (
            <>
              <div className="grupo-botones espaciado">
                <Boton variante="primario" grande onClick={() => void transcribir()}>
                  <IconoTranscribir size={20} />
                  Transcribir audio
                </Boton>
                <Boton variante="fantasma" onClick={reiniciar}>
                  Cambiar audio
                </Boton>
              </div>
              <p className="campo-ayuda">
                La transcripción necesita conexión a internet. El audio se procesa de forma
                segura y no se conserva.
              </p>
            </>
          )}

          {transcribiendo && (
            <div className="espaciado">
              <BarraProgreso fase={fase} porcentaje={porcentaje} />
              <div className="grupo-botones espaciado">
                <Boton variante="peligro" onClick={cancelarTranscripcion}>
                  Cancelar
                </Boton>
              </div>
            </div>
          )}
        </Tarjeta>
      )}

      {/* ── 3. Resultado ── */}
      {audio && resultadoListo && (
        <>
          <div className="espaciado">
            <Aviso tipo="exito">Transcripción lista</Aviso>
          </div>

          {avisoCopiado && (
            <div className="espaciado">
              <Aviso tipo="exito">{avisoCopiado}</Aviso>
            </div>
          )}
          {avisoMejora && (
            <div className="espaciado">
              <Aviso tipo="aviso">{avisoMejora}</Aviso>
            </div>
          )}

          <Tarjeta>
            <h2 className="titulo-seccion">Texto transcrito</h2>
            <label className="campo-etiqueta sr-solo" htmlFor="texto-transcrito">
              Texto transcrito
            </label>
            <textarea
              id="texto-transcrito"
              ref={refAreaTexto}
              className="area-texto"
              rows={10}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              aria-label="Texto transcrito. Puedes editarlo."
            />
            <div className="grupo-botones espaciado">
              <Boton onClick={() => void copiarTexto()}>
                <IconoCopiar size={18} />
                Copiar
              </Boton>
              <Boton onClick={seleccionarTodo}>
                <IconoSeleccionarTodo size={18} />
                Seleccionar todo
              </Boton>
              <Boton onClick={descargarTxt}>
                <IconoDescargar size={18} />
                Descargar TXT
              </Boton>
              {segmentos.length > 0 && (
                <Boton onClick={descargarSrt}>
                  <IconoDescargar size={18} />
                  Descargar SRT
                </Boton>
              )}
              <Boton onClick={() => void mejorarTexto()} disabled={mejorando || !texto.trim()}>
                <IconoEditar size={18} />
                {mejorando ? 'Mejorando texto…' : 'Mejorar puntuación'}
              </Boton>
              <Boton
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                variante="fantasma"
              >
                <IconoReproducir size={18} />
                Volver a escuchar el audio
              </Boton>
              <Boton variante="fantasma" onClick={reiniciar}>
                Nueva transcripción
              </Boton>
            </div>
          </Tarjeta>

          {segmentos.length > 0 && (
            <div className="espaciado">
              <Tarjeta>
                <h2 className="titulo-seccion">Segmentos con marcas de tiempo</h2>
                <p className="tarjeta-descripcion">
                  Pulsa «Escuchar» para oír el fragmento correspondiente a cada segmento.
                </p>
                <ul className="lista-trabajos" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {segmentos.map((s, i) => (
                    <li key={`${s.inicio}-${i}`} className="item-trabajo">
                      <span className="etiqueta">{formatearTiempo(s.inicio)}</span>
                      <p className="item-trabajo-info" style={{ margin: 0 }}>
                        {s.texto}
                      </p>
                      <div className="item-trabajo-acciones">
                        <Boton
                          pequeno
                          onClick={() => escucharSegmento(s)}
                          aria-label={`Escuchar segmento desde ${formatearTiempo(s.inicio)}`}
                        >
                          <IconoMicrofono size={16} />
                          Escuchar
                        </Boton>
                      </div>
                    </li>
                  ))}
                </ul>
              </Tarjeta>
            </div>
          )}
        </>
      )}
    </div>
  );
}
