import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...rest }: P) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...rest,
  };
}

export const ArrowRight = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const ArrowLeft = (p: P) => (
  <svg {...base(p)}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
export const Close = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const Gear = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
  </svg>
);
export const Play = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
  </svg>
);
export const Pause = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 5v14M16 5v14" strokeWidth={3} />
  </svg>
);
export const Reset = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" />
  </svg>
);
export const Mic = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);
export const Speaker = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
  </svg>
);
export const SpeakerOff = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" />
  </svg>
);
export const List = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" strokeWidth={2.2} />
  </svg>
);
export const Clock = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
export const Flame = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.2 2.4-5 3.5-7.8.6 1.6 1.7 2.6 2.5 2.9C11.8 6.6 13 4.4 15 3c-.2 2.9 3.5 6 3.5 10.8 0 4-2.6 7.2-6.5 7.2z" />
  </svg>
);
export const Check = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const LinkIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
  </svg>
);
export const Send = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);
export const Trash = (p: P) => (
  <svg {...base(p)}>
    <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7" />
  </svg>
);
export const Plus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const Minus = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
  </svg>
);
export const ChevronRight = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
export const YouTube = (p: P) => (
  <svg {...base(p)} strokeWidth={0}>
    <path
      fill="currentColor"
      d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8zM10 15V9l5.2 3z"
    />
  </svg>
);
export const Bell = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />
  </svg>
);
export const Spoon = (p: P) => (
  <svg {...base(p)}>
    <ellipse cx="8" cy="8" rx="4" ry="5" transform="rotate(-45 8 8)" />
    <path d="M11 11l9 9" />
  </svg>
);
export const Scale = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="9" width="17" height="11" rx="2.5" />
    <path d="M7 9V6.5h10V9M12 12.5v2.5" />
  </svg>
);
export const Eye = (p: P) => (
  <svg {...base(p)}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
);
export const HomeIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 11l8-6.5 8 6.5M6 9.5V19.5h4.5v-5h3v5H18V9.5" />
  </svg>
);
export const SearchIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </svg>
);
export const Star = ({ filled, ...p }: P & { filled?: boolean }) => (
  <svg {...base(p)}>
    <path d="M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.8l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" fill={filled ? "currentColor" : "none"} />
  </svg>
);
export const Pin = ({ filled, ...p }: P & { filled?: boolean }) => (
  <svg {...base(p)}>
    <path d="M9 4h6l-1 5 3.5 3v1.5h-11V12L10 9z" fill={filled ? "currentColor" : "none"} />
    <path d="M12 13.5V20" />
  </svg>
);
export const User = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.5 20c1.2-3.8 4-5.5 7.5-5.5s6.3 1.7 7.5 5.5" />
  </svg>
);
export const Bookmark = (p: P) => (
  <svg {...base(p)}>
    <path d="M6.5 4h11v16l-5.5-4-5.5 4z" />
  </svg>
);
export const Calendar = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M14 14h2M8 17.5h2" />
  </svg>
);
