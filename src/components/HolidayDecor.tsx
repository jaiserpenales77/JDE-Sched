import type { CSSProperties, ReactNode } from "react";
import type { HolidayIcon, HolidayTheme } from "../holidayThemes";

// Small drawings for the holiday themes, on a 24x24 grid. `color` is for
// the ones that come in more than one color (stars, hearts, leaves...).
function iconBody({ icon, color }: HolidayIcon): ReactNode {
  switch (icon) {
    case "pumpkin":
      return (
        <>
          <path d="M12 8c0-2.2 1-3.8 3.2-4.6" stroke="#3f6212" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <ellipse cx="7.6" cy="14.6" rx="5" ry="6.6" fill="#ea580c" />
          <ellipse cx="16.4" cy="14.6" rx="5" ry="6.6" fill="#ea580c" />
          <ellipse cx="12" cy="14.6" rx="5.2" ry="7.1" fill="#f97316" />
        </>
      );
    case "bat":
      return (
        <path
          d="M12 9.2c1.1 0 1.9.7 2.1 1.7C15.5 8.7 18 7.2 22 7.2c-1.5 1.6-2 3.6-1.6 6-1.4-.9-3-.9-4 .4-.7-1.1-1.8-1.6-2.8-1.4L12 15.2l-1.6-3c-1-.2-2.1.3-2.8 1.4-1-1.3-2.6-1.3-4-.4.4-2.4-.1-4.4-1.6-6 4 0 6.5 1.5 7.9 3.7.2-1 1-1.7 2.1-1.7z"
          fill="#1f2937"
        />
      );
    case "moon":
      return <path d="M14.5 2.5a9.5 9.5 0 1 0 7 15.9A7.8 7.8 0 1 1 14.5 2.5z" fill="#facc15" />;
    case "leaf":
      return (
        <>
          <path
            d="M12 2.5l1.6 3.6 3-1.4-.6 3.6 3.6-.4-2 3 2.6 1.6-3.8 1.2.8 3.2-3.4-1.6-.4 4.6h-1.2l-.4-4.6-3.4 1.6.8-3.2-3.8-1.2 2.6-1.6-2-3 3.6.4-.6-3.6 3 1.4z"
            fill={color}
          />
          <path d="M12 15v7" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
        </>
      );
    case "snowflake":
      return (
        <g stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" fill="none">
          <path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6" />
          <path d="M9.6 4.2L12 6l2.4-1.8M9.6 19.8L12 18l2.4 1.8M4.6 10.4l2.6-.8-.6-2.8M19.4 13.6l-2.6.8.6 2.8M4.6 13.6l2.6.8-.6 2.8M19.4 10.4l-2.6-.8.6-2.8" />
        </g>
      );
    case "ornament":
      return (
        <>
          <circle cx="12" cy="14.5" r="7" fill={color} />
          <rect x="10" y="5.2" width="4" height="3" rx=".6" fill="#a3a3a3" />
          <path d="M5.6 13.2c4.2 1.8 8.6 1.8 12.8 0" stroke="#fde68a" strokeWidth="1.3" fill="none" />
        </>
      );
    case "star":
      return <polygon points="12,2 14.9,8.6 22,9.3 16.6,14 18.2,21 12,17.3 5.8,21 7.4,14 2,9.3 9.1,8.6" fill={color} />;
    case "firework":
      return (
        <>
          <path
            d="M12 2.5v4.5M12 17v4.5M2.5 12H7M17 12h4.5M5.3 5.3l3.2 3.2M15.5 15.5l3.2 3.2M5.3 18.7l3.2-3.2M15.5 8.5l3.2-3.2"
            stroke={color}
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="1.7" fill={color} />
        </>
      );
    case "heart":
      return (
        <path
          d="M12 21s-7.2-4.6-9.4-9.2C1 8.4 3 5 6.6 5c2 0 3.6 1.2 5.4 3.2C13.8 6.2 15.4 5 17.4 5 21 5 23 8.4 21.4 11.8 19.2 16.4 12 21 12 21z"
          fill={color}
        />
      );
    case "shamrock":
      return (
        <>
          <g fill="#16a34a">
            <circle cx="12" cy="7.2" r="4.3" />
            <circle cx="7.4" cy="12.6" r="4.3" />
            <circle cx="16.6" cy="12.6" r="4.3" />
          </g>
          <path d="M12 12.5c.3 3.4 1.2 6.4 3 9" stroke="#15803d" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </>
      );
    case "coin":
      return (
        <>
          <circle cx="12" cy="12" r="8" fill="#eab308" />
          <circle cx="12" cy="12" r="5.6" fill="none" stroke="#a16207" strokeWidth="1.2" />
        </>
      );
    case "rainbow":
      return (
        <g fill="none" strokeWidth="2.2">
          <path d="M2 19a10 10 0 0 1 20 0" stroke="#ef4444" />
          <path d="M4.4 19a7.6 7.6 0 0 1 15.2 0" stroke="#f59e0b" />
          <path d="M6.8 19a5.2 5.2 0 0 1 10.4 0" stroke="#22c55e" />
          <path d="M9.2 19a2.8 2.8 0 0 1 5.6 0" stroke="#3b82f6" />
        </g>
      );
    case "egg":
      return (
        <>
          <ellipse cx="12" cy="13" rx="7" ry="9" fill={color} />
          <path d="M5.4 12l2.2-1.6 2.2 1.6 2.2-1.6 2.2 1.6 2.2-1.6 2.2 1.6" stroke="#fff" strokeWidth="1.3" fill="none" />
          <circle cx="9" cy="16.5" r="1" fill="#fff" />
          <circle cx="15" cy="16.5" r="1" fill="#fff" />
        </>
      );
    case "flower":
      return (
        <>
          <g fill={color}>
            <circle cx="12" cy="6.6" r="3.6" />
            <circle cx="17.1" cy="10.3" r="3.6" />
            <circle cx="15.2" cy="16.4" r="3.6" />
            <circle cx="8.8" cy="16.4" r="3.6" />
            <circle cx="6.9" cy="10.3" r="3.6" />
          </g>
          <circle cx="12" cy="12" r="2.8" fill="#facc15" />
        </>
      );
    case "flag":
      return (
        <>
          <rect x="3" y="2.5" width="1.4" height="19.5" fill="#6b7280" />
          <rect x="4.4" y="4" width="16.5" height="10" fill="#fff" stroke="#e5e7eb" strokeWidth=".4" />
          <g fill="#b91c1c">
            <rect x="4.4" y="4" width="16.5" height="1.43" />
            <rect x="4.4" y="6.86" width="16.5" height="1.43" />
            <rect x="4.4" y="9.71" width="16.5" height="1.43" />
            <rect x="4.4" y="12.57" width="16.5" height="1.43" />
          </g>
          <rect x="4.4" y="4" width="7.2" height="5.7" fill="#1e3a8a" />
        </>
      );
    case "hardHat":
      return (
        <>
          <path d="M4 15.5a8 8 0 0 1 16 0z" fill="#facc15" />
          <rect x="11" y="7.6" width="2" height="7.9" fill="#ca8a04" />
          <rect x="2" y="15.5" width="20" height="2.8" rx="1.3" fill="#eab308" />
        </>
      );
    case "gear":
      return (
        <>
          <g fill="#64748b">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
              <rect key={a} x="10.5" y="1.6" width="3" height="4.4" rx=".6" transform={`rotate(${a} 12 12)`} />
            ))}
            <circle cx="12" cy="12" r="7" />
          </g>
          <circle cx="12" cy="12" r="2.8" fill="#fff" />
        </>
      );
    case "tree":
      return (
        <>
          <path d="M12 2l5 6h-2.5l4 5h-2.5l4 5H4l4-5H5.5l4-5H7z" fill="#15803d" />
          <rect x="10.6" y="18" width="2.8" height="4" fill="#7c2d12" />
        </>
      );
    case "snowman":
      return (
        <>
          <g fill="#fff" stroke="#94a3b8" strokeWidth=".9">
            <circle cx="12" cy="17.6" r="4.6" />
            <circle cx="12" cy="10.8" r="3.4" />
            <circle cx="12" cy="5.6" r="2.5" />
          </g>
          <rect x="9.6" y="1.2" width="4.8" height="2.4" fill="#1f2937" />
          <rect x="8.6" y="3.4" width="6.8" height=".9" fill="#1f2937" />
          <path d="M9 8.3h6" stroke="#dc2626" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="12" cy="11" r=".6" fill="#1f2937" />
          <circle cx="12" cy="13" r=".6" fill="#1f2937" />
        </>
      );
    case "gift":
      return (
        <>
          <rect x="3" y="9.5" width="18" height="11.5" rx="1" fill={color} />
          <rect x="2" y="6.5" width="20" height="4" rx="1" fill={color} />
          <rect x="10.8" y="6.5" width="2.4" height="14.5" fill="#fde68a" />
          <path d="M12 6.5c-2-3-6-3-5 0zM12 6.5c2-3 6-3 5 0z" fill="#fde68a" />
        </>
      );
    case "holly":
      return (
        <>
          <ellipse cx="8" cy="11" rx="6" ry="3" fill="#15803d" transform="rotate(-30 8 11)" />
          <ellipse cx="16" cy="11" rx="6" ry="3" fill="#15803d" transform="rotate(30 16 11)" />
          <circle cx="10.4" cy="15.2" r="2" fill="#dc2626" />
          <circle cx="13.6" cy="15.2" r="2" fill="#dc2626" />
          <circle cx="12" cy="12.6" r="2" fill="#dc2626" />
        </>
      );
  }
}

