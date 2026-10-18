// ResultsDashboard.jsx
// Setup: npm i recharts  |  Tailwind CSS must be enabled.
// Usage: <ResultsDashboard idea={...} data={apiPayload} onRestart={...} onApplyFix={(fix) => ...} />
// `data` is the API response (shape in lib/apiShape.js). Every number comes from it, or from labelled example data.
// Layout (12 columns, 16px gaps):
//   header  "Would buy" hero number with its interval | run status and "New simulation"
//   row 1   most favorable segment (3) | least favorable (3) | icon actions (1) | fix with the biggest impact (5)
//   row 2   demand curve (6) | gauge (3) | A/B comparison (3)
//   row 3   the panel on a map (8) | reaction by segment (4)
//   row 4   what people said (5) | main objections (4) | competitors (3)
// `embedded` drops the page header (used under "New simulation"); `mode` is "scan" while the analysis runs.
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import DemoBar from "./components/DemoBar";
import { CompareCard, CompetitorsCard, FeedCard, FixCard, IconActions, MapCard, NeedleCard, ObjectionsCard, SegmentWash, SegmentsCard, WtpCard, segmentExtremes } from "./components/cards";
import { has } from "./lib/apiShape";

const fmtTime = (sec) => (typeof sec === "number" ? (sec >= 60 ? `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s` : `${Math.round(sec)}s`) : null);

export default function ResultsDashboard({ data: payload, idea, onRestart, onApplyFix, embedded = false, mode = "result", status, demo = false, onToggleDemo }) {
  const scanning = mode === "scan";
  const data = mode === "result" ? payload : undefined; // while the analysis runs nothing is shown yet
  const personas = has(data?.personas) ? data.personas : null;
  const buy = typeof data?.reactions?.buy === "number" ? data.reactions.buy : personas ? (personas.filter((p) => p.reaction === "buy").length / personas.length) * 100 : null;
  const iv = data?.buyInterval;
  const ex = segmentExtremes(data?.segments);
  const n = data?.run?.personas ?? personas?.length;
  const time = fmtTime(data?.run?.runtimeSeconds);

  return (
    <div className={`@container ${embedded ? "text-zinc-100" : "px-4 py-6 text-zinc-100 md:px-8 md:py-8"}`}>
      <div className={embedded ? "space-y-4" : "mx-auto max-w-[88rem] space-y-4"}>
        <DemoBar demo={demo} hasData={!!payload && Object.keys(payload).some((k) => k !== "idea" && k !== "request")} onToggle={onToggleDemo} />

        <header className="flex flex-wrap items-end justify-between gap-6 pb-2">
          <div>
            <p className="label">Would buy{idea ? <span className="text-zinc-600"> &middot; </span> : null}<span className="line-clamp-1 inline text-zinc-500">{idea}</span></p>
            <p className="dot mt-3 text-[clamp(4rem,10vw,7.5rem)]" style={{ color: buy !== null && !scanning ? "var(--text)" : "var(--dim)" }}>{buy !== null && !scanning ? `${Math.round(buy)}%` : "--"}</p>
            <p className="label mt-3">{scanning ? (status || "Analyzing your idea") : buy === null ? "Not available yet: the API has not returned the share that would buy." : iv && typeof iv.low === "number" && typeof iv.high === "number" ? `Interval ${Math.round(iv.low)}% to ${Math.round(iv.high)}%` : "Interval: not available yet"}{data?.weighting ? ` \u00b7 weighted to US adults (ACS ${data.weighting.year})` : ""}</p>
          </div>
          <div className="flex flex-wrap items-stretch gap-3">
            <div className="panel flex items-center gap-6 rounded-[22px] px-5 py-3">
              <div><p className="label">Run</p><p className="mt-1 text-sm text-zinc-200">{scanning ? "Running" : data ? "Done" : "No run yet"}</p></div>
              <div><p className="label">Personas</p><p className="num mt-1 text-sm text-zinc-100">{typeof n === "number" ? n : "n/a"}</p></div>
              {typeof data?.run?.effectiveN === "number" && <div><p className="label" title="Kish effective sample size of the weighted panel">Effective n</p><p className="num mt-1 text-sm text-zinc-100">{Math.round(data.run.effectiveN)}</p></div>}
              <div><p className="label">Runtime</p><p className="num mt-1 text-sm text-zinc-100">{time ?? "n/a"}</p></div>
            </div>
            <Link to="/app/new" onClick={onRestart} className="btn btn-accent self-center px-5 py-3 text-sm"><Plus size={16} aria-hidden /> New simulation</Link>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-12">
          <SegmentWash i={0} title="Most favorable segment" seg={ex?.best} wash="wash-amber" scanning={scanning} className="@4xl:col-span-3" />
          <SegmentWash i={1} title="Least favorable segment" seg={ex?.worst} wash="wash-navy" scanning={scanning} className="@4xl:col-span-3" />
          <IconActions i={2} className="@4xl:col-span-1" onBriefing={data ? () => import("./lib/briefing").then((m) => m.downloadBriefing({ idea, data, demo })) : undefined} />
          <FixCard i={3} fix={data?.topFix} onApply={onApplyFix} scanning={scanning} className="@4xl:col-span-5" />

          <WtpCard i={4} wtp={data?.wtp} views={data?.wtpViews} customerPrice={data?.customerPrice} scanning={scanning} className="@4xl:col-span-6" />
          <NeedleCard i={5} score={data?.score} range={data?.scoreRange} previous={data?.previous?.score} mode={mode} status={status} className="@4xl:col-span-3" />
          <CompareCard i={6} compare={data?.compare} scanning={scanning} className="@4xl:col-span-3" />

          <MapCard i={7} personas={data?.personas} mode={scanning ? "scan" : personas ? "result" : "idle"} className="@4xl:col-span-8" />
          <SegmentsCard i={8} segments={data?.segments} overall={buy} scanning={scanning} className="@4xl:col-span-4" />

          <FeedCard i={9} personas={data?.personas} scanning={scanning} className="@4xl:col-span-5" />
          <ObjectionsCard i={10} objections={data?.objections} scanning={scanning} className="@4xl:col-span-4" />
          <CompetitorsCard i={11} competitors={data?.competitors} yourPrice={data?.customerPrice} scanning={scanning} className="@4xl:col-span-3" />
        </div>

        <p className="pb-2 text-xs text-zinc-500">Decision support based on survey data, not a guarantee of success.</p>
      </div>
    </div>
  );
}
