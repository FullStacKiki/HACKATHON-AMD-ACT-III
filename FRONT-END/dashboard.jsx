// IdeaIntake.jsx
// Setup: Tailwind CSS enabled, no extra packages.
// Usage: <IdeaIntake score={overallScoreFromApi} onDone={({ idea, score, sources }) => showResults(...)} />
// While processing the needle sweeps back and forth; when finished it settles on `score` (0-100).
//
// Right now the processing is simulated with a timeline (STEPS below).
// To wire the real backend: send the idea to your API, and each time it reports
// "source X responded" or "progress N%", call setTarget(N) and activate(sourceIndex).
import { memo, useEffect, useMemo, useRef, useState } from "react";

// ---------- Dot map ----------
const W = 800, H = 306; // true map proportions (350 degrees of longitude by 134 of latitude)
const px = (lon) => ((lon + 170) / 350) * W;
const py = (lat) => ((78 - lat) / 134) * H;

// Continent outlines as [lon, lat] rings (extra rings are islands). Order matters: first match wins.
const REGIONS = {
  "North America": [[[-166,64],[-163,69],[-156,71],[-141,69.5],[-128,70],[-115,68],[-96,68],[-94,62],[-94,59],[-92,57],[-85,55],[-82,52],[-80,51.5],[-79,55],[-77,60],[-78,62],[-72,61],[-65,60],[-62,57],[-56,52],[-59,48],[-64,49],[-66,45],[-70,43],[-74,40],[-76,37],[-76,35],[-81,31],[-80,26],[-81.5,25.5],[-83,29],[-85,30],[-89,30],[-94,29],[-97,26],[-98,22],[-96,19],[-91,19],[-90,21],[-87,21],[-88,16],[-84,15],[-83,10],[-79,9],[-78,8],[-80,7.5],[-84,9],[-87,13],[-92,14],[-96,16],[-105,20],[-106,23],[-110,25],[-111,27],[-113,30],[-115,32],[-117,32],[-121,35],[-124,40],[-124,46],[-124,48],[-128,51],[-133,56],[-138,59],[-146,61],[-152,59],[-158,57],[-163,55],[-158,58],[-162,60],[-165,62]],[[-73,78],[-60,82],[-30,83],[-20,80],[-20,72],[-24,69],[-32,68],[-42,60],[-50,62],[-54,67],[-58,75],[-66,76]],[[-85,22],[-79,23],[-74,20],[-77,19.5],[-82,22]]],
  "South America": [[[-78,8],[-77,10],[-72,12],[-67,11],[-62,10.5],[-60,8],[-57,6],[-52,5],[-50,0],[-48,-1],[-44,-2.5],[-38,-4],[-35,-6],[-35,-9],[-39,-14],[-39,-18],[-41,-22],[-44,-23],[-48,-26],[-49,-29],[-53,-34],[-57,-36],[-57,-39],[-62,-39],[-65,-42],[-67,-46],[-69,-51],[-68,-55],[-72,-54],[-75,-50],[-74,-44],[-73,-38],[-71,-30],[-70,-23],[-70,-18],[-76,-14],[-80,-7],[-81,-4],[-80,-1],[-78,2],[-77,4]]],
  "Europe": [[[-9,37],[-9,43],[-2,43.5],[-1,46],[-4,48],[2,51],[5,53],[8,54],[9,57],[11,54],[14,54],[19,54.5],[21,57],[24,59],[30,60],[34,65],[40,67],[45,68],[60,69],[60,55],[50,50],[48,46],[44,45],[40,46],[38,47],[34,46],[30,46],[28,44],[28,42],[26,41],[24,40.5],[23,38],[22,37],[21,38],[20,40],[19,42],[14,45],[12.5,44.5],[14,42],[16,41],[18,40.3],[16,38],[15,40],[12,42],[10,44],[7,43.5],[3,43],[0,39],[-2,37],[-5,36]],[[5,59],[5,62],[10,64],[14,68],[18,70],[25,71],[30,70],[30,66],[30,62],[30,60],[24,60],[22,61],[21,63],[25,65],[22,66],[18,63],[17,60],[19,59],[16,56],[13,55.5],[11,58],[8,58]],[[-5,50],[1,51],[2,53],[0,54],[-2,56],[-2,58],[-5,59],[-6,57],[-5,55],[-3,54],[-5,52]],[[-10,52],[-6,52],[-6,55],[-8,55],[-10,54]],[[-24,64],[-14,64],[-14,66],[-22,66]]],
  "Africa": [[[-17,21],[-16,24],[-13,28],[-10,30],[-9,33],[-6,36],[0,36],[10,37],[11,34],[15,32],[20,31],[25,32],[32,31],[34,28],[33,29],[35,24],[37,20],[39,16],[43,12],[51,12],[51,10],[48,5],[42,-1],[40,-5],[39,-8],[40,-11],[41,-15],[36,-19],[35,-24],[32,-26],[32,-29],[28,-33],[24,-34],[20,-35],[18,-33],[16,-28],[14,-22],[12,-16],[13,-11],[12,-6],[9,-1],[10,3],[9,4],[5,6],[2,6],[-2,5],[-8,4.5],[-12,7],[-15,11],[-17,14]],[[44,-25],[47,-25],[50,-15],[49,-12],[44,-17]]],
  "Asia": [[[26,40],[26,37],[30,36],[36,36],[36,33],[35,30],[35,28],[38,24],[41,17],[43,13],[45,13],[52,16],[56,18],[59,22],[56,26],[51,24],[50,27],[48,29],[50,30],[56,27],[58,25],[62,25],[66,25],[68,23],[72,21],[73,16],[76,9],[78,8],[80,11],[80,15],[85,20],[88,22],[91,22],[94,17],[98,16],[98,10],[100,7],[103,2],[104,1.5],[103,5],[100,13],[102,12],[105,9],[108,11],[109,15],[106,20],[108,22],[112,22],[117,24],[121,28],[122,31],[120,35],[119,38],[122,40],[125,40],[126,37],[127,35],[129,35.5],[129,40],[132,43],[135,44],[140,49],[141,53],[137,54],[143,59],[150,59],[156,57],[162,57],[163,60],[170,60],[178,63],[180,67],[170,70],[160,70],[145,72],[130,71],[113,74],[100,77],[90,75],[80,73],[70,73],[65,69],[60,69],[60,55],[50,50],[48,46],[45,44],[40,44],[37,45],[41,41],[36,41],[32,42],[29,41]],[[130,31],[132,34],[135,34],[140,35],[141,38],[142,40],[141,41.5],[140,40],[139,38],[136,37],[133,35],[131,34]],[[140,42],[142,43],[145,43.5],[142,45.5],[140,43.5]],[[95,5],[98,4],[104,-2],[106,-6],[102,-4],[96,2]],[[105,-6],[114,-7],[114,-8.5],[106,-7.5]],[[109,2],[112,3],[117,7],[119,5],[116,-3],[111,-3.5],[109,-1]],[[120,18],[122,18],[124,12],[126,7],[122,7],[121,14]]],
  "Oceania": [[[114,-22],[114,-26],[115,-34],[118,-35],[124,-33.5],[131,-31.5],[135,-35],[138,-35],[140,-38],[146,-39],[150,-37],[153,-31],[153,-25],[146,-19],[145,-15],[142,-11],[141,-17],[136,-12],[131,-11],[129,-15],[125,-14],[122,-18]],[[131,-1],[138,-2],[145,-5],[150,-10],[142,-9],[138,-8],[132,-4]],[[173,-35],[178,-38],[175,-41],[173,-39]],[[172,-41],[174,-42],[170,-46.5],[167,-46],[171,-43]]],
};
// Seas that sit inside the outlines above (Black Sea, Caspian Sea), left empty.
const WATER = [[[28,42],[28,45],[33,46],[38,47],[41,43],[41,41],[35,41.5]],[[47,45],[51,47],[54,45],[54,41],[54,37],[50,37],[49,40],[47,43]]];

