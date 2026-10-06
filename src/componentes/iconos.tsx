/** Iconos SVG propios de la aplicación (trazo simple, 24px). */

interface PropsIcono {
  size?: number;
  className?: string;
}

function base(props: PropsIcono) {
  return {
    width: props.size ?? 22,
    height: props.size ?? 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: props.className,
    'aria-hidden': true,
  };
}

export const IconoInicio = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </svg>
);

export const IconoTextoVoz = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M4 5h16v11H9l-5 4V5z" />
    <path d="M8 9.5h8M8 12.5h5" />
  </svg>
);

export const IconoTranscribir = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M4 6h9M4 10h7M4 14h9M4 18h7" />
    <path d="M15 16v5M13 18.5h4" />
    <circle cx="17" cy="12" r="5" />
  </svg>
);

export const IconoMicrofono = (p: PropsIcono) => (
  <svg {...base(p)}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

export const IconoMezcla = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M4 8h10M18 8h2M4 16h4M12 16h8" />
    <circle cx="16" cy="8" r="2.4" />
    <circle cx="10" cy="16" r="2.4" />
  </svg>
);

export const IconoCarpeta = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
  </svg>
);

export const IconoAjustes = (p: PropsIcono) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.06-.4.1-.8.1-1.2z" />
  </svg>
);

export const IconoReproducir = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor" stroke="none" />
  </svg>
);

export const IconoPausa = (p: PropsIcono) => (
  <svg {...base(p)}>
    <rect x="7" y="5" width="3.4" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="13.6" y="5" width="3.4" height="14" rx="1" fill="currentColor" stroke="none" />
  </svg>
);

export const IconoDetener = (p: PropsIcono) => (
  <svg {...base(p)}>
    <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
  </svg>
);

export const IconoAtras10 = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M11 8.5A5.5 5.5 0 1 1 5.5 14" />
    <path d="M5.5 9.5v4.5H10" />
    <path d="M12.5 8.5v7M15.5 8.5v7" />
  </svg>
);

export const IconoAdelante10 = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M13 8.5a5.5 5.5 0 1 0 5.5 5.5" />
    <path d="M18.5 9.5v4.5H14" />
    <path d="M8.5 8.5v7M11.5 8.5v7" />
  </svg>
);

export const IconoDescargar = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M12 4v11M7.5 11.5 12 16l4.5-4.5" />
    <path d="M4 19.5h16" />
  </svg>
);

export const IconoMusica = (p: PropsIcono) => (
  <svg {...base(p)}>
    <circle cx="7.5" cy="17.5" r="2.8" />
    <circle cx="17" cy="15.5" r="2.8" />
    <path d="M10.3 17.5V6l9.5-2.5V15.5" />
  </svg>
);

export const IconoOnda = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M3 12h2l2.5-6 3 12 3-9 2 3H21" />
  </svg>
);

export const IconoCopiar = (p: PropsIcono) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h9" />
  </svg>
);

export const IconoPapelera = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M4 7h16M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M6.5 7l1 13a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-13" />
  </svg>
);

export const IconoMas = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconoCheck = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M4.5 12.5 10 18 19.5 6.5" />
  </svg>
);

export const IconoAlerta = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M12 4 2.8 20h18.4L12 4z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </svg>
);

export const IconoInfo = (p: PropsIcono) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.5v.01" />
  </svg>
);

export const IconoSubir = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5" />
    <path d="M4 19.5h16" />
  </svg>
);

export const IconoCandado = (p: PropsIcono) => (
  <svg {...base(p)}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </svg>
);

export const IconoVolumen = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M4 10v4h3.5L12 18.5v-13L7.5 10H4z" />
    <path d="M15.5 9.5a4 4 0 0 1 0 5M18 7a7.5 7.5 0 0 1 0 10" />
  </svg>
);

export const IconoSilencio = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M4 10v4h3.5L12 18.5v-13L7.5 10H4z" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </svg>
);

export const IconoEditar = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M4 20h4l11-11a2.4 2.4 0 0 0-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </svg>
);

export const IconoLogo = (p: PropsIcono) => (
  <svg {...base(p)} strokeWidth={2.2}>
    <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
  </svg>
);

export const IconoSeleccionarTodo = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M5 5h14v14H5z" />
    <path d="M5 9.5h14M9.5 5v14" />
  </svg>
);

export const IconoCerrar = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconoAbrir = (p: PropsIcono) => (
  <svg {...base(p)}>
    <path d="M9 5H5v14h14v-4" />
    <path d="M14 4h6v6M20 4l-9 9" />
  </svg>
);
