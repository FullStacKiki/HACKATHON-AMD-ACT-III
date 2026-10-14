// ResultsDashboard.jsx
// Setup: npm i recharts  |  Tailwind CSS must be enabled in your project.
// Usage: <ResultsDashboard idea={...} baseScore={61} sources={[...]} onRestart={() => ...} />
// Every prop is optional; without them it shows the built-in mock data.
// Colors use the same ranges as the speedometer: red 0-33, yellow 33-66, green 66-100.
import { useState } from "react";
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
} from "recharts";

// ---- Mock data: matches the agreed API contract. Each fix has an estimated `gain`. ----
const MOCK = {
  idea: "A mobile app that connects students with local home cooks for affordable weekly meals.",
  dimensions: [
    {
      name: "Concept", score: 72,
      summary: "Clear problem and audience. Differentiation from delivery apps is thin.",
      flaws: ["Value over existing food-delivery apps is not obvious", "Home-cooking regulations vary by region"],
      fixes: [
        { text: "Position around weekly subscriptions, not one-off orders", gain: 6 },
        { text: "Launch in one city with clear home-kitchen rules", gain: 4 },
      ],
      sources: [{ title: "Home food business regulations overview", url: "https://example.com/a" }],
    },
    {
      name: "Workflow", score: 55,
      summary: "Ordering flow is simple, but cook onboarding and quality checks are undefined.",
      flaws: ["No process to verify cooks", "Pickup vs. delivery logistics unclear"],
      fixes: [
        { text: "Add a 3-step cook verification (ID, kitchen photos, tasting)", gain: 9 },
        { text: "Use campus pickup points instead of delivery", gain: 7 },
      ],
      sources: [{ title: "Marketplace trust and safety patterns", url: "https://example.com/b" }],
    },
    {
      name: "Strategy", score: 48,
      summary: "Go-to-market relies on word of mouth. Two-sided marketplaces need a supply-first plan.",
      flaws: ["Chicken-and-egg problem between cooks and students", "No pricing model beyond a vague commission"],
      fixes: [
        { text: "Recruit 20 cooks first, then open to students", gain: 10 },
        { text: "Start with a flat 12% commission and test it", gain: 5 },
      ],
      sources: [{ title: "Why marketplaces fail: post-mortems", url: "https://example.com/c" }],
    },
    {
      name: "Features", score: 68,
      summary: "Core features are sensible. Some planned extras add cost without proven demand.",
      flaws: ["Live order tracking is expensive for an MVP", "No allergen filtering"],
      fixes: [
        { text: "Replace live tracking with status updates", gain: 4 },
        { text: "Add allergen and diet tags to every meal", gain: 6 },
      ],
      sources: [],
    },
    {
      name: "Risks", score: 28,
      summary: "Food safety and liability are the biggest threats and are not addressed.",
      flaws: ["Food safety liability", "Cook cancellations leave students without meals", "Payment fraud"],
      fixes: [
        { text: "Require food-handling certification and add insurance", gain: 14 },
        { text: "Keep a backup-cook pool per area", gain: 8 },
      ],
      sources: [{ title: "Food safety rules for small sellers", url: "https://example.com/d" }],
    },
    {
      name: "Metrics", score: 58,
      summary: "Goals exist but are not measurable yet.",
      flaws: ["No target for repeat-order rate", "No cost-per-acquisition estimate"],
      fixes: [
        { text: "Track weekly repeat-order rate (target: 40%)", gain: 7 },
        { text: "Measure cost per new student and cook", gain: 5 },
      ],
      sources: [],
    },
  ],
  alternative_ideas: [
    "Meal-prep swaps among students inside one dorm",
    "Subscription meal boxes from licensed community kitchens",
  ],
};

// ---- Helpers ----
const tone = (s) =>
  s >= 66.6
    ? { c: "#2f7d4f", bg: "#e6f2ea", label: "Strong" }
    : s >= 33.3
    ? { c: "#a86a0c", bg: "#fbf0dc", label: "Needs work" }
    : { c: "#b23a3a", bg: "#f9e5e5", label: "At risk" };