export function HolidayIconSvg({ icon, style }: { icon: HolidayIcon; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" style={style} aria-hidden="true">
      {iconBody(icon)}
    </svg>
  );
}

// The title line with the theme: icons each side of the title, then the
// greeting and the date. Classic keeps the title centered with the greeting
// under it (see App.css).
export function HolidayTitle({
  theme,
  title,
  today,
  date,
}: {
  theme: HolidayTheme;
  title: string;
  today: Date;
  // The printed date, or null when it's turned off.
  date: string | null;
}) {
  const [a, b] = theme.side;
  return (
    <div className="holiday-title" style={{ "--holiday-greeting": theme.greetingColor } as CSSProperties}>
      <span className="holiday-heading">
        <HolidayIconSvg icon={a} />
        <HolidayIconSvg icon={b} />
        <span className="holiday-title-text">{title}</span>
        <HolidayIconSvg icon={b} />
        <HolidayIconSvg icon={a} />
      </span>
      <span className="holiday-sub">
        <span className="holiday-greeting">{theme.greeting(today)}</span>
        {date && <span className="print-title-date">{date}</span>}
      </span>
    </div>
  );
}

// The thin row of small icons under the title.
export function HolidayStrip({ theme, count }: { theme: HolidayTheme; count: number }) {
  return (
    <div className="holiday-strip" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <HolidayIconSvg key={i} icon={theme.strip[i % theme.strip.length]} />
      ))}
    </div>
  );
}

