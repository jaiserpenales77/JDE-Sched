import { useEffect, useState } from "react";

// How long the intro plays before it fades into the app, and the fades.
const PLAY_MS = 2600;
const FADE_MS = 450;
const SKIP_FADE_MS = 200;
// Set for this tab once the intro has played, so a refresh doesn't replay it.
const PLAYED_KEY = "jde-sched-intro-played";

// Decided once per page load: play when the app is opened, not on a
// refresh, and never on computers set to reduce motion.
const playOnOpen = (() => {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    if (sessionStorage.getItem(PLAYED_KEY)) return false;
    sessionStorage.setItem(PLAYED_KEY, "1");
    return true;
  } catch {
    return false;
  }
})();

type Phase = "playing" | "leaving" | "skipping" | "done";

// The LineUp intro: bottles ride in on a conveyor, a cap drops onto the
// middle one, "Welcome to LineUp" rises in, then it fades into the app
// (which loads underneath). A click or any key skips it.
export default function IntroSplash() {
  const [phase, setPhase] = useState<Phase>(playOnOpen ? "playing" : "done");

  useEffect(() => {
    if (phase === "playing") {
      const timer = window.setTimeout(() => setPhase("leaving"), PLAY_MS);
      const skip = () => setPhase("skipping");
      window.addEventListener("keydown", skip);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener("keydown", skip);
      };
    }
    if (phase === "leaving" || phase === "skipping") {
      const timer = window.setTimeout(() => setPhase("done"), phase === "leaving" ? FADE_MS : SKIP_FADE_MS);
      return () => window.clearTimeout(timer);
    }
  }, [phase]);

  if (phase === "done") return null;

  return (
    <div
      className={`intro-splash ${phase}`}
      aria-hidden="true"
      onClick={() => setPhase((p) => (p === "playing" ? "skipping" : p))}
    >
      <div className="intro-stage">
        <div className="intro-welcome">Welcome to</div>
        <div className="intro-name">
          Line<span className="intro-up">Up</span>
        </div>
        <div className="intro-tag">Production Line Schedule &amp; Crew Board</div>
        <svg className="intro-scene" viewBox="0 0 480 250">
          <defs>
            <linearGradient id="intro-glass" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#2b1407" />
              <stop offset="0.18" stopColor="#7c3f17" />
              <stop offset="0.34" stopColor="#b86a30" />
              <stop offset="0.52" stopColor="#7c3f17" />
              <stop offset="0.8" stopColor="#4a230c" />
              <stop offset="1" stopColor="#2b1407" />
            </linearGradient>
          </defs>

          <g className="intro-belt-group">
            <rect className="intro-leg" x="96" y="206" width="8" height="34" rx="2" />
            <rect className="intro-leg" x="376" y="206" width="8" height="34" rx="2" />
            <rect className="intro-belt" x="58" y="190" width="364" height="16" rx="8" />
            <line className="intro-track" x1="70" y1="198" x2="410" y2="198" />
            <g transform="translate(72 198)">
              <g className="intro-roller-spin">
                <circle className="intro-roller" r="7" />
                <line className="intro-spoke" x1="-5" y1="0" x2="5" y2="0" />
              </g>
            </g>
            <g transform="translate(408 198)">
              <g className="intro-roller-spin">
                <circle className="intro-roller" r="7" />
                <line className="intro-spoke" x1="-5" y1="0" x2="5" y2="0" />
              </g>
            </g>
          </g>

          {[150, 240, 330].map((x) => (
            <g key={x} transform={`translate(${x} 190)`}>
              <g className="intro-slide">
                <rect className="intro-glass" x="-13" y="-72" width="26" height="12" rx="3" />
                <rect className="intro-glass" x="-22" y="-63" width="44" height="63" rx="9" />
                <rect className="intro-shine" x="-16" y="-58" width="4" height="50" rx="2" />
                <circle className="intro-spec" cx="-9" cy="-55" r="2" />
                <rect className="intro-label" x="-22" y="-44" width="44" height="24" />
                {/* The middle bottle arrives without its cap. */}
                {x !== 240 && <Cap />}
              </g>
              {x === 240 && (
                <>
                  <g className="intro-cap-drop">
                    <Cap />
                  </g>
                  <circle className="intro-ring" cx="0" cy="-78" r="22" />
                </>
              )}
            </g>
          ))}
        </svg>
        <div className="intro-skip">Click anywhere to skip</div>
      </div>
    </div>
  );
}

function Cap() {
  return (
    <>
      <rect className="intro-cap" x="-15" y="-84" width="30" height="13" rx="3" />
      <line className="intro-ridge" x1="-8" y1="-82" x2="-8" y2="-73" />
      <line className="intro-ridge" x1="0" y1="-82" x2="0" y2="-73" />
      <line className="intro-ridge" x1="8" y1="-82" x2="8" y2="-73" />
    </>
  );
}