const clamp = (n) => Math.min(100, Math.round(n));

function ScorePill({ score }) {
  const t = tone(score);
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold"
      style={{ color: t.c, background: t.bg }}
    >
      {score}
      <span className="font-medium opacity-80">{t.label}</span>
    </span>
  );
}

function DimensionCard({ dim, score, applied, onToggle, open, setOpen }) {
  const t = tone(score);
  const gained = score - dim.score;
  return (
    <div className="rounded-lg border border-slate-200 bg-white" style={{ borderLeft: `6px solid ${t.c}` }}>
      <button
        onClick={setOpen}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
      >
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{dim.name}</h3>
          <p className="mt-0.5 text-sm text-slate-600">{dim.summary}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {gained > 0 && <span className="text-sm font-semibold text-emerald-700">+{gained}</span>}
          <ScorePill score={score} />
          <span className="text-slate-400" aria-hidden>{open ? "−" : "+"}</span>
        </div>
      </button>

      {open && (
        <div className="grid gap-5 border-t border-slate-100 p-4 md:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">What's weak</h4>
            <ul className="space-y-2 text-sm text-slate-700">
              {dim.flaws.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tone(0).c }} />
                  {f}
                </li>
              ))}
            </ul>
            {dim.sources.length > 0 && (
              <div className="mt-4">
                <h4 className="mb-1 text-sm font-semibold text-slate-800">Evidence</h4>
                {dim.sources.map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="block text-sm text-teal-800 underline">
                    {s.title}
                  </a>
                ))}
              </div>
            )}
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-800">How to improve it</h4>
            <ul className="space-y-2">
              {dim.fixes.map((fx) => {
                const on = applied.has(fx.text);
                return (
                  <li key={fx.text} className="flex items-start justify-between gap-3 rounded-md bg-slate-50 p-3 text-sm text-slate-800">
                    <span>{fx.text}</span>
                    <button
                      onClick={() => onToggle(fx.text)}
                      className={`shrink-0 rounded-md px-3 py-1 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 ${
                        on ? "bg-teal-800 text-white" : "border border-teal-800 text-teal-800 hover:bg-teal-50"
                      }`}
                    >
                      {on ? `Applied (+${fx.gain})` : `Apply fix (+${fx.gain})`}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ResultsDashboard({ data = MOCK, idea, baseScore, sources, onRestart }) {
  const [applied, setApplied] = useState(new Set());
  const [openIdx, setOpenIdx] = useState(4); // lowest score opens first

  const toggle = (text) =>
    setApplied((prev) => {
      const next = new Set(prev);
      next.has(text) ? next.delete(text) : next.add(text);
      return next;
    });

  const scored = data.dimensions.map((d) => ({
    ...d,
    now: clamp(d.score + d.fixes.filter((f) => applied.has(f.text)).reduce((a, f) => a + f.gain, 0)),
  }));
  const avg = (key) => Math.round(scored.reduce((a, d) => a + d[key], 0) / scored.length);
  const shift = avg("now") - avg("score"); // gain from the fixes the user applied
  const before = Math.round(baseScore ?? avg("score"));
  const after = clamp(before + shift);
  const t = tone(after);

  const chartData = scored.map((d) => ({ dim: d.name, Before: d.score, Now: d.now }));
  const weakest = [...scored].sort((a, b) => a.now - b.now).slice(0, 3);

  return (
    <div
      className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900"
      style={{ fontFamily: "'Schibsted Grotesk', system-ui, sans-serif" }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&display=swap');`}</style>

      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <h1 className="text-3xl font-extrabold tracking-tight">Your idea, assessed</h1>
          <p className="mt-2 max-w-2xl text-slate-600">{idea ?? data.idea}</p>
        </header>

        {/* Hero: score + radar */}
        <section className="grid gap-6 rounded-xl bg-white p-5 shadow-sm md:grid-cols-5">
          <div className="flex flex-col justify-center md:col-span-2">
            <p className="text-sm font-medium text-slate-500">Overall viability</p>
            <div className="flex items-end gap-3">
              <span className="text-7xl font-extrabold leading-none" style={{ color: t.c }}>{after}</span>
              <span className="pb-2 text-xl text-slate-400">/ 100</span>
            </div>
            <p className="mt-2 text-sm font-semibold" style={{ color: t.c }}>{t.label}</p>
            {after !== before && (
              <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Up from {before} before your changes (+{after - before}).
              </p>
            )}
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold text-slate-800">Fix these first</p>
              <ol className="space-y-1.5 text-sm text-slate-700">
                {weakest.map((d) => (
                  <li key={d.name} className="flex items-center justify-between gap-2">
                    <span>{d.name}: {d.flaws[0]}</span>
                    <ScorePill score={d.now} />
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="h-80 md:col-span-3" role="img" aria-label="Radar chart of the six dimension scores">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={chartData} outerRadius="75%">
                <PolarGrid stroke="#cbd5e1" />
                <PolarAngleAxis dataKey="dim" tick={{ fill: "#334155", fontSize: 13, fontWeight: 600 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Before" dataKey="Before" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.15} strokeDasharray="4 3" />
                <Radar name="Now" dataKey="Now" stroke="#0f6b73" fill="#0f6b73" fillOpacity={0.35} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {sources?.length > 0 && (
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold">Where the feedback came from</h2>
            <ul className="mt-3 grid gap-x-8 gap-y-2 md:grid-cols-2">
              {sources.map((s) => (
                <li key={s.name} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tone(s.score).c }} />
                  <span className="font-medium">{s.name}</span>
                  <span className="text-slate-500">{s.region}</span>
                  <span className="ml-auto font-semibold" style={{ color: tone(s.score).c }}>{s.score}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Dimension cards */}
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Breakdown by dimension</h2>
          {scored.map((d, i) => (
            <DimensionCard
              key={d.name}
              dim={d}
              score={d.now}
              applied={applied}
              onToggle={toggle}
              open={openIdx === i}
              setOpen={() => setOpenIdx(openIdx === i ? -1 : i)}
            />
          ))}
        </section>

        {/* AMD ROCm Synthetic Consumer Panel (Twin-2K-500) */}
        {data.customer_segments && data.customer_segments.length > 0 && (
          <section className="rounded-xl bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">AMD Synthetic Consumer Panel</h2>
                <p className="text-xs text-slate-500 mt-0.5">Simulated across Twin-2K-500 demographic personas fine-tuned with ROCm</p>
              </div>
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-800">AMD ROCm Instinct</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {data.customer_segments.map((seg, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-slate-900 text-sm">{seg.segment_name}</h3>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">{seg.sentiment}</span>
                  </div>
                  <p className="text-xs text-slate-600">{seg.reaction_summary}</p>
                  <div className="rounded bg-teal-50 p-2 text-xs font-semibold text-teal-900 border border-teal-200">
                    Willingness-to-pay: <span className="font-mono">{seg.willingness_to_pay}</span>
                  </div>
                  {seg.objections && seg.objections.length > 0 && (
                    <div className="text-xs text-slate-600">
                      <span className="font-medium text-slate-700">Top objection:</span> {seg.objections[0]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Alternatives */}
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold">Other directions worth testing</h2>
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {data.alternative_ideas?.map((a) => (
              <li key={a} className="rounded-md bg-slate-50 p-3 text-sm text-slate-800">{a}</li>
            ))}
          </ul>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 pb-6 text-xs text-slate-500">
          <p>This is decision support based on open data, not a guarantee of success.</p>
          <div className="flex gap-2">
          {onRestart && (
            <button onClick={onRestart} className="rounded-md bg-teal-800 px-3 py-1.5 font-semibold text-white hover:bg-teal-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2">
              Analyze another idea
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
          >
            Print or save as PDF
          </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
