import { useEffect, useRef } from "react";
import { LAT_BOTTOM, LAT_TOP, STEP, getWorldDots } from "../lib/worldDots";

// A small dot-matrix world map. The United States is lit (the panel is made of US consumers); the rest of the world is grey.
export default function WorldMini({ className = "" }) {
  const host = useRef(null), canvas = useRef(null);
  useEffect(() => {
    const cv = canvas.current, wrap = host.current, ctx = cv.getContext("2d");
    const root = getComputedStyle(document.documentElement);
    const fg = root.getPropertyValue("--fg").trim().split(/\s+/).join(","), accent = root.getPropertyValue("--accent").trim();
    const dots = getWorldDots();
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, dpr = 1, raf = 0;
    const size = () => { dpr = Math.min(window.devicePixelRatio || 1, 2); w = wrap.clientWidth; h = wrap.clientHeight; cv.width = w * dpr; cv.height = h * dpr; };
    size(); const ro = new ResizeObserver(size); ro.observe(wrap);
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      const k = Math.min(w / 360, h / (LAT_TOP - LAT_BOTTOM + STEP)), ox = (w - 360 * k) / 2, oy = (h - (LAT_TOP - LAT_BOTTOM) * k) / 2, r = Math.max(0.9, STEP * k * 0.32);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = `rgba(${fg},0.2)`; ctx.beginPath();
      for (const d of dots) if (!d.us) { const x = ox + (d.lon + 180) * k, y = oy + (LAT_TOP - d.lat) * k; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 7); }
      ctx.fill();
      const pulse = still ? 1 : 1 + 0.18 * Math.sin(now / 700);
      ctx.fillStyle = accent; ctx.beginPath();
      for (const d of dots) if (d.us) { const x = ox + (d.lon + 180) * k, y = oy + (LAT_TOP - d.lat) * k; ctx.moveTo(x + r * 1.25 * pulse, y); ctx.arc(x, y, r * 1.25 * pulse, 0, 7); }
      ctx.fill();
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <div ref={host} className={`relative ${className}`}><canvas ref={canvas} role="img" aria-label="World map of dots. The United States is highlighted: the panel is made of US consumers. The rest of the world has no panel data." className="h-full w-full" style={{ width: "100%", height: "100%" }} /></div>;
}
