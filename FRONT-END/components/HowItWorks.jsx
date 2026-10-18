import { useEffect, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import TickNeedle from "./TickNeedle";

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const clamp = (n) => Math.max(0, Math.min(1, n));
// The scroll progress at which each step becomes active
const AT = [0.05, 0.4, 0.75];

const STEPS = [
  { n: "01", title: "Describe", body: "Write your idea and who it's for, or upload a PDF and we'll read it for you." },
  { n: "02", title: "Simulate", body: "Hundreds of simulated people, built from real survey respondents, answer as they would." },
  { n: "03", title: "Decide", body: "See who would buy, at what price and why not, with an uncertainty range." },
];

// ---- The three live visuals. Each plays once when `play` turns true (after `delay` ms) -----------------------------------
function useSince(play, delay) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!play) return;
    if (reduced()) { setOn(true); return; }
    const t = setTimeout(() => setOn(true), delay);
    return () => clearTimeout(t);
  }, [play, delay]);
  return on;
}

const IDEA = "An app that connects students with local home cooks";

function Describe({ play, delay }) {
  const on = useSince(play, delay);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    if (reduced()) { setN(IDEA.length); return; }
    const t = setInterval(() => setN((c) => (c >= IDEA.length ? c : c + 1)), 42);
    return () => clearInterval(t);
  }, [on]);
  return (
    <div className="flex h-full flex-col justify-between gap-3">
      <div className="rounded-xl border border-white/15 bg-black/30 p-3 text-sm leading-snug text-zinc-200">
        <span className="text-zinc-500">{n === 0 ? "Describe your idea…" : ""}</span>
        {IDEA.slice(0, n)}
        <span className={`ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-accent ${n < IDEA.length ? "" : "animate-pulse"}`} aria-hidden />
      </div>
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-zinc-300"><FileUp size={13} aria-hidden /> Upload a PDF</span>
    </div>
  );
}

const COLS = 14, ROWS = 6;
// Which answer each dot gets: a fixed pattern, so the picture is the same every time
const ANSWERS = Array.from({ length: COLS * ROWS }, (_, i) => { const v = (i * 37 + 11) % 100; return v < 42 ? "var(--lime)" : v < 72 ? "var(--amber)" : "var(--warn)"; });

function Simulate({ play, delay }) {
  const on = useSince(play, delay);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    if (reduced()) { setN(COLS * ROWS); return; }
    const t = setInterval(() => setN((c) => (c >= COLS * ROWS ? c : c + 1)), 28);
    return () => clearInterval(t);
  }, [on]);
  return (
    <div className="grid h-full content-center gap-2" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }} role="img" aria-label="A grid of simulated people, each dot coloured by its answer">
      {ANSWERS.map((c, i) => <span key={i} className="mx-auto aspect-square w-full max-w-[0.7rem] rounded-full transition-colors duration-300" style={{ background: i < n ? c : "rgb(var(--fg) / 0.12)" }} />)}
    </div>
  );
}

function Decide({ play, delay }) {
  const on = useSince(play, delay);
  return (
    <div className="grid h-full grid-cols-2 items-center gap-3">
      <TickNeedle value={on ? 64 : 0} mode="result" className="max-w-[9rem]" />
      <svg viewBox="0 0 120 80" className="w-full" role="img" aria-label="A demand curve that falls as the price rises">
        <line x1="4" x2="116" y1="74" y2="74" stroke="rgb(var(--fg) / 0.2)" strokeDasharray="2 4" />
        <path d="M6 12 C34 14 52 30 66 44 S98 64 114 68" pathLength="1" fill="none" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round" style={{ strokeDasharray: 1, strokeDashoffset: on ? 0 : 1, transition: reduced() ? "none" : "stroke-dashoffset 1.6s ease-out" }} />
        <circle cx="66" cy="44" r="4" fill="var(--accent)" style={{ opacity: on ? 1 : 0, transition: reduced() ? "none" : "opacity .4s 1.1s" }} />
      </svg>
    </div>
  );
}

const VISUALS = [Describe, Simulate, Decide];

export default function HowItWorks() {
  const box = useRef(null);
  const [auto, setAuto] = useState(0);     // the step that matches the scroll position
  const [picked, setPicked] = useState(null); // a step chosen by hand wins over the scroll
  const active = picked ?? auto;

  // Scrolling through the section moves the highlight from step to step
  useEffect(() => {
    if (reduced()) { setAuto(2); return; }
    let raf = 0;
    const run = () => { raf = 0; const r = box.current.getBoundingClientRect(), vh = window.innerHeight; const p = clamp((0.75 * vh - r.top) / (r.height + 0.1 * vh)); setAuto(p < 0.4 ? 0 : p < 0.7 ? 1 : 2); };
    const on = () => { if (!raf) raf = requestAnimationFrame(run); };
    run(); window.addEventListener("scroll", on, { passive: true }); window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); if (raf) cancelAnimationFrame(raf); };
  }, []);

  const Visual = VISUALS[active];
  return (
    <section id="how-it-works" ref={box} className="scroll-mt-8 px-5 py-24 md:px-10 md:py-32">
      <div className="mx-auto max-w-[88rem]">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="label">Process</p>
            <h2 className="mt-4 font-display text-[clamp(2.6rem,6.4vw,5.8rem)] leading-[0.95] tracking-tight">How it works</h2>
            <p className="mt-4 text-base text-zinc-400 md:text-lg">Three steps, a few minutes</p>
          </div>
          <ol className="lg:col-span-7">
            {STEPS.map((s, i) => (
              <li key={s.n} className="border-t border-white/15">
                <button type="button" onClick={() => setPicked(i)} onMouseEnter={() => setPicked(i)} aria-current={active === i} className="group grid w-full grid-cols-[3rem_1fr_auto] items-baseline gap-x-4 gap-y-1 py-6 text-left">
                  <span className={`num text-sm transition-colors ${active === i ? "text-accent" : "text-zinc-500"}`}>{s.n}</span>
                  <span className={`font-display text-4xl transition-colors md:text-5xl ${active === i ? "text-zinc-50" : "text-zinc-500 group-hover:text-zinc-300"}`}>{s.title}</span>
                  <ArrowUpRight size={22} className={`transition-all ${active === i ? "translate-x-0 text-accent opacity-100" : "-translate-x-1 text-zinc-600 opacity-60 group-hover:translate-x-0"}`} aria-hidden />
                  <span className={`col-start-2 max-w-md text-base leading-relaxed transition-colors ${active === i ? "text-zinc-300" : "text-zinc-500"}`}>{s.body}</span>
                </button>
              </li>
            ))}
            <li className="border-t border-white/15" aria-hidden />
          </ol>
        </div>

        {/* The big band: the step in play, and its live picture */}
        <div className="mt-14 grid items-center gap-8 rounded-[26px] bg-accent p-6 text-[#0b0d02] md:p-10 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <p className="font-display text-[clamp(1.9rem,4.4vw,4rem)] leading-none tracking-tight">{STEPS.map((s, i) => <span key={s.n} className={i === active ? "" : "opacity-35"}>{s.title}{i < 2 ? " \u2192 " : ""}</span>)}</p>
            <p className="mt-4 text-sm font-medium opacity-70">Step {STEPS[active].n} of 03 &middot; a few minutes in all</p>
          </div>
          <div className="lg:col-span-6">
            <div key={active} className="page-in h-44 rounded-[22px] bg-[#0b0b0c] p-4 text-zinc-100 md:h-52"><Visual play delay={0} /></div>
          </div>
        </div>
      </div>
    </section>
  );
}
