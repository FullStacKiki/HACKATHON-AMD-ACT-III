import { useEffect, useState } from "react";

const N = 46; // tick marks over the half circle
const zoneOf = (pct) => (pct < 33.3 ? "var(--warn)" : pct < 66.6 ? "var(--amber)" : "var(--lime)");

// A half circle of tick marks with a needle. The ticks up to the needle light up.
//   value   0-100, where the needle ends up. Leave it out (undefined) when there is no score yet: the needle rests on the left and the ticks stay dim
//   mode    "result" the needle goes to `value` | "scan" it sweeps back and forth | "idle" it rests on the left
//   color   one colour for the lit ticks; leave it out to colour them by zone (red, grey/amber, green)
export default function TickNeedle({ value, mode = "result", color, className = "" }) {
  const has = typeof value === "number";
  const [v, setV] = useState(0);
  useEffect(() => {
    if (mode === "result") { setV(has ? value : 0); return; }
    if (mode === "idle") { setV(0); return; }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(50); return; }
    let raf;
    const t0 = performance.now();
    const loop = (t) => {
      // One full back-and-forth every 1.7 seconds, starting from the left edge.
      setV(50 + 46 * Math.sin(((t - t0) / 1700) * 2 * Math.PI - Math.PI / 2));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mode, value, has]);

  const transition = mode === "result" ? "transform 1200ms cubic-bezier(.25,1.5,.5,1)" : mode === "idle" ? "transform 500ms ease-out" : "none";
  const label = mode === "scan" ? "Analyzing" : has ? `${Math.round(value)} out of 100` : "No score yet";
  return (
    <svg viewBox="0 0 240 130" className={`w-full max-w-[18rem] ${className}`} role="img" aria-label={label}>
      {Array.from({ length: N }, (_, i) => {
        const pct = ((i + 0.5) / N) * 100;
        const a = ((-90 + (i / (N - 1)) * 180) * Math.PI) / 180;
        const lit = mode === "scan" ? true : mode === "result" && has && pct <= v + 1.2;
        const major = i % 5 === 0;
        const r1 = major ? 76 : 82;
        return (
          <line
            key={i}
            x1={120 + r1 * Math.sin(a)} y1={120 - r1 * Math.cos(a)} x2={120 + 100 * Math.sin(a)} y2={120 - 100 * Math.cos(a)}
            stroke={lit ? color ?? zoneOf(pct) : "rgb(var(--fg) / 0.16)"} strokeWidth={major ? 4.5 : 3.5} strokeLinecap="round"
            style={{ opacity: mode === "scan" ? 0.9 : 1, transition: "stroke .3s" }}
          />
        );
      })}
      <g style={{ transformOrigin: "120px 120px", transform: `rotate(${-90 + (v / 100) * 180}deg)`, transition }}>
        <path d="M117.5 122 L120 46 L122.5 122 Z" fill="var(--text)" />
      </g>
      <circle cx="120" cy="120" r="9" fill="var(--bg-elev)" stroke="var(--text)" strokeWidth="3" />
    </svg>
  );
}