const inRing = (lon, lat, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

// Built once: every grid point that falls on land becomes a dot.
const DOTS = [];
for (let lat = 76; lat > -56; lat -= 3)
  for (let lon = -168; lon < 178; lon += 3) {
    if (WATER.some((w) => inRing(lon, lat, w))) continue;
    for (const [name, rings] of Object.entries(REGIONS))
      if (rings.some((r) => inRing(lon, lat, r))) {
        DOTS.push({ x: px(lon), y: py(lat), region: name, k: ["fA", "fB", "fC"][Math.floor(Math.random() * 3)], dur: 350 + Math.random() * 750, del: -Math.random() * 1100 });
        break;
      }
  }

// ---------- Data sources and the simulated timeline ----------
// `score` = how positive the feedback from that source is (0-100). Your API should return it per source.
const SOURCES = [
  { name: "World Bank", region: "North America", lon: -77, lat: 39, score: 70 },
  { name: "Eurostat", region: "Europe", lon: 6, lat: 50, score: 58 },
  { name: "Failory post-mortems", region: "Europe", lon: 24, lat: 59, score: 35 },
  { name: "African Development Bank", region: "Africa", lon: -4, lat: 5, score: 48 },
  { name: "Asian Development Bank", region: "Asia", lon: 121, lat: 14, score: 74 },
  { name: "IBGE (Brazil)", region: "South America", lon: -47, lat: -15, score: 52 },
  { name: "Australian Bureau of Statistics", region: "Oceania", lon: 149, lat: -35, score: 66 },
  { name: "Google Trends", region: "North America", lon: -122, lat: 37, score: 81 },
];

const STEPS = [
  { at: 500, p: 8, label: "Reading your idea" },
  { at: 1500, p: 20, label: "Checking the concept", src: 0 },
  { at: 2500, p: 31, label: "Mapping the workflow", src: 1 },
  { at: 3400, p: 42, label: "Reviewing strategy", src: 2 },
  { at: 4300, p: 53, label: "Comparing similar features", src: 7 },
  { at: 5200, p: 64, label: "Looking for risks in Africa", src: 3 },
  { at: 6100, p: 74, label: "Looking for risks in Asia", src: 4 },
  { at: 7000, p: 84, label: "Testing success metrics", src: 5 },
  { at: 7900, p: 93, label: "Cross-checking regional data", src: 6 },
  { at: 8800, p: 100, label: "Analysis complete" },
];

const EXAMPLES = [
  "A mobile app that connects students with local home cooks for affordable weekly meals",
  "A subscription service that repairs and resells used school laptops",
  "An AI study buddy that turns lecture recordings into practice quizzes",
];

const IDLE = "#cfd8de";
// Same three ranges as the speedometer: red (negative), yellow (mixed), green (positive).
const colorOf = (n) => (n < 33.3 ? "#d64545" : n < 66.6 ? "#e8b422" : "#2f9e5b");
const AVG_SCORE = Math.round(SOURCES.reduce((a, x) => a + x.score, 0) / SOURCES.length);

// mode: "idle" (grey) | "scan" (every dot flickers red/yellow/green on its own random rhythm)
//       | "result" (flicker stops, dots settle on the feedback color of their nearest source)
const DotMap = memo(function DotMap({ mode, pulses }) {
  const final = useMemo(
    () => DOTS.map((d) => {
      let best = null, bd = Infinity;
      SOURCES.forEach((s) => {
        if (s.region !== d.region) return;
        const dd = Math.hypot(d.x - px(s.lon), d.y - py(s.lat));
        if (dd < bd) { bd = dd; best = s; }
      });
      return { color: best ? colorOf(best.score) : IDLE, wave: best ? bd * 8 : 0 };
    }),
    []
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={mode === "result" ? "World map colored by feedback from each region" : "Dot map of the world"}>
      {DOTS.map((d, i) => (
        <circle
          key={i} cx={d.x} cy={d.y} className="flick"
          r={mode === "idle" ? 2.6 : 2.8}
          style={
            mode === "scan" ? { fill: IDLE, animation: `${d.k} ${d.dur}ms steps(1) ${d.del}ms infinite` }
            : mode === "result" ? { fill: final[i].color, animation: `reveal 700ms ease-out ${final[i].wave}ms backwards` }
            : { fill: IDLE }
          }
        />
      ))}
      {pulses.map((p) => (
        <circle key={p.id} cx={p.x} cy={p.y} r="4" fill="none" stroke={p.color} strokeWidth="2" className="ripple" />
      ))}
    </svg>
  );
});

// Three frames on the speedometer, low to high: red, yellow, green.
const ZONES = [
  { from: 0, to: 33.3, color: "#d64545" },
  { from: 33.3, to: 66.6, color: "#e8b422" },
  { from: 66.6, to: 100, color: "#2f9e5b" },
];
const arcPoint = (pct, r = 90) => {
  const a = ((-90 + (pct / 100) * 180) * Math.PI) / 180;
  return `${(120 + r * Math.sin(a)).toFixed(2)} ${(120 - r * Math.cos(a)).toFixed(2)}`;
};

const verdict = (n) => (n < 33.3 ? "At risk" : n < 66.6 ? "Needs work" : "Strong");

// While the idea is processed the needle sweeps back and forth; when the analysis
// finishes it springs to the final score. mode: "idle" | "scan" | "result"
function Gauge({ mode, score }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (mode === "result") { setV(score); return; }
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
  }, [mode, score]);

  const zoneColor = (ZONES.find((z) => score <= z.to) || ZONES[2]).color;
  const transition = mode === "result" ? "transform 1100ms cubic-bezier(.25,1.5,.5,1)" : mode === "idle" ? "transform 500ms ease-out" : "none";
  const label = mode === "result" ? `Viability score ${Math.round(score)} out of 100` : mode === "scan" ? "Analyzing your idea" : "Speedometer ready";
  return (
    <svg viewBox="0 0 240 150" className="w-full max-w-xs" role="img" aria-label={label}>
      {ZONES.map((z) => {
        const active = mode === "result" && score >= z.from && score <= z.to;
        return (
          <path
            key={z.color}
            d={`M${arcPoint(z.from + 0.8)} A90 90 0 0 1 ${arcPoint(z.to - 0.8)}`}
            fill="none" stroke={z.color} strokeWidth="14"
            style={{ opacity: mode === "idle" ? 0.28 : mode === "result" && !active ? 0.35 : 1, transition: "opacity 400ms" }}
          />
        );
      })}
      {Array.from({ length: 11 }, (_, i) => {
        const a = ((-90 + i * 18) * Math.PI) / 180;
        return <line key={i} x1={120 + 72 * Math.sin(a)} y1={120 - 72 * Math.cos(a)} x2={120 + 80 * Math.sin(a)} y2={120 - 80 * Math.cos(a)} stroke="#64748b" strokeWidth={i % 5 === 0 ? 2.5 : 1.2} />;
      })}
      <g style={{ transformOrigin: "120px 120px", transform: `rotate(${-90 + (v / 100) * 180}deg)`, transition }}>
        <path d="M117 120 L120 46 L123 120 Z" fill="#14212b" />
      </g>
      <circle cx="120" cy="120" r="8" fill="#14212b" />
      <text x="120" y="146" textAnchor="middle" fontSize={mode === "result" ? 22 : 14} fontWeight="800" fill={mode === "result" ? zoneColor : "#475569"}>
        {mode === "result" ? Math.round(score) : mode === "scan" ? "Analyzing…" : "Ready"}
      </text>
    </svg>
  );
}

