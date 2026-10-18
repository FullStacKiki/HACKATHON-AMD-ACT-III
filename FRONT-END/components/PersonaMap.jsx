import { useEffect, useRef } from "react";
import { MAP_H, MAP_W, PITCH, STATE_NAMES, getUS } from "../lib/usMap";
import { REACTION } from "../lib/apiShape";

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const ease = (t) => 1 - Math.pow(1 - t, 3);
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// The United States as dots, state by state. Each person of the panel is one bigger dot inside their state, coloured by their
// reaction (would buy / undecided / would not buy); hover a dot to read that person's card.
//   personas  [{ id, state, age, income, politics, reaction, answer?, reason? }] from the API. Without them the map is a neutral base.
//   mode      "idle" | "scan" (a light sweeps over the dots while the analysis runs) | "result"
// The component fills its parent: give it an aspect ratio of about 8 / 5.
export default function PersonaMap({ personas, mode = "idle", label, className = "" }) {
  const host = useRef(null);
  const canvas = useRef(null);
  const live = useRef({});
  live.current.personas = personas;
  live.current.mode = mode;

  useEffect(() => {
    const cv = canvas.current, wrap = host.current, ctx = cv.getContext("2d"), st = live.current;
    const root = getComputedStyle(document.documentElement);
    const css = (n) => root.getPropertyValue(n).trim();
    const fg = css("--fg").split(/\s+/).join(",");
    const col = { buy: css("--lime"), undecided: css("--amber"), no: css("--warn"), text: css("--text"), bg: css("--bg-elev"), muted: css("--muted") };
    const { dots, byState, outline } = getUS();
    const still = reduced();
    let w = 0, h = 0, dpr = 1, raf = 0, hover = null, startAt = performance.now(), prev = st.mode, placed = null, placedFor = null;

    const size = () => { dpr = Math.min(window.devicePixelRatio || 1, 2); w = wrap.clientWidth; h = wrap.clientHeight; cv.width = w * dpr; cv.height = h * dpr; };
    size();
    const ro = new ResizeObserver(size); ro.observe(wrap);
    const move = (e) => { const r = cv.getBoundingClientRect(); hover = { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const leave = () => { hover = null; };
    cv.addEventListener("pointermove", move); cv.addEventListener("pointerleave", leave);

    // Put every person on a free dot of their own state (the same person always lands on the same dot)
    const place = (list) => {
      const used = new Set(), out = [];
      list.forEach((p) => {
        const pool = byState[p.state];
        if (!pool) return;
        let i = hash(p.id) % pool.length, tries = 0;
        while (used.has(pool[i]) && tries++ < pool.length) i = (i + 1) % pool.length;
        used.add(pool[i]);
        out.push({ p, d: dots[pool[i]], idx: out.length });
      });
      return out;
    };

    const wrapText = (text, max) => {
      const words = String(text ?? "").split(" "), lines = []; let cur = "";
      for (const wd of words) { const t = cur ? `${cur} ${wd}` : wd; if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = wd; } else cur = t; }
      if (cur) lines.push(cur);
      return lines.slice(0, 3);
    };

    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      if (st.mode !== prev) { startAt = now; prev = st.mode; }
      if (placedFor !== st.personas) { placedFor = st.personas; placed = Array.isArray(st.personas) ? place(st.personas) : []; startAt = now; }
      const k = Math.min(w / MAP_W, h / MAP_H) * 1.04, ox = (w - MAP_W * k) / 2, oy = (h - MAP_H * k) / 2;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);

      // State borders
      ctx.save(); ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
      ctx.lineWidth = 1 / k; ctx.strokeStyle = `rgba(${fg},0.2)`; ctx.stroke(outline); ctx.restore();

      // Base dots (the land), dim
      const r0 = Math.max(0.9, PITCH * k * 0.3);
      // The state under the pointer: found from the nearest dot, then lit up
      let hs = null;
      if (hover) { let bd = (PITCH * k * 2) ** 2; for (const d of dots) { const dx = ox + d.x * k - hover.x, dy = oy + d.y * k - hover.y, q = dx * dx + dy * dy; if (q < bd) { bd = q; hs = d.st; } } }
      // Depth: the land fades towards the edges of the card, so the map seems lit from the middle
      const lit = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.15, w / 2, h / 2, Math.max(w, h) * 0.62);
      lit.addColorStop(0, `rgba(${fg},0.3)`); lit.addColorStop(1, `rgba(${fg},0.1)`);
      ctx.fillStyle = lit; ctx.beginPath();
      for (const d of dots) { if (d.st === hs) continue; const x = ox + d.x * k, y = oy + d.y * k; ctx.moveTo(x + r0, y); ctx.arc(x, y, r0, 0, 7); }
      ctx.fill();
      if (hs) { ctx.fillStyle = `rgba(${fg},0.62)`; ctx.beginPath(); for (const d of dots) { if (d.st !== hs) continue; const x = ox + d.x * k, y = oy + d.y * k; ctx.moveTo(x + r0 * 1.15, y); ctx.arc(x, y, r0 * 1.15, 0, 7); } ctx.fill(); }
      if (st.mode === "scan" && !still) {
        const phase = ((now / 1800) % 1) * 1.6 - 0.3;
        for (const d of dots) { const a = 0.5 * Math.max(0, 1 - Math.abs(d.x / MAP_W - phase) * 6); if (a < 0.03) continue; ctx.fillStyle = `rgba(${fg},${a.toFixed(2)})`; ctx.beginPath(); ctx.arc(ox + d.x * k, oy + d.y * k, r0, 0, 7); ctx.fill(); }
      }

      // The panel: one coloured dot per person
      let near = null, nd = 144;
      if (st.mode === "result") {
        for (const q of placed) {
          const t = still ? 1 : (now - startAt - q.idx * 8) / 450;
          if (t <= 0) continue;
          const x = ox + q.d.x * k, y = oy + q.d.y * k, c = col[q.p.reaction] || col.muted;
          const r = r0 * 2.3 * ease(Math.min(1, t)) * (t < 1 ? 1 + 0.7 * Math.sin(ease(t) * Math.PI) : 1) * (still ? 1 : 1 + 0.08 * Math.sin(now / 900 + q.idx));
          ctx.globalAlpha = 0.16; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
          const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
          g.addColorStop(0, "rgba(255,255,255,0.9)"); g.addColorStop(0.35, c); g.addColorStop(1, c);
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
          if (hover) { const d2 = (x - hover.x) ** 2 + (y - hover.y) ** 2; if (d2 < nd) { nd = d2; near = { q, x, y }; } }
        }
      }

      // The name of the state under the pointer
      if (hs && !near) {
        ctx.font = "500 12px Inter, sans-serif"; const nm = STATE_NAMES[hs] ?? hs, tw = ctx.measureText(nm).width + 22;
        ctx.fillStyle = col.bg; ctx.strokeStyle = `rgba(${fg},0.22)`; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(14, 14, tw, 28, 14); ctx.fill(); ctx.stroke();
        ctx.fillStyle = col.text; ctx.textAlign = "left"; ctx.fillText(nm, 25, 32);
      }

      // The person's card
      if (near) {
        const { p } = near.q;
        const lines = [`${p.age ?? "?"} · ${p.income ?? "?"} · ${p.politics ?? "?"}`, `${STATE_NAMES[p.state] ?? p.state}`];
        ctx.font = "400 12px Inter, sans-serif";
        const body = [p.answer, p.reason].filter(Boolean).flatMap((t) => wrapText(t, 200)).slice(0, 3);
        const cw = 230, ch = 22 + 17 * (lines.length) + (body.length ? 8 + 16 * body.length : 0) + 14;
        const bx = Math.min(Math.max(near.x - cw / 2, 6), w - cw - 6), by = near.y - ch - 14 < 6 ? near.y + 16 : near.y - ch - 14;
        ctx.fillStyle = col.bg; ctx.strokeStyle = `rgba(${fg},0.22)`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(bx, by, cw, ch, 12); ctx.fill(); ctx.stroke();
        ctx.textAlign = "left";
        ctx.fillStyle = col[p.reaction] || col.muted; ctx.beginPath(); ctx.arc(bx + 16, by + 20, 4, 0, 7); ctx.fill();
        ctx.font = "600 12px Inter, sans-serif"; ctx.fillStyle = col.text; ctx.fillText(REACTION[p.reaction]?.label ?? "Reaction not given", bx + 28, by + 24);
        ctx.font = "400 12px Inter, sans-serif"; ctx.fillStyle = col.muted;
        lines.forEach((l, i) => ctx.fillText(l, bx + 14, by + 44 + i * 17));
        ctx.fillStyle = col.text;
        body.forEach((l, i) => ctx.fillText(l, bx + 14, by + 52 + lines.length * 17 + i * 16));
      }
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); cv.removeEventListener("pointermove", move); cv.removeEventListener("pointerleave", leave); };
  }, []);

  return (
    <div ref={host} className={`relative ${className}`}>
      <canvas ref={canvas} role="img" aria-label={label || "Map of the United States made of dots. Each coloured dot is a person of the panel: green would buy, yellow undecided, red would not buy"} className="absolute inset-0 h-full w-full" style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