// Where the scene's pieces go: three on the ground at the left, some in
// the sky across the middle, a big one at the right. Sizes in px.
const FULL_LAYOUT = {
  ground: [
    { left: "0", bottom: 0, size: 52 },
    { left: "46px", bottom: 0, size: 36 },
    { left: "80px", bottom: 0, size: 26 },
  ],
  sky: [
    { left: "34%", top: 6, size: 24 },
    { left: "43%", top: 26, size: 18 },
    { left: "57%", top: 2, size: 20 },
    { left: "70%", top: 30, size: 16 },
    { left: "84%", top: 20, size: 22 },
  ],
  corner: 58,
};
const SMALL_LAYOUT = {
  ground: [
    { left: "0", bottom: 0, size: 22 },
    { left: "20px", bottom: 0, size: 16 },
  ],
  sky: [
    { left: "37%", top: 2, size: 14 },
    { left: "61%", top: 8, size: 12 },
    { left: "86%", top: 4, size: 14 },
  ],
  corner: 22,
};

function Scene({ theme, layout, className }: { theme: HolidayTheme; layout: typeof FULL_LAYOUT; className: string }) {
  return (
    <div className={className}>
      {layout.ground.map((g, i) => (
        <HolidayIconSvg
          key={`g${i}`}
          icon={theme.ground[i]}
          style={{ left: g.left, bottom: g.bottom, width: g.size, height: g.size }}
        />
      ))}
      {layout.sky.map((s, i) => (
        <HolidayIconSvg
          key={`s${i}`}
          icon={theme.sky[i % theme.sky.length]}
          style={{ left: s.left, top: s.top, width: s.size, height: s.size }}
        />
      ))}
      <HolidayIconSvg icon={theme.corner} style={{ right: 0, top: 0, width: layout.corner, height: layout.corner }} />
    </div>
  );
}

// The scene under the schedule. Both sizes are here; the report's
// data-scene attribute (set from the room left on the printed page) shows
// one of them, or neither.
export function HolidayScene({ theme }: { theme: HolidayTheme }) {
  return (
    <div className="holiday-scene" aria-hidden="true">
      <Scene theme={theme} layout={FULL_LAYOUT} className="holiday-scene-full" />
      <Scene theme={theme} layout={SMALL_LAYOUT} className="holiday-scene-small" />
    </div>
  );
}
