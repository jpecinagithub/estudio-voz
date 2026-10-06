/**
 * Página Mezclador: combina una pista de voz con música de fondo.
 * La voz puede llegar desde ?voz= (sesion:<clave> o historial:<id>),
 * del historial local o de un archivo subido. La mezcla se hace
 * localmente con Web Audio API y se puede previsualizar y exportar.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  audioBufferAWav,
  calcularPicos,
  decodificarAudio,
  mezclarPistas,
  type OpcionesMezcla,
} from '../audio/motor';
import { recogerAudioSesion } from '../audio/sesion';
import {
  CALIDADES_EXPORTACION,
  EXTENSIONES_ACEPTADAS,
  FORMATOS_ACEPTADOS_DESCRIPCION,
  PISTAS_MUSICA,
  type CalidadExportacion,
} from '../config';
import {
  exportarAudio,
  nombreArchivoExportacion,
  obtenerFormatosDisponibles,
} from '../exportar/codificadores';
import { crearId, guardarTrabajo, listarTrabajos, obtenerTrabajo } from '../storage/db';
import {
  ErrorApp,
  NOMBRES_FORMATO,
  NOMBRES_TIPO_TRABAJO,
  type FormatoExportacion,
  type TrabajoAudio,
} from '../tipos';
import { leerAjustes } from '../utils/ajustes';
import { descargarBlob } from '../utils/descarga';
import { mensajeAmigable, puedeReintentarse } from '../utils/errores';
import { formatearBytes, formatearFecha, formatearTiempo } from '../utils/formato';
import { Waveform } from '../componentes/Waveform';
import { ReproductorAudio } from '../componentes/ReproductorAudio';
import {
  Aviso,
  BarraProgreso,
  Boton,
  Cargando,
  Deslizador,
  Interruptor,
  Modal,
  Tarjeta,
} from '../componentes/ui';
import {
  IconoDescargar,
  IconoMezcla,
  IconoMicrofono,
  IconoMusica,
  IconoPausa,
  IconoReproducir,
  IconoSubir,
  IconoTextoVoz,
} from '../componentes/iconos';

interface VozElegida {
  nombre: string;
  buffer: AudioBuffer;
  picos: Float32Array;
}

interface MusicaElegida {
  id: string;
  nombre: string;
  buffer: AudioBuffer;
  picos: Float32Array;
  urlVistaPrevia: string;
}

interface MezclaLista {
  buffer: AudioBuffer;
  blob: Blob;
  picos: Float32Array;
  /** Firma de los parámetros usados; sirve para saber si la vista previa está al día. */
  firma: string;
}

const ID_MUSICA_PROPIA = 'propia';
const NUM_PICOS = 120;

function nombreBaseArchivo(nombre: string): string {
  const sinExtension = nombre.replace(/\.[a-z0-9]+$/i, '');
  const limpio = sinExtension.trim();
  return limpio === '' ? 'mi-mezcla' : limpio;
}

function nombreVozSesion(clave: string): string {
  const minusculas = clave.toLowerCase();
  if (minusculas.includes('grabadora')) return 'Grabación';
  if (minusculas.includes('texto')) return 'Voz generada';
  return 'Voz';
}

function validarArchivoAudio(archivo: File): void {
  const nombre = archivo.name.toLowerCase();
  const extensionValida = EXTENSIONES_ACEPTADAS.some((ext) => nombre.endsWith(ext));
  if (!extensionValida) {
    throw new ErrorApp(
      'archivo-no-compatible',
      `«${archivo.name}» no es un audio compatible. Prueba con ${FORMATOS_ACEPTADOS_DESCRIPCION}.`,
    );
  }
  if (archivo.size === 0) {
    throw new ErrorApp('archivo-no-compatible', 'El archivo está vacío.');
  }
}

/** Lee los ajustes sin romper la página si algo falla. */
function leerAjustesSeguro() {
  try {
    return leerAjustes();
  } catch {
    return undefined;
  }
}

