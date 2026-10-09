import { useId } from "react";

interface Props {
  size: number;
  className?: string;
}

// The LineUp logo: three amber bottles with yellow caps, each taller than
// the last, on a conveyor belt. The belt is drawn in the text color, so it
// shows on both the dark header and a light or dark card.
export default function LogoMark({ size, className }: Props) {
  // Each copy on the page needs its own gradient id.
  const glass = `lineup-glass-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const fill = `url(#${glass})`;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={glass} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3b1c0a" />
          <stop offset="0.3" stopColor="#8a4519" />
          <stop offset="0.45" stopColor="#c27434" />
          <stop offset="0.7" stopColor="#7c3f17" />
          <stop offset="1" stopColor="#3b1c0a" />
        </linearGradient>
      </defs>
      <rect x="9" y="33.5" width="10" height="3" rx="1" fill="#facc15" />
      <rect x="10.5" y="36.5" width="7" height="2.5" fill="#5b2c10" />
      <rect x="7" y="39" width="14" height="12" rx="3" fill={fill} />
      <rect x="7" y="42.5" width="14" height="5" fill="#fde047" />
      <rect x="27" y="25.5" width="10" height="3" rx="1" fill="#facc15" />
      <rect x="28.5" y="28.5" width="7" height="2.5" fill="#5b2c10" />
      <rect x="25" y="31" width="14" height="20" rx="3" fill={fill} />
      <rect x="25" y="37" width="14" height="6" fill="#fde047" />
      <rect x="45" y="17.5" width="10" height="3" rx="1" fill="#facc15" />
      <rect x="46.5" y="20.5" width="7" height="2.5" fill="#5b2c10" />
      <rect x="43" y="23" width="14" height="28" rx="3" fill={fill} />
      <rect x="43" y="32" width="14" height="7" fill="#fde047" />
      <rect x="4" y="51" width="56" height="7" rx="3.5" fill="currentColor" />
      <circle cx="8" cy="54.5" r="1.6" fill="#64748b" />
      <circle cx="56" cy="54.5" r="1.6" fill="#64748b" />
    </svg>
  );
}

// The logo with the app's name, for the header, unlock and loading screens.
export function Brand({ markSize }: { markSize: number }) {
  return (
    <div className="app-title app-brand">
      <LogoMark size={markSize} className="brand-mark" />
      <div className="brand-text">
        <span className="brand-name">
          Line<span className="brand-up">Up</span>
        </span>
        <small>Production Line Schedule &amp; Crew Board</small>
      </div>
    </div>
  );
}
