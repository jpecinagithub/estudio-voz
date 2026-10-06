/** Primitivas de interfaz compartidas. */
import { useEffect, useRef, type ReactNode } from 'react';
import type { JSX } from 'react';
import { IconoAlerta, IconoCheck, IconoInfo } from './iconos';

/* ── Botón ── */

type VarianteBoton = 'primario' | 'secundario' | 'fantasma' | 'peligro';

interface PropsBoton extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  grande?: boolean;
  pequeno?: boolean;
  anchoCompleto?: boolean;
}

export function Boton({
  variante = 'secundario',
  grande,
  pequeno,
  anchoCompleto,
  className = '',
  ...resto
}: PropsBoton) {
  const clases = [
    'btn',
    `btn-${variante}`,
    grande ? 'btn-grande' : '',
    pequeno ? 'btn-pequeno' : '',
    anchoCompleto ? 'btn-ancho' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <button className={clases} {...resto} />;
}

/* ── Tarjeta ── */

export function Tarjeta({
  children,
  elevada,
  className = '',
}: {
  children: ReactNode;
  elevada?: boolean;
  className?: string;
}) {
  return (
    <div className={`tarjeta${elevada ? ' tarjeta-elevada' : ''} ${className}`}>{children}</div>
  );
}

/* ── Aviso ── */

type TipoAviso = 'error' | 'exito' | 'info' | 'aviso';

const ICONOS_AVISO: Record<TipoAviso, (p: { size?: number }) => JSX.Element> = {
  error: IconoAlerta,
  exito: IconoCheck,
  info: IconoInfo,
  aviso: IconoAlerta,
};

export function Aviso({
  tipo,
  children,
  accion,
}: {
  tipo: TipoAviso;
  children: ReactNode;
  accion?: ReactNode;
}) {
  const Icono = ICONOS_AVISO[tipo];
  return (
    <div className={`aviso aviso-${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      <Icono size={20} />
      <div style={{ flex: 1 }}>{children}</div>
      {accion}
    </div>
  );
}

/* ── Progreso ── */

export function BarraProgreso({
  fase,
  porcentaje,
}: {
  fase: string;
  porcentaje: number | null;
}) {
  const pct = porcentaje == null ? null : Math.max(0, Math.min(100, Math.round(porcentaje)));
  return (
    <div
      className="progreso"
      role="progressbar"
      aria-label={fase}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct ?? undefined}
    >
      <div className="progreso-etiqueta">
        <span>{fase}</span>
        {pct != null && <span className="progreso-valor">{pct} %</span>}
      </div>
      <div className="progreso-barra">
        <div
          className={`progreso-relleno${pct == null ? ' indeterminado' : ''}`}
          style={pct == null ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ── Cargando ── */

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <span className="cargando" role="status">
      <span className="spinner" aria-hidden />
      {texto}
    </span>
  );
}

/* ── Modal ── */

export function Modal({
  titulo,
  children,
  alCerrar,
}: {
  titulo: string;
  children: ReactNode;
  alCerrar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar();
    };
    document.addEventListener('keydown', alPulsar);
    ref.current?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus();
    return () => document.removeEventListener('keydown', alPulsar);
  }, [alCerrar]);

  return (
    <div
      className="modal-fondo"
      onClick={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo} ref={ref}>
        <h2 className="modal-titulo">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

/* ── Deslizador ── */

export function Deslizador({
  etiqueta,
  valor,
  min,
  max,
  paso = 1,
  alCambiar,
  formatoValor,
  ayuda,
}: {
  etiqueta: string;
  valor: number;
  min: number;
  max: number;
  paso?: number;
  alCambiar: (v: number) => void;
  formatoValor?: (v: number) => string;
  ayuda?: string;
}) {
  const id = `deslizador-${etiqueta.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div className="deslizador">
      <div className="deslizador-cabecera">
        <label htmlFor={id}>{etiqueta}</label>
        <span className="deslizador-valor" aria-live="polite">
          {formatoValor ? formatoValor(valor) : valor}
        </span>
      </div>
      <input
        id={id}
        type="range"
        className="rango"
        min={min}
        max={max}
        step={paso}
        value={valor}
        onChange={(e) => alCambiar(Number(e.target.value))}
        aria-describedby={ayuda ? `${id}-ayuda` : undefined}
      />
      {ayuda && (
        <div className="campo-ayuda" id={`${id}-ayuda`}>
          {ayuda}
        </div>
      )}
    </div>
  );
}

/* ── Interruptor ── */

export function Interruptor({
  etiqueta,
  activado,
  alCambiar,
  ayuda,
}: {
  etiqueta: string;
  activado: boolean;
  alCambiar: (v: boolean) => void;
  ayuda?: string;
}) {
  return (
    <div style={{ margin: '10px 0' }}>
      <label className="interruptor">
        <input
          type="checkbox"
          checked={activado}
          onChange={(e) => alCambiar(e.target.checked)}
        />
        <span className="interruptor-pista" aria-hidden />
        <span>{etiqueta}</span>
      </label>
      {ayuda && <div className="campo-ayuda">{ayuda}</div>}
    </div>
  );
}

/* ── Estado vacío ── */

export function EstadoVacio({
  icono,
  titulo,
  texto,
  accion,
}: {
  icono: ReactNode;
  titulo: string;
  texto: string;
  accion?: ReactNode;
}) {
  return (
    <div className="estado-vacio">
      {icono}
      <h3 style={{ margin: '0 0 4px', color: 'var(--texto)' }}>{titulo}</h3>
      <p>{texto}</p>
      {accion}
    </div>
  );
}