export default function IdeaIntake({ onDone, score }) {
  const finalScore = score ?? AVG_SCORE; // pass your API's overall score, or leave it out to use the source average
  const [idea, setIdea] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | running | done
  const [label, setLabel] = useState("");
  const [log, setLog] = useState([]);
  const [pulses, setPulses] = useState([]);
  const timers = useRef([]);

  const activate = (i) => {
    const s = SOURCES[i];
    setLog((l) => [...l, i]);
    setPulses((p) => [...p, { id: `${i}-${Date.now()}`, x: px(s.lon), y: py(s.lat), color: "#0f6b73" }]);
  };

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPhase("idle"); setLabel(""); setLog([]); setPulses([]);
  };

  const start = (e) => {
    e?.preventDefault();
    if (!idea.trim() || phase === "running") return;
    reset();
    setPhase("running");
    STEPS.forEach((s) =>
      timers.current.push(setTimeout(() => {
        setLabel(s.label);
        if (s.src != null) activate(s.src);
        if (s.p === 100) setPhase("done");
      }, s.at))
    );
  };

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const running = phase === "running";
  const sources = useMemo(() => log.map((i) => SOURCES[i]), [log]);

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900" style={{ fontFamily: "'Schibsted Grotesk', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&display=swap');
        .ripple{transform-box:fill-box;transform-origin:center;animation:ripple 1.6s ease-out forwards}
        @keyframes ripple{from{transform:scale(1);opacity:.9}to{transform:scale(9);opacity:0}}
        @keyframes fA{0%{fill:#d64545}33%{fill:#e8b422}66%{fill:#2f9e5b}}
        @keyframes fB{0%{fill:#2f9e5b}33%{fill:#d64545}66%{fill:#e8b422}}
        @keyframes fC{0%{fill:#e8b422}33%{fill:#2f9e5b}66%{fill:#d64545}}
        @keyframes reveal{0%{fill:#cfd8de;r:2.6}55%{r:4.6}100%{r:2.8}}
        @media (prefers-reduced-motion:reduce){.ripple{animation:none;opacity:0}.flick{animation:none!important}}
      `}</style>

      <div className="mx-auto max-w-5xl space-y-6">
        <header className="text-center">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">What's your business idea?</h1>
          <p className="mt-2 text-slate-600">Describe it in a few sentences. We'll check it against open data from around the world.</p>
        </header>

        {/* Type bar */}
        <form onSubmit={start} className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-teal-700">
            <label htmlFor="idea" className="sr-only">Your business idea</label>
            <textarea
              id="idea" rows={2} value={idea} disabled={phase !== "idle"}
              onChange={(e) => setIdea(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) start(e); }}
              placeholder="Example: An app that connects students with local home cooks..."
              className="flex-1 resize-none bg-transparent p-2 text-base outline-none disabled:text-slate-500"
            />
            {phase === "idle" && (
              <button type="submit" disabled={!idea.trim()} className="rounded-lg bg-teal-800 px-5 py-2.5 font-semibold text-white hover:bg-teal-900 disabled:bg-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2">
                Analyze idea
              </button>
            )}
            {running && (
              <button type="button" onClick={reset} className="rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
            )}
          </div>
          {phase === "idle" && (
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" onClick={() => setIdea(ex)} className="rounded-full bg-white px-3 py-1.5 text-sm text-slate-700 ring-1 ring-slate-200 hover:ring-teal-700">
                  {ex.length > 46 ? ex.slice(0, 46) + "…" : ex}
                </button>
              ))}
            </div>
          )}
        </form>

        {/* Gauge + map */}
        <section className="grid gap-6 rounded-xl bg-white p-5 shadow-sm md:grid-cols-5">
          <div className="flex flex-col items-center md:col-span-2">
            <Gauge mode={running ? "scan" : phase === "done" ? "result" : "idle"} score={finalScore} />
            <p className="mt-1 min-h-[1.5rem] text-center font-semibold text-slate-800" aria-live="polite">
              {phase === "done" ? `${verdict(finalScore)}: your idea scores ${finalScore} out of 100` : label || "Waiting for your idea"}
            </p>
            {phase === "done" && (
              <div className="mt-4 flex gap-2">
                <button onClick={() => onDone?.({ idea, score: finalScore, sources: SOURCES })} className="rounded-lg bg-teal-800 px-5 py-2.5 font-semibold text-white hover:bg-teal-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2">
                  View results
                </button>
                <button onClick={reset} className="rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50">
                  Start over
                </button>
              </div>
            )}
            <ul className="mt-5 w-full space-y-1.5 text-sm" aria-label="Data sources that have responded">
              {sources.length === 0 && <li className="text-slate-500">Data sources will appear here as they respond.</li>}
              {sources.map((s, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: phase === "done" ? colorOf(s.score) : "#94a3b8" }} />
                  <span className="font-medium">{s.name}</span>
                  <span className="text-slate-500">{s.region}</span>
                  <span className="ml-auto font-semibold" style={{ color: phase === "done" ? colorOf(s.score) : "#64748b" }}>{phase === "done" ? s.score : "received"}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-3">
            <DotMap mode={running ? "scan" : phase === "done" ? "result" : "idle"} pulses={pulses} />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              <span className="font-medium text-slate-700">Feedback from each region:</span>
              {[["Negative", 20], ["Mixed", 50], ["Positive", 80]].map(([n, v]) => (
                <span key={n} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(v) }} />
                  {n}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: IDLE }} />
                No data yet
              </span>
            </div>
          </div>
        </section>

        <p className="text-center text-xs text-slate-500">Decision support based on open data, not a guarantee of success.</p>
      </div>
    </div>
  );
}