export function PaginaMezclador() {
  const [params] = useSearchParams();

  const ajustes = useMemo(leerAjustesSeguro, []);

  /* ── Voz ── */
  const [voz, setVoz] = useState<VozElegida | null>(null);
  const [cargandoVoz, setCargandoVoz] = useState(false);
  const [errorVoz, setErrorVoz] = useState<unknown>(null);
  const [historialVoz, setHistorialVoz] = useState<TrabajoAudio[] | null>(null);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const refArchivoVoz = useRef<HTMLInputElement>(null);

  /* ── Música ── */
  const [musica, setMusica] = useState<MusicaElegida | null>(null);
  const [idMusicaCargando, setIdMusicaCargando] = useState<string | null>(null);
  const [errorMusica, setErrorMusica] = useState<unknown>(null);
  const ultimoIntentoMusica = useRef<{ id: string; nombre: string; fuente: string | File } | null>(
    null,
  );
  const cacheMusica = useRef(new Map<string, AudioBuffer>());
  const urlsCreadas = useRef(new Set<string>());
  const refArchivoMusica = useRef<HTMLInputElement>(null);

  /* ── Vista previa de pistas musicales ── */
  const refVistaPrevia = useRef<HTMLAudioElement>(null);
  const [idVistaPrevia, setIdVistaPrevia] = useState<string | null>(null);

  /* ── Ajustes de mezcla (iniciales desde Ajustes) ── */
  const [volumenVoz, setVolumenVoz] = useState(100);
  const [volumenMusica, setVolumenMusica] = useState(() => {
    const v = ajustes?.volumenMusica;
    return typeof v === 'number' ? Math.min(100, Math.max(0, Math.round(v))) : 18;
  });
  const [silenciarVoz, setSilenciarVoz] = useState(false);
  const [silenciarMusica, setSilenciarMusica] = useState(false);
  const [inicioMusicaSeg, setInicioMusicaSeg] = useState(0);
  const [fundidoEntradaSeg, setFundidoEntradaSeg] = useState(2);
  const [fundidoSalidaSeg, setFundidoSalidaSeg] = useState(3);
  const [cortarAlFinalizar, setCortarAlFinalizar] = useState(true);
  const [repetir, setRepetir] = useState(false);
  const [ducking, setDucking] = useState(() => ajustes?.ducking ?? true);
  const [intensidadDucking, setIntensidadDucking] = useState(60);

  /* ── Vista previa de la mezcla ── */
  const [mezclando, setMezclando] = useState(false);
  const [mezcla, setMezcla] = useState<MezclaLista | null>(null);
  const [errorMezcla, setErrorMezcla] = useState<unknown>(null);

  /* ── Exportación ── */
  const [modalExportar, setModalExportar] = useState(false);
  const [formatoExp, setFormatoExp] = useState<FormatoExportacion>(() => {
    const f = ajustes?.formatoExportacion;
    return f === 'mp3' || f === 'wav' || f === 'ogg' || f === 'm4a' ? f : 'mp3';
  });
  const [calidadExp, setCalidadExp] = useState<CalidadExportacion>(() => {
    const c = ajustes?.calidadExportacion;
    return c === 'ligera' || c === 'estandar' || c === 'alta' ? c : 'estandar';
  });
  const [nombreExp, setNombreExp] = useState('mi-mezcla');
  const nombreTocado = useRef(false);
  const [exportando, setExportando] = useState(false);
  const [faseExportacion, setFaseExportacion] = useState('Preparando tu audio…');
  const [errorExportacion, setErrorExportacion] = useState<unknown>(null);
  const [descargaLista, setDescargaLista] = useState<{ blob: Blob; nombreArchivo: string } | null>(
    null,
  );

  const duracionVoz = voz?.buffer.duration ?? 0;

  /* ── Firma de los parámetros actuales ── */
  const firma = useMemo(
    () =>
      JSON.stringify({
        v: voz?.nombre ?? '',
        d: voz ? Math.round(voz.buffer.duration * 10) : 0,
        m: musica?.id ?? '',
        vv: volumenVoz,
        vm: volumenMusica,
        sv: silenciarVoz,
        sm: silenciarMusica,
        ini: inicioMusicaSeg,
        fe: fundidoEntradaSeg,
        fs: fundidoSalidaSeg,
        cortar: cortarAlFinalizar,
        rep: repetir,
        duck: ducking ? intensidadDucking : 0,
      }),
    [
      voz,
      musica,
      volumenVoz,
      volumenMusica,
      silenciarVoz,
      silenciarMusica,
      inicioMusicaSeg,
      fundidoEntradaSeg,
      fundidoSalidaSeg,
      cortarAlFinalizar,
      repetir,
      ducking,
      intensidadDucking,
    ],
  );

  /* ── Carga inicial de la voz desde ?voz= ── */
  const cargarVozDesdeParametro = useCallback(async () => {
    const vozParam = params.get('voz');
    if (!vozParam) return;
    setCargandoVoz(true);
    setErrorVoz(null);
    try {
      let buffer: AudioBuffer | undefined;
      let nombre = 'Voz';
      if (vozParam.startsWith('sesion:')) {
        const clave = vozParam.slice('sesion:'.length);
        buffer = recogerAudioSesion(clave);
        nombre = nombreVozSesion(clave);
      } else if (vozParam.startsWith('historial:')) {
        const trabajo = await obtenerTrabajo(vozParam.slice('historial:'.length));
        if (trabajo?.audio) {
          buffer = await decodificarAudio(trabajo.audio);
          nombre = trabajo.nombre;
        }
      }
      if (!buffer) {
        throw new ErrorApp(
          'voz-no-disponible',
          'La voz indicada ya no está disponible. Elígela de nuevo en esta página.',
        );
      }
      setVoz({ nombre, buffer, picos: calcularPicos(buffer, NUM_PICOS) });
      setMezcla(null);
    } catch (err) {
      setErrorVoz(err);
    } finally {
      setCargandoVoz(false);
    }
  }, [params]);

  useEffect(() => {
    void cargarVozDesdeParametro();
  }, [cargarVozDesdeParametro]);

  /* ── Historial para elegir voz (solo cuando hace falta) ── */
  useEffect(() => {
    if (voz || cargandoVoz || historialVoz !== null || cargandoHistorial) return;
    let cancelado = false;
    setCargandoHistorial(true);
    listarTrabajos()
      .then((todos) => {
        if (!cancelado) setHistorialVoz(todos.filter((t) => t.audio));
      })
      .catch(() => {
        if (!cancelado) setHistorialVoz([]);
      })
      .finally(() => {
        if (!cancelado) setCargandoHistorial(false);
      });
    return () => {
      cancelado = true;
    };
  }, [voz, cargandoVoz, historialVoz, cargandoHistorial]);

  /* ── Limita el inicio de la música a la duración de la voz ── */
  useEffect(() => {
    if (voz && inicioMusicaSeg > voz.buffer.duration) {
      setInicioMusicaSeg(Math.floor(voz.buffer.duration * 2) / 2);
    }
  }, [voz, inicioMusicaSeg]);

  /* ── Limpieza de URLs de objeto al desmontar ── */
  useEffect(
    () => () => {
      urlsCreadas.current.forEach((url) => URL.revokeObjectURL(url));
      urlsCreadas.current.clear();
    },
    [],
  );

  /* ── Elegir voz ── */

  const usarDelHistorial = async (trabajo: TrabajoAudio) => {
    if (!trabajo.audio) return;
    setCargandoVoz(true);
    setErrorVoz(null);
    try {
      const buffer = await decodificarAudio(trabajo.audio);
      setVoz({ nombre: trabajo.nombre, buffer, picos: calcularPicos(buffer, NUM_PICOS) });
      setMezcla(null);
    } catch (err) {
      setErrorVoz(err);
    } finally {
      setCargandoVoz(false);
    }
  };

  const alSubirVoz = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setCargandoVoz(true);
    setErrorVoz(null);
    try {
      validarArchivoAudio(archivo);
      const buffer = await decodificarAudio(archivo);
      setVoz({
        nombre: nombreBaseArchivo(archivo.name),
        buffer,
        picos: calcularPicos(buffer, NUM_PICOS),
      });
      setMezcla(null);
    } catch (err) {
      setErrorVoz(err);
    } finally {
      setCargandoVoz(false);
    }
  };

  const cambiarVoz = () => {
    detenerVistaPrevia();
    setVoz(null);
    setMezcla(null);
    setErrorVoz(null);
    setErrorMezcla(null);
  };

  /* ── Vista previa de pistas musicales ── */

  const detenerVistaPrevia = () => {
    refVistaPrevia.current?.pause();
    setIdVistaPrevia(null);
  };

  const alternarVistaPrevia = (id: string, url: string) => {
    const audio = refVistaPrevia.current;
    if (!audio) return;
    if (idVistaPrevia === id) {
      audio.pause();
      setIdVistaPrevia(null);
      return;
    }
    if (audio.getAttribute('src') !== url) audio.src = url;
    void audio
      .play()
      .then(() => setIdVistaPrevia(id))
      .catch(() => setIdVistaPrevia(null));
  };

  /* ── Elegir música ── */

  const elegirMusica = async (id: string, nombre: string, fuente: string | File) => {
    detenerVistaPrevia();
    ultimoIntentoMusica.current = { id, nombre, fuente };
    setIdMusicaCargando(id);
    setErrorMusica(null);
    try {
      let buffer = cacheMusica.current.get(id);
      if (!buffer) {
        if (typeof fuente === 'string') {
          const respuesta = await fetch(fuente);
          if (!respuesta.ok) {
            throw new ErrorApp(
              'musica-carga-fallo',
              'No se ha podido cargar la música. Comprueba tu conexión e inténtalo de nuevo.',
            );
          }
          buffer = await decodificarAudio(await respuesta.arrayBuffer());
        } else {
          validarArchivoAudio(fuente);
          buffer = await decodificarAudio(fuente);
        }
        cacheMusica.current.set(id, buffer);
      }
      let urlVistaPrevia: string;
      if (typeof fuente === 'string') {
        urlVistaPrevia = fuente;
      } else {
        urlVistaPrevia = URL.createObjectURL(fuente);
        urlsCreadas.current.add(urlVistaPrevia);
      }
      setMusica({ id, nombre, buffer, picos: calcularPicos(buffer, NUM_PICOS), urlVistaPrevia });
      setMezcla(null);
    } catch (err) {
      setErrorMusica(err);
    } finally {
      setIdMusicaCargando(null);
    }
  };

  const reintentarMusica = () => {
    const intento = ultimoIntentoMusica.current;
    if (intento) void elegirMusica(intento.id, intento.nombre, intento.fuente);
  };

  const alSubirMusicaPropia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    void elegirMusica(ID_MUSICA_PROPIA, nombreBaseArchivo(archivo.name), archivo);
  };

  const quitarMusica = () => {
    detenerVistaPrevia();
    setMusica(null);
    setMezcla(null);
  };

  /* ── Mezcla ── */

  const construirOpciones = (): OpcionesMezcla => {
    if (!voz) throw new Error('Sin voz');
    return {
      voz: voz.buffer,
      musica: musica?.buffer ?? null,
      volumenVoz: volumenVoz / 100,
      volumenMusica: volumenMusica / 100,
      silenciarVoz,
      silenciarMusica,
      desplazamientoMusicaSeg: inicioMusicaSeg,
      fundidoEntradaMusicaSeg: fundidoEntradaSeg,
      fundidoSalidaMusicaSeg: fundidoSalidaSeg,
      cortarMusicaAlFinalizarVoz: cortarAlFinalizar,
      repetirMusica: repetir,
      reduccionMusicaConVoz: ducking ? intensidadDucking / 100 : 0,
    };
  };

  const previsualizar = async () => {
    if (mezclando) return;
    if (!voz) {
      setErrorMezcla(
        new ErrorApp('mezcla-fallo', 'Elige primero una voz para poder crear la vista previa.'),
      );
      return;
    }
    detenerVistaPrevia();
    setMezclando(true);
    setErrorMezcla(null);
    try {
      const buffer = await mezclarPistas(construirOpciones());
      const blob = audioBufferAWav(buffer);
      setMezcla({ buffer, blob, picos: calcularPicos(buffer, 160), firma });
    } catch (err) {
      setErrorMezcla(err);
    } finally {
      setMezclando(false);
    }
  };

  /* ── Exportación ── */

  const abrirModalExportar = () => {
    if (!nombreTocado.current && voz) {
      setNombreExp(nombreBaseArchivo(voz.nombre));
    }
    setDescargaLista(null);
    setErrorExportacion(null);
    setFaseExportacion('Preparando tu audio…');
    setModalExportar(true);
  };

  const cerrarModal = () => {
    setModalExportar(false);
    setDescargaLista(null);
    setErrorExportacion(null);
  };

  const exportar = async () => {
    if (!voz || exportando) return;
    setExportando(true);
    setErrorExportacion(null);
    setFaseExportacion('Preparando tu audio…');
    try {
      let buffer = mezcla && mezcla.firma === firma ? mezcla.buffer : null;
      if (!buffer) {
        setFaseExportacion('Mezclando…');
        buffer = await mezclarPistas(construirOpciones());
        const blobWav = audioBufferAWav(buffer);
        setMezcla({ buffer, blob: blobWav, picos: calcularPicos(buffer, 160), firma });
      }
      setFaseExportacion('Preparando tu audio…');
      const blob = await exportarAudio(buffer, formatoExp, calidadExp, (fase) =>
        setFaseExportacion(fase),
      );
      const nombreArchivo = nombreArchivoExportacion(nombreExp.trim() || 'mi-mezcla', formatoExp);
      await guardarTrabajo({
        id: crearId(),
        nombre: nombreExp.trim() || 'Mi mezcla',
        tipo: 'mezcla',
        fecha: Date.now(),
        duracionSeg: buffer.duration,
        audio: blob,
        texto: null,
        formatoOrigen: formatoExp,
      });
      setDescargaLista({ blob, nombreArchivo });
    } catch (err) {
      setErrorExportacion(err);
    } finally {
      setExportando(false);
    }
  };

  const descargarResultado = () => {
    if (!descargaLista) return;
    descargarBlob(descargaLista.blob, descargaLista.nombreArchivo);
    cerrarModal();
  };

  const mostrarEleccionVoz = !voz && !cargandoVoz;
  const calidadElegida = CALIDADES_EXPORTACION.find((c) => c.id === calidadExp);

  return (
    <>
      <h1 className="titulo-pagina">Mezclador</h1>
      <p className="subtitulo-pagina">
        Combina tu voz con música de fondo, ajusta los niveles y exporta el resultado.
      </p>

      {/* ── Pista de voz ── */}
      <section aria-labelledby="titulo-voz">
        <h2 id="titulo-voz" className="titulo-seccion">
          Voz
        </h2>

        {cargandoVoz && (
          <Tarjeta>
            <Cargando texto="Cargando la voz…" />
          </Tarjeta>
        )}

        {!cargandoVoz && voz && (
          <Tarjeta>
            <p className="tarjeta-titulo">VOZ</p>
            <p className="tarjeta-descripcion">
              {voz.nombre} · {formatearTiempo(voz.buffer.duration)}
            </p>
            <Waveform
              picos={voz.picos}
              progreso={0}
              etiquetaAccesible={`Forma de onda de ${voz.nombre}`}
            />
            <div className="grupo-botones espaciado">
              <Boton onClick={cambiarVoz}>Cambiar voz</Boton>
            </div>
          </Tarjeta>
        )}

        {mostrarEleccionVoz && (
          <Tarjeta>
            <p className="tarjeta-titulo">Elige tu voz</p>
            <p className="tarjeta-descripcion">
              Usa un audio de tu historial, sube un archivo o crea una voz nueva.
            </p>

            {cargandoHistorial && <Cargando texto="Cargando tu historial…" />}

            {historialVoz && historialVoz.length > 0 && (
              <div className="campo">
                <p className="campo-etiqueta">De tu historial</p>
                {historialVoz.map((trabajo) => (
                  <div
                    key={trabajo.id}
                    className="fila"
                    style={{
                      justifyContent: 'space-between',
                      padding: '8px 0',
                      borderBottom: '1px solid var(--borde-suave)',
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, fontWeight: 600 }}>{trabajo.nombre}</p>
                      <p className="texto-secundario texto-pequeno" style={{ margin: 0 }}>
                        {NOMBRES_TIPO_TRABAJO[trabajo.tipo]} ·{' '}
                        {formatearTiempo(trabajo.duracionSeg)} · {formatearFecha(trabajo.fecha)}
                      </p>
                    </div>
                    <Boton pequeno onClick={() => void usarDelHistorial(trabajo)}>
                      Usar
                    </Boton>
                  </div>
                ))}
              </div>
            )}

            <div className="grupo-botones espaciado">
              <Boton onClick={() => refArchivoVoz.current?.click()}>
                <IconoSubir /> Subir archivo de voz
              </Boton>
              <Link className="btn btn-secundario" to="/texto-voz">
                <IconoTextoVoz /> Crear una voz
              </Link>
              <Link className="btn btn-secundario" to="/grabadora">
                <IconoMicrofono /> Grabar ahora
              </Link>
            </div>
            <input
              ref={refArchivoVoz}
              type="file"
              accept={EXTENSIONES_ACEPTADAS.join(',')}
              className="sr-solo"
              tabIndex={-1}
              aria-label="Subir archivo de voz"
              onChange={(e) => void alSubirVoz(e)}
            />
          </Tarjeta>
        )}

        {errorVoz != null && (
          <div className="espaciado">
            <Aviso
              tipo="error"
              accion={
                puedeReintentarse(errorVoz) ? (
                  <Boton pequeno onClick={() => void cargarVozDesdeParametro()}>
                    Reintentar
                  </Boton>
                ) : undefined
              }
            >
              {mensajeAmigable(errorVoz)}
            </Aviso>
          </div>
        )}
      </section>

      {/* ── Pista de música ── */}
      <section aria-labelledby="titulo-musica">
        <h2 id="titulo-musica" className="titulo-seccion">
          Música
        </h2>

        <div className="rejilla rejilla-2">
          {PISTAS_MUSICA.map((pista) => {
            const seleccionada = musica?.id === pista.id;
            const enVistaPrevia = idVistaPrevia === pista.id;
            const cargando = idMusicaCargando === pista.id;
            return (
              <div
                key={pista.id}
                className={`pista-musica${seleccionada ? ' seleccionada' : ''}`}
              >
                <button
                  type="button"
                  className="btn-icono"
                  onClick={() => alternarVistaPrevia(pista.id, pista.archivo)}
                  aria-label={
                    enVistaPrevia
                      ? `Pausar vista previa de ${pista.nombre}`
                      : `Escuchar vista previa de ${pista.nombre}`
                  }
                  aria-pressed={enVistaPrevia}
                  title={enVistaPrevia ? 'Pausar vista previa' : 'Escuchar vista previa'}
                >
                  {enVistaPrevia ? <IconoPausa /> : <IconoReproducir />}
                </button>
                <div className="pista-musica-info">
                  <p className="pista-musica-nombre">{pista.nombre}</p>
                  <p className="pista-musica-desc">{pista.descripcion}</p>
                </div>
                <Boton
                  pequeno
                  onClick={() => void elegirMusica(pista.id, pista.nombre, pista.archivo)}
                  disabled={cargando}
                  aria-pressed={seleccionada}
                >
                  {cargando ? 'Cargando…' : seleccionada ? 'Seleccionada' : 'Seleccionar'}
                </Boton>
              </div>
            );
          })}

          <div className="pista-musica">
            <span className="btn-icono" aria-hidden="true" style={{ pointerEvents: 'none' }}>
              <IconoSubir />
            </span>
            <div className="pista-musica-info">
              <p className="pista-musica-nombre">Subir mi propia música</p>
              <p className="pista-musica-desc">Usa un archivo de audio de tu dispositivo.</p>
            </div>
            <Boton pequeno onClick={() => refArchivoMusica.current?.click()}>
              Elegir archivo
            </Boton>
          </div>
        </div>
        <input
          ref={refArchivoMusica}
          type="file"
          accept={EXTENSIONES_ACEPTADAS.join(',')}
          className="sr-solo"
          tabIndex={-1}
          aria-label="Subir mi propia música"
          onChange={alSubirMusicaPropia}
        />

        {idMusicaCargando != null && (
          <div className="espaciado">
            <Cargando texto="Cargando música…" />
          </div>
        )}

        {errorMusica != null && (
          <div className="espaciado">
            <Aviso
              tipo="error"
              accion={
                puedeReintentarse(errorMusica) ? (
                  <Boton pequeno onClick={reintentarMusica}>
                    Reintentar
                  </Boton>
                ) : undefined
              }
            >
              {mensajeAmigable(errorMusica)}
            </Aviso>
          </div>
        )}

        <div className="espaciado">
          <Tarjeta>
            <p className="tarjeta-titulo">
              <span className="fila" style={{ gap: 8 }}>
                <IconoMusica size={20} /> MÚSICA
              </span>
            </p>
            {musica ? (
              <>
                <p className="tarjeta-descripcion">
                  {musica.nombre} · {formatearTiempo(musica.buffer.duration)}
                </p>
                <Waveform
                  picos={musica.picos}
                  progreso={0}
                  etiquetaAccesible={`Forma de onda de ${musica.nombre}`}
                />
                <div className="grupo-botones espaciado">
                  <Boton variante="fantasma" onClick={quitarMusica}>
                    Sin música
                  </Boton>
                </div>
              </>
            ) : (
              <>
                <p className="tarjeta-descripcion">
                  Todavía no has elegido música. La mezcla funcionará solo con la voz.
                </p>
                <Waveform
                  picos={null}
                  progreso={0}
                  etiquetaAccesible="Forma de onda de la música (vacía)"
                />
              </>
            )}
          </Tarjeta>
        </div>
      </section>

      {/* Elemento de audio dedicado a las vistas previas de las pistas */}
      <audio
        ref={refVistaPrevia}
        preload="none"
        className="sr-solo"
        aria-hidden="true"
        onEnded={() => setIdVistaPrevia(null)}
        onError={() => setIdVistaPrevia(null)}
      />

      {/* ── Ajustes de la mezcla ── */}
      <section aria-labelledby="titulo-ajustes">
        <h2 id="titulo-ajustes" className="titulo-seccion">
          Ajustes de la mezcla
        </h2>
        <Tarjeta>
          <Deslizador
            etiqueta="Volumen de voz"
            valor={volumenVoz}
            min={0}
            max={150}
            alCambiar={setVolumenVoz}
            formatoValor={(v) => `${v} %`}
          />
          <Deslizador
            etiqueta="Volumen de música"
            valor={volumenMusica}
            min={0}
            max={100}
            alCambiar={setVolumenMusica}
            formatoValor={(v) => `${v} %`}
            ayuda="La voz debe entenderse siempre con claridad."
          />
          <div className="grupo-botones">
            <Interruptor
              etiqueta="Silenciar voz"
              activado={silenciarVoz}
              alCambiar={setSilenciarVoz}
            />
            <Interruptor
              etiqueta="Silenciar música"
              activado={silenciarMusica}
              alCambiar={setSilenciarMusica}
            />
          </div>
          <Deslizador
            etiqueta="La música empieza en"
            valor={inicioMusicaSeg}
            min={0}
            max={duracionVoz}
            paso={0.5}
            alCambiar={setInicioMusicaSeg}
            formatoValor={(v) => `${v.toFixed(1)} s`}
          />
          <Deslizador
            etiqueta="Fundido de entrada de la música"
            valor={fundidoEntradaSeg}
            min={0}
            max={10}
            paso={0.5}
            alCambiar={setFundidoEntradaSeg}
            formatoValor={(v) => `${v.toFixed(1)} s`}
          />
          <Deslizador
            etiqueta="Fundido de salida de la música"
            valor={fundidoSalidaSeg}
            min={0}
            max={10}
            paso={0.5}
            alCambiar={setFundidoSalidaSeg}
            formatoValor={(v) => `${v.toFixed(1)} s`}
          />
          <Interruptor
            etiqueta="Cortar la música al terminar la voz"
            activado={cortarAlFinalizar}
            alCambiar={setCortarAlFinalizar}
          />
          <Interruptor
            etiqueta="Repetir la música"
            activado={repetir}
            alCambiar={setRepetir}
            ayuda="Repite la música hasta cubrir toda la mezcla."
          />
          <Interruptor
            etiqueta="Reducir música mientras hay voz"
            activado={ducking}
            alCambiar={setDucking}
            ayuda="La música baja automáticamente cuando se escucha la voz."
          />
          {ducking && (
            <Deslizador
              etiqueta="Intensidad"
              valor={intensidadDucking}
              min={0}
              max={90}
              alCambiar={setIntensidadDucking}
              formatoValor={(v) => `${v} %`}
            />
          )}
        </Tarjeta>
      </section>

      {/* ── Vista previa ── */}
      <section aria-labelledby="titulo-vista-previa">
        <h2 id="titulo-vista-previa" className="titulo-seccion">
          Vista previa
        </h2>
        <Tarjeta>
          <div className="grupo-botones">
            <Boton
              variante="primario"
              onClick={() => void previsualizar()}
              disabled={!voz || mezclando}
            >
              <IconoMezcla /> {mezclando ? 'Mezclando…' : 'Previsualizar mezcla'}
            </Boton>
          </div>

          {mezclando && <BarraProgreso fase="Mezclando…" porcentaje={null} />}

          {errorMezcla != null && (
            <div className="espaciado">
              <Aviso
                tipo="error"
                accion={
                  puedeReintentarse(errorMezcla) ? (
                    <Boton pequeno onClick={() => void previsualizar()}>
                      Reintentar
                    </Boton>
                  ) : undefined
                }
              >
                {mensajeAmigable(errorMezcla)}
              </Aviso>
            </div>
          )}

          {mezcla && !mezclando && (
            <div className="espaciado">
              {mezcla.firma !== firma && (
                <p className="texto-secundario texto-pequeno">
                  Has cambiado los ajustes después de esta vista previa. La exportación usará los
                  ajustes actuales.
                </p>
              )}
              <ReproductorAudio
                blob={mezcla.blob}
                picos={mezcla.picos}
                titulo="Tu mezcla"
                subtitulo={`${formatearTiempo(mezcla.buffer.duration)} de audio`}
              />
            </div>
          )}
        </Tarjeta>
      </section>

      {/* ── Exportar ── */}
      <section aria-labelledby="titulo-exportar">
        <h2 id="titulo-exportar" className="titulo-seccion">
          Exportar
        </h2>
        <Tarjeta>
          <p className="tarjeta-descripcion">
            Descarga tu mezcla en un formato de audio estándar. El procesamiento se hace en tu
            dispositivo.
          </p>
          <Boton variante="primario" grande onClick={abrirModalExportar} disabled={!voz}>
            <IconoDescargar /> Exportar audio
          </Boton>
        </Tarjeta>
      </section>

      {modalExportar && (
        <Modal titulo="Exportar audio" alCerrar={() => { if (!exportando) cerrarModal(); }}>
          {!descargaLista ? (
            <>
              <div className="campo">
                <label className="campo-etiqueta" htmlFor="nombre-exportacion">
                  Nombre del archivo
                </label>
                <input
                  id="nombre-exportacion"
                  className="entrada"
                  type="text"
                  value={nombreExp}
                  disabled={exportando}
                  onChange={(e) => {
                    nombreTocado.current = true;
                    setNombreExp(e.target.value);
                  }}
                />
              </div>

              <div className="campo">
                <label className="campo-etiqueta" htmlFor="formato-exportacion">
                  Formato
                </label>
                <select
                  id="formato-exportacion"
                  className="seleccion"
                  value={formatoExp}
                  disabled={exportando}
                  onChange={(e) => setFormatoExp(e.target.value as FormatoExportacion)}
                >
                  {obtenerFormatosDisponibles().map((f) => (
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
                  value={calidadExp}
                  disabled={exportando}
                  onChange={(e) => setCalidadExp(e.target.value as CalidadExportacion)}
                >
                  {CALIDADES_EXPORTACION.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
                {calidadElegida && <p className="campo-ayuda">{calidadElegida.descripcion}</p>}
              </div>

              {exportando && <BarraProgreso fase={faseExportacion} porcentaje={null} />}

              {errorExportacion != null && (
                <div className="espaciado">
                  <Aviso
                    tipo="error"
                    accion={
                      puedeReintentarse(errorExportacion) ? (
                        <Boton pequeno onClick={() => void exportar()}>
                          Reintentar
                        </Boton>
                      ) : undefined
                    }
                  >
                    {mensajeAmigable(errorExportacion)}
                  </Aviso>
                </div>
              )}

              <div className="grupo-botones">
                <Boton variante="primario" onClick={() => void exportar()} disabled={exportando}>
                  <IconoDescargar /> Exportar
                </Boton>
                <Boton onClick={cerrarModal} disabled={exportando}>
                  Cerrar
                </Boton>
              </div>
            </>
          ) : (
            <>
              <Aviso tipo="exito">Audio listo para descargar</Aviso>
              <p className="texto-secundario espaciado">
                {descargaLista.nombreArchivo} · {formatearBytes(descargaLista.blob.size)} ·
                guardado en «Mis audios».
              </p>
              <div className="grupo-botones">
                <Boton variante="primario" onClick={descargarResultado}>
                  <IconoDescargar /> Descargar
                </Boton>
                <Boton onClick={cerrarModal}>Cerrar</Boton>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
