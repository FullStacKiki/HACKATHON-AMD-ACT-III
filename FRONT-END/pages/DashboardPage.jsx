import { Link, useOutletContext } from "react-router-dom";
import { ArrowRight, Plus } from "lucide-react";
import DemoBar from "../components/DemoBar";
import { Card, Kpis, NeedleCard } from "../components/cards";
import { colorOfScore, formatDate, verdictOf } from "../lib/history";
import { DEMO } from "../lib/demoResult";

// Overview: the latest simulation in short (needle and four numbers) and the list of the previous ones.
// Every number comes from the saved API results; with none saved there are placeholders, or the flagged example if you ask for it.
export default function DashboardPage() {
  const { history, openEntry, demo, toggleDemo } = useOutletContext();
  const latest = history[0];
  const data = latest?.result ?? (demo ? DEMO : undefined);
  const idea = latest ? latest.idea : demo ? "Example idea" : "Run your first simulation to see the results here.";

  return (
    <div className="@container space-y-4 p-4 md:p-6">
      <header className="pb-1">
        <p className="label">Panel</p>
        <h1 className="mt-1 text-2xl font-medium tracking-tight md:text-3xl">Overview</h1>
      </header>
      <DemoBar demo={demo} hasData={!!latest} onToggle={toggleDemo} />

      <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-12">
        <NeedleCard i={0} score={data?.score} range={data?.scoreRange} mode="result" idea={idea} className="@4xl:col-span-4">
          <Link to="/app/new" className="btn btn-accent px-4 py-2 text-sm"><Plus size={16} /> New simulation</Link>
          {latest && <button className="btn px-4 py-2 text-sm" onClick={() => openEntry(latest)}>Full results</button>}
        </NeedleCard>

        <Card i={1} title="Previous simulations" note={history.length ? `${history.length} saved` : undefined} className="@4xl:col-span-8">
          {history.length === 0 ? (
            <div className="flex min-h-[8rem] flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 p-4 text-center"><p className="text-sm font-medium text-zinc-300">No simulations yet</p><p className="text-xs text-zinc-500">The ones you run will be listed here.</p></div>
          ) : (
            <ul className="flex-1 divide-y divide-white/[0.07]">
              {history.slice(0, 7).map((h) => {
                const has = typeof h.score === "number", c = has ? colorOfScore(h.score) : "var(--muted)";
                return (
                  <li key={h.id}>
                    <button onClick={() => openEntry(h)} className="flex w-full items-center gap-4 py-3 text-left hover:bg-white/[0.03]">
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm text-zinc-200">{h.idea}</span><span className="label">{formatDate(h.at)} · {has ? verdictOf(h.score) : "No score yet"}</span></span>
                      <span className="num text-xl font-medium" style={{ color: c }}>{has ? Math.round(h.score) : "–"}</span>
                      <ArrowRight size={14} className="text-zinc-600" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Kpis data={data} i={2} className="@4xl:col-span-3" />
      </div>
    </div>
  );
}
