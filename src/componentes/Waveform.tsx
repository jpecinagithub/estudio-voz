/**
 * Forma de onda en canvas: ligera, responsive y accesible.
 * Dibuja los picos precalculados y el progreso de reproducción.
 */
import { useCallback, useEffect, useRef } from 'react';

interface Props {
  picos: Float32Array | null;
  /** 0..1 */
  progreso: number;
  /** Si se indica, la onda permite buscar (clic / arrastre / teclado). */
  alBuscar?: (proporcion: number) => void;
  altura?: number;
  etiquetaAccesible?: string;
}

export function Waveform({
  picos,
  progreso,
  alBuscar,
  altura = 96,
  etiquetaAccesible = 'Forma de onda del audio',
}: Props) {
  const refCanvas = useRef<HTMLCanvasElement>(null);
  const refContenedor = useRef<HTMLDivElement>(null);
  const interactiva = typeof alBuscar === 'function';

  const dibujar = useCallback(() => {
    const canvas = refCanvas.current;
    const contenedor = refContenedor.current;
    if (!canvas || !contenedor) return;
    const ancho = contenedor.clientWidth;
    if (ancho <= 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(ancho * dpr);
    canvas.height = Math.round(altura * dpr);
    canvas.style.height = `${altura}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, ancho, altura);

    const estilos = getComputedStyle(document.documentElement);
    const colorFondo = estilos.getPropertyValue('--borde').trim() || '#273244';
    const colorAcento = estilos.getPropertyValue('--acento').trim() || '#3ddc97';

    const n = picos?.length ?? 120;
    const anchoBarra = Math.max(1, ancho / n);
    const limite = Math.floor(progreso * n);

    for (let i = 0; i < n; i++) {
      const pico = picos ? Math.max(0.04, Math.min(1, picos[i])) : 0.04;
      const h = Math.max(2, pico * (altura - 8));
      const x = i * anchoBarra;
      const y = (altura - h) / 2;
      ctx.fillStyle = i < limite ? colorAcento : colorFondo;
      const w = Math.max(1, anchoBarra * 0.62);
      const bx = x + (anchoBarra - w) / 2;
      const r = Math.min(w / 2, 2);
      // Barras redondeadas (con alternativa para navegadores antiguos)
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(bx, y, w, h, r);
        ctx.fill();
      } else {
        ctx.fillRect(bx, y, w, h);
      }
    }
  }, [picos, progreso, altura]);

  useEffect(() => {
    dibujar();
    const alRedimensionar = () => dibujar();
    window.addEventListener('resize', alRedimensionar);
    return () => window.removeEventListener('resize', alRedimensionar);
  }, [dibujar]);

  const proporcionDesdeEvento = (e: React.PointerEvent): number => {
    const rect = refContenedor.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const x = e.clientX - rect.left;
    return Math.max(0, Math.min(1, x / rect.width));
  };

  const arrastrando = useRef(false);

  return (
    <div
      ref={refContenedor}
      className="reproductor-onda"
      role={interactiva ? 'slider' : 'img'}
      aria-label={etiquetaAccesible}
      tabIndex={interactiva ? 0 : undefined}
      aria-valuemin={interactiva ? 0 : undefined}
      aria-valuemax={interactiva ? 100 : undefined}
      aria-valuenow={interactiva ? Math.round(progreso * 100) : undefined}
      aria-valuetext={interactiva ? `${Math.round(progreso * 100)} por ciento` : undefined}
      onPointerDown={
        interactiva
          ? (e) => {
              arrastrando.current = true;
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              alBuscar?.(proporcionDesdeEvento(e));
            }
          : undefined
      }
      onPointerMove={
        interactiva
          ? (e) => {
              if (arrastrando.current) alBuscar?.(proporcionDesdeEvento(e));
            }
          : undefined
      }
      onPointerUp={interactiva ? () => (arrastrando.current = false) : undefined}
      onKeyDown={
        interactiva
          ? (e) => {
              const paso = e.shiftKey ? 0.1 : 0.02;
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                alBuscar?.(Math.min(1, progreso + paso));
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                alBuscar?.(Math.max(0, progreso - paso));
              } else if (e.key === 'Home') {
                e.preventDefault();
                alBuscar?.(0);
              } else if (e.key === 'End') {
                e.preventDefault();
                alBuscar?.(1);
              }
            }
          : undefined
      }
    >
      <canvas
        ref={refCanvas}
        className={`onda${interactiva ? ' interactiva' : ''}`}
        aria-hidden
      />
    </div>
  );
}
