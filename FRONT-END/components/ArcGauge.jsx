import { useEffect, useState } from "react";

// A thin arc with a bright active segment, small dots at both ends and the value in the centre.
//   value  0-100. Leave it out when there is no score yet: the arc stays empty.
//   mode   "result" | "scan" (the active segment sweeps back and forth) | "idle"
export default function ArcGauge({ value, mode = "result", className = "" }) {
  const has = typeof value === "number";
  const [v, setV] = useState(0);
  useEffect(() => {
    if (mode === "result") { setV(has ? value : 0); return; }
    if (mode === "idle") { setV(0); return; }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(50); return; }
    let raf; const t0 = performance.now();
    const loop = (t) => { setV(50 + 46 * Math.sin(((t - t0) / 1700) * 2 * Math.PI - Math.PI / 2)); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mode, value, has]);
  const a = Math.PI * (1 - v / 100), mx = 120 + 100 * Math.cos(a), my = 120 - 100 * Math.sin(a);
  const arc = "M20 120 A100 100 0 0 1 220 120";
  const show = mode === "scan" || (mode === "result" && has);
  return (
    <svg viewBox="0 0 240 150" className={`w-full max-w-[16rem] ${className}`} role="img" aria-label={has && mode === "result" ? `${Math.round(value)} out of 100` : mode === "scan" ? "Analyzing" : "No score yet"}>
      <defs><linearGradient id="arcGrad" x1="0" x2="1"><stop offset="0" stopColor="#5b8cff" /><stop offset="1" stopColor="var(--accent)" /></linearGradient></defs>
      <path d={arc} fill="none" stroke="rgb(var(--fg) / 0.14)" strokeWidth="3" strokeLinecap="round" />
      <path d={arc} pathLength="100" fill="none" stroke="url(#arcGrad)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${show ? Math.max(v, 0.5) : 0} 100`} style={{ transition: mode === "result" ? "stroke-dasharray 1.1s cubic-bezier(.2,.7,.2,1)" : "none" }} />
      <circle cx="20" cy="120" r="3.5" fill="var(--muted)" /><circle cx="220" cy="120" r="3.5" fill="var(--muted)" />
      {show && <circle cx={mx} cy={my} r="6" fill="var(--text)" stroke="var(--bg-elev)" strokeWidth="2" />}
      <text x="120" y="118" textAnchor="middle" fontSize="42" fontWeight="700" fontFamily="Doto, Inter, monospace" fill={has && mode === "result" ? "var(--text)" : "var(--dim)"}>{has && mode === "result" ? Math.round(value) : "--"}</text>
    </svg>
  );
}
