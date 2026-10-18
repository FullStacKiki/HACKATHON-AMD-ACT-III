// The cards of the results dashboard. Each one reads only what the API sent (shape in lib/apiShape.js);
// when its data is missing it shows a placeholder that says so.
import { useState } from "react";
import { Link } from "react-router-dom";
import { FileText, GitCompare, Loader2, RefreshCw } from "lucide-react";
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import CountUp from "./CountUp";
import Placeholder from "./Placeholder";
import PersonaMap from "./PersonaMap";
import ArcGauge from "./ArcGauge";
import WorldMini from "./WorldMini";
import { REACTION, colorOf, halfPrice, has, shareAt, verdictOf } from "../lib/apiShape";

export function Card({ title, note, i = 0, className = "", children }) {
  return (
    <section className={`rise panel flex h-full min-w-0 flex-col rounded-[26px] p-5 ${className}`} style={{ "--i": i }}>
      {title && (
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-zinc-100">{title}</h2>
          {note && (typeof note === "string" ? <span className="label text-right">{note}</span> : note)}
        </div>
      )}
      {children}
    </section>
  );
}

const pct = (n) => `${Math.round(n)}%`;
const money = (n) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const Dots = ({ children, className = "" }) => <div className={`overflow-hidden rounded-full bg-white/[0.07] ${className}`}>{children}</div>; // a thin rounded bar
const MUTED = "rgb(var(--fg) / 0.38)"; // bars are muted grey; only the highlighted one takes the accent

// "Previous / Current": big dot-matrix numbers, a small grey line, and a green or red delta chip
export function Strip({ prev, cur, prevSub, curSub, unit = "%" }) {
  const d = typeof prev === "number" && typeof cur === "number" ? cur - prev : null;
  const col = d === null || Math.round(d) === 0 ? "var(--muted)" : d > 0 ? "var(--lime)" : "var(--warn)";
  const cell = (label, v, sub, chip) => (
    <div>
      <p className="label">{label}</p>
      <p className="dot mt-2 text-3xl">{typeof v === "number" ? `${Math.round(v)}${unit}` : "--"}</p>
      <p className="mt-1.5 flex items-center gap-2 text-xs text-zinc-500">{sub}{chip}</p>
    </div>
  );
  return (
    <div className="mt-4 grid grid-cols-2 gap-4 border-t border-white/[0.07] pt-4">
      {cell("Previous", prev, prevSub ?? (typeof prev === "number" ? "" : "Nothing to compare"))}
      {cell("Current", cur, curSub, d !== null && <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: col, background: `color-mix(in srgb, ${col} 14%, transparent)` }}>{d > 0 ? "+" : ""}{Math.round(d)} pts</span>)}
    </div>
  );
}

// ---- Row 1 -------------------------------------------------------------------------------------------------------------
export function MapCard({ personas, mode, i = 0, className = "" }) {
  const n = has(personas) ? personas.length : 0;
  const count = (k) => (n ? personas.filter((p) => p.reaction === k).length : null);
  return (
    <Card i={i} className={`${n ? "wash-navy" : ""} ${className}`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">The panel</p>
          <p className="dot mt-2 text-5xl">{n || "--"}</p>
          <p className="label mt-1.5">{n ? "people, each one a dot" : "No people yet"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(REACTION).map(([k, r]) => (
            <span key={k} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300"><span className="h-2 w-2 rounded-full" style={{ background: r.color }} />{r.label}{n ? <span className="num text-zinc-100">{count(k)}</span> : null}</span>
          ))}
        </div>
      </div>
      <PersonaMap personas={personas} mode={mode} className="aspect-[8/5] min-h-[14rem] w-full" />
      <p className="label mt-3">{mode === "scan" ? "Waiting for the analysis." : n ? "Hover a dot to read that person's answer." : "Not available yet: the API has not returned the people of the panel."}</p>
    </Card>
  );
}

export function NeedleCard({ score, range, previous, mode, status, idea, i = 0, className = "", children }) {
  const has_ = typeof score === "number", showing = mode === "result";
  return (
    <Card i={i} title="Viability score" className={`items-center text-center ${className}`}>
      <ArcGauge value={score} mode={mode} className="mt-2" />
      <p className="mt-2 text-sm font-medium" aria-live="polite" style={{ color: has_ && showing ? colorOf(score) : "var(--muted)" }}>{mode === "scan" ? status || "Analyzing your idea" : has_ ? verdictOf(score) : "No score yet"}</p>
      <p className="label mt-1">
        {showing && range && typeof range.low === "number" && typeof range.high === "number" ? `Uncertainty range ${Math.round(range.low)} to ${Math.round(range.high)}` : showing ? "Uncertainty range: not available yet" : ""}
      </p>
      {idea && <p className="mt-3 line-clamp-2 max-w-xs text-xs text-zinc-500">{idea}</p>}
      {showing && typeof previous === "number" && <div className="w-full text-left"><Strip prev={previous} cur={score} unit="" /></div>}
      {children && <div className="mt-4 flex w-full flex-wrap justify-center gap-2">{children}</div>}
    </Card>
  );
}

// ---- Row 2: four numbers, each with a small chart ------------------------------------------------------------------------
function Kpi({ label, value, sub, chart, i, className }) {
  const ok = value !== null && value !== undefined;
  return (
    <Card i={i} className={className}>
      <p className="label">{label}</p>
      <p className="num mt-3 text-4xl font-medium text-zinc-50">{ok ? value : "–"}</p>
      <p className="mt-1 min-h-[1.25rem] truncate text-xs text-zinc-400">{ok ? sub : "Not available yet"}</p>
      <div className="mt-auto pt-4">{ok ? chart : <div className="h-10 rounded-lg border border-dashed border-white/15" />}</div>
    </Card>
  );
}

function MiniCurve({ wtp, mark }) {
  const pts = [...wtp].sort((a, b) => a.price - b.price), x0 = pts[0].price, x1 = pts[pts.length - 1].price;
  const X = (p) => 4 + ((p - x0) / (x1 - x0 || 1)) * 192, Y = (s) => 4 + (1 - s / 100) * 36;
  return (
    <svg viewBox="0 0 200 44" className="h-10 w-full" aria-hidden>
      <line x1="4" x2="196" y1={Y(50)} y2={Y(50)} stroke="rgb(var(--fg) / 0.15)" strokeDasharray="2 4" />
      <polyline points={pts.map((p) => `${X(p.price)},${Y(p.share)}`).join(" ")} fill="none" stroke="rgb(var(--fg) / 0.55)" strokeWidth="1.5" />
      {typeof mark === "number" && mark >= x0 && mark <= x1 && <circle cx={X(mark)} cy={Y(50)} r="3.5" fill="var(--accent)" />}
    </svg>
  );
}

export function Kpis({ data, i = 0, className = "" }) {
  const personas = has(data?.personas) ? data.personas : null;
  const buy = typeof data?.reactions?.buy === "number" ? data.reactions.buy : personas ? (personas.filter((p) => p.reaction === "buy").length / personas.length) * 100 : null;
  const r = data?.reactions;
  const half = halfPrice(data?.wtp);
  const segs = Object.entries(data?.segments ?? {}).flatMap(([g, list]) => (has(list) ? list.map((s) => ({ ...s, group: g })) : [])).sort((a, b) => b.value - a.value);
  const obj = has(data?.objections) ? [...data.objections].sort((a, b) => b.share - a.share) : null;
  const GROUP = { age: "Age", income: "Income", politics: "Political leaning" };
  return (
    <>
      <Kpi i={i} className={className} label="Would buy" value={buy === null ? null : pct(buy)} sub="of the panel"
        chart={r ? <Dots className="flex h-3">{["buy", "undecided", "no"].map((k) => <div key={k} style={{ width: `${r[k] ?? 0}%`, background: REACTION[k].color }} />)}</Dots> : <Dots className="h-3"><div className="h-full" style={{ width: `${buy}%`, background: "var(--lime)" }} /></Dots>} />
      <Kpi i={i + 1} className={className} label="Price half the panel accepts" value={half === null ? null : money(half)} sub="where 50% would still buy" chart={<MiniCurve wtp={data?.wtp ?? []} mark={half} />} />
      <Kpi i={i + 2} className={className} label="Most favorable segment" value={segs.length ? pct(segs[0].value) : null} sub={segs.length ? `${segs[0].label} (${GROUP[segs[0].group] ?? segs[0].group})` : ""}
        chart={<div className="space-y-1.5">{segs.slice(0, 3).map((s, n) => <Dots key={s.group + s.label} className="h-2"><div className="h-full" style={{ width: `${s.value}%`, background: n === 0 ? "var(--lime)" : "rgb(var(--fg) / 0.4)" }} /></Dots>)}</div>} />
      <Kpi i={i + 3} className={className} label="Main objection" value={obj ? pct(obj[0].share) : null} sub={obj ? obj[0].text : ""}
        chart={obj ? <Dots className="h-1.5"><div className="h-full rounded-full" style={{ width: `${obj[0].share}%`, background: "var(--accent)" }} /></Dots> : null} />
    </>
  );
}

// ---- Row 3 ---------------------------------------------------------------------------------------------------------------
const Select = ({ label, value, options, onChange }) => (
  <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs text-zinc-200 outline-none hover:border-white/25 focus:border-white/40">
    {options.map((o) => <option key={o} value={o} className="bg-[#131313]">{o}</option>)}
  </select>
);

// The demand curve: one smooth gradient line, a dotted grey comparison, no grid, a faint band around "half the panel",
// and a dot with its value at the end of each line. The strip below compares the selected view with the baseline.
export function WtpCard({ wtp: wtpBase, views, customerPrice, scanning, i = 0, className = "" }) {
  const [q, setQ] = useState(null), [sg, setSg] = useState(null);
  const questions = has(views) ? [...new Set(views.map((v) => v.question))] : [];
  const segments = has(views) ? [...new Set(views.map((v) => v.segment))] : [];
  const qq = q ?? questions[0], ss = sg ?? segments[0];
  const wtp = has(views) ? views.find((v) => v.question === qq && v.segment === ss)?.points : wtpBase;
  const base = has(views) && ss !== segments[0] ? views.find((v) => v.question === qq && v.segment === segments[0])?.points : null;
  const ok = has(wtp);
  const rows = ok ? [...wtp].sort((a, b) => a.price - b.price).map((p) => ({ ...p, cmp: base ? base.find((b) => b.price === p.price)?.share : p.low })) : [];
  const at = shareAt(wtp, customerPrice), atBase = base ? shareAt(base, customerPrice) : null;
  const last = rows[rows.length - 1];
  const mark = ok && at !== null && customerPrice >= rows[0].price && customerPrice <= last.price;
  const axis = { tick: { fill: "var(--muted)", fontSize: 12 }, axisLine: false, tickLine: false };
  return (
    <Card i={i} className={className}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap gap-2">{has(views) && <><Select label="Question" value={qq} options={questions} onChange={setQ} /><Select label="Segment" value={ss} options={segments} onChange={setSg} /></>}</span>
        <h2 className="text-sm font-medium text-zinc-100">Willingness to pay</h2>
      </div>
      {ok ? (
        <>
          <div className="min-h-[14rem] flex-1" role="img" aria-label="Share of the panel willing to pay at each price">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 24, right: 52, left: 0, bottom: 0 }}>
                <defs><linearGradient id="wtpGrad" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#5b8cff" /><stop offset="1" stopColor="var(--accent)" /></linearGradient></defs>
                <XAxis type="number" dataKey="price" domain={["dataMin", "dataMax"]} tickFormatter={(v) => `$${v}`} {...axis} />
                <YAxis domain={[0, 100]} hide />
                <ReferenceArea y1={40} y2={60} fill="rgb(var(--fg) / 0.05)" ifOverflow="hidden" />
                <Tooltip cursor={{ stroke: "rgb(var(--fg) / 0.2)" }} contentStyle={{ background: "var(--bg-elev)", border: "1px solid rgb(var(--fg) / 0.14)", borderRadius: 12, color: "var(--text)" }} labelFormatter={(v) => `Price $${v}`} formatter={(v, n) => [`${Math.round(v)}%`, n]} />
                <Line type="monotone" dataKey="cmp" name={base ? segments[0] : "Low estimate"} stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="2 4" dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="share" name="Would buy" stroke="url(#wtpGrad)" strokeWidth={2.5} dot={false} />
                {typeof last.cmp === "number" && <ReferenceDot x={last.price} y={last.cmp} r={3.5} fill="var(--muted)" stroke="none" label={{ value: `${Math.round(last.cmp)}%`, position: "right", fill: "var(--muted)", fontSize: 12 }} />}
                <ReferenceDot x={last.price} y={last.share} r={4.5} fill="var(--accent)" stroke="none" label={{ value: `${Math.round(last.share)}%`, position: "right", fill: "var(--text)", fontSize: 12 }} />
                {mark && <ReferenceLine x={customerPrice} stroke="var(--accent)" strokeDasharray="3 4" />}
                {mark && <ReferenceDot x={customerPrice} y={at} r={5} fill="var(--accent)" stroke="var(--bg-elev)" strokeWidth={2} label={{ value: `$${customerPrice} \u00b7 ${Math.round(at)}% would buy`, position: "top", fill: "var(--accent)", fontSize: 12 }} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {mark ? <Strip prev={atBase} cur={at} prevSub={base ? `${segments[0]} at $${customerPrice}` : undefined} curSub={`${ss ?? "Panel"} at $${customerPrice}`} /> : <p className="label mt-3">Your price is not available yet: the API has not sent it.</p>}
        </>
      ) : <Placeholder scanning={scanning} what="willingness-to-pay curve" />}
    </Card>
  );
}

function Rows({ items }) {
  const top = Math.max(...items.map((x) => x.value));
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li key={it.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs"><span className="truncate text-zinc-300">{it.label}</span><span className="num shrink-0 text-zinc-100">{pct(it.value)}</span></div>
          <Dots className="h-1.5"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, it.value))}%`, background: it.value === top ? "var(--accent)" : MUTED }} /></Dots>
        </li>
      ))}
    </ul>
  );
}

export function SegmentsCard({ segments, overall, scanning, i = 0, className = "" }) {
  const groups = [["Age", segments?.age], ["Income", segments?.income], ["Politics", segments?.politics]];
  const [g, setG] = useState(0);
  const [name, list] = groups[g];
  const top = has(list) ? Math.max(...list.map((x) => x.value)) : 0;
  const hasAvg = typeof overall === "number";
  return (
    <Card i={i} className={`${has(list) ? "wash-amber" : ""} ${className}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-full bg-white/[0.06] p-1" role="tablist" aria-label="Segment">
          {groups.map(([t], k) => <button key={t} role="tab" aria-selected={g === k} onClick={() => setG(k)} className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${g === k ? "bg-white/[0.14] text-zinc-50" : "text-zinc-400 hover:text-zinc-100"}`}>{t}</button>)}
        </div>
        <h2 className="text-sm font-medium text-zinc-100">Would buy, by segment</h2>
      </div>

      {/* Where the panel comes from: the US is lit, the rest of the world has no panel data */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
        <WorldMini className="aspect-[2.3/1] w-full" />
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent" />United States: panel data</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-white/25" />Elsewhere: no panel data</span></p>
      </div>

      {has(list) ? (
        <ul className="mt-5 flex flex-1 flex-col justify-around gap-4">
          {list.map((it) => {
            const d = hasAvg ? Math.round(it.value - overall) : null;
            return (
              <li key={it.label}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm text-zinc-200">{it.label}{it.value === top && <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[10px] text-accent">Highest</span>}</span>
                  <span className="flex items-center gap-2.5">
                    {d !== null && <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: d > 0 ? "var(--lime)" : d < 0 ? "var(--warn)" : "var(--muted)", background: `color-mix(in srgb, ${d > 0 ? "var(--lime)" : d < 0 ? "var(--warn)" : "var(--muted)"} 14%, transparent)` }}>{d > 0 ? "+" : ""}{d} pts</span>}
                    <span className="num text-xl font-medium text-zinc-50">{pct(it.value)}</span>
                  </span>
                </div>
                <div className="relative">
                  <Dots className="h-2"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, it.value))}%`, background: it.value === top ? "var(--accent)" : MUTED }} /></Dots>
                  {hasAvg && <span className="absolute -top-1 h-4 w-px bg-zinc-200/70" style={{ left: `${Math.max(0, Math.min(100, overall))}%` }} aria-hidden />}
                </div>
              </li>
            );
          })}
        </ul>
      ) : <Placeholder scanning={scanning} what={name.toLowerCase()} />}
      {hasAvg && has(list) && <p className="label mt-3 flex items-center gap-2"><span className="inline-block h-3 w-px bg-zinc-200/70" />Mark: all people, {pct(overall)}</p>}
    </Card>
  );
}
// ---- Row 4 ---------------------------------------------------------------------------------------------------------------
export function FeedCard({ personas, scanning, i = 0, className = "" }) {
  return (
    <Card i={i} title="What people said" note={has(personas) ? "Profile, answer, reason" : undefined} className={className}>
      {has(personas) ? (
        <>
          <ul className="flex-1 divide-y divide-white/[0.07]">
            {personas.slice(0, 5).map((p) => {
              const r = REACTION[p.reaction];
              return (
                <li key={p.id} className="py-3.5 first:pt-0">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-xs text-zinc-400">{[p.age, p.income, p.politics, p.state].filter(Boolean).join(" \u00b7 ")}</p>
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-200"><span className="h-1.5 w-1.5 rounded-full" style={{ background: r?.color ?? "var(--muted)" }} />{r?.label ?? "No answer"}</span>
                  </div>
                  {p.reason && <p className="mt-2 text-sm leading-snug text-zinc-200">&ldquo;{p.reason}&rdquo;</p>}
                </li>
              );
            })}
          </ul>
          <div className="pt-4"><Link to="/app/personas" className="btn px-4 py-2 text-sm">Explore personas</Link></div>
        </>
      ) : <Placeholder scanning={scanning} what="people's answers" />}
    </Card>
  );
}

export function ObjectionsCard({ objections, scanning, i = 0, className = "" }) {
  const list = has(objections) ? [...objections].sort((a, b) => b.share - a.share) : null;
  return (
    <Card i={i} title="Main objections" note="Share of the panel" className={`${list ? "wash-violet" : ""} ${className}`}>
      {list ? (
        <>
          <p className="label">Top objection</p>
          <p className="dot mt-2 text-6xl">{pct(list[0].share)}</p>
          <p className="mt-2 text-base leading-snug text-zinc-100">{list[0].text}</p>
          <ol className="mt-auto space-y-3.5 border-t border-white/[0.07] pt-5">
            {list.slice(1).map((o, n) => (
              <li key={o.text}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm"><span className="text-zinc-300"><span className="num mr-2 text-zinc-500">{n + 2}</span>{o.text}</span><span className="num shrink-0 text-zinc-100">{pct(o.share)}</span></div>
                <Dots className="h-1.5"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, o.share))}%`, background: MUTED }} /></Dots>
              </li>
            ))}
          </ol>
        </>
      ) : <Placeholder scanning={scanning} what="objections" />}
    </Card>
  );
}

export function CompetitorsCard({ competitors, yourPrice, scanning, i = 0, className = "" }) {
  const row = "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3.5";
  return (
    <Card i={i} title="Competitors" note={typeof yourPrice === "number" ? "Against your price" : undefined} className={className}>
      {has(competitors) ? (
        <ul className="flex flex-1 flex-col gap-2.5">
          {typeof yourPrice === "number" && <li className={`${row} border-accent/50 bg-accent/[0.07]`}><span className="text-sm font-medium text-zinc-50">Your price</span><span className="num text-lg font-medium text-accent">{money(yourPrice)}</span></li>}
          {competitors.map((c) => (
            <li key={c.name} className={`${row} border-white/10 bg-white/[0.03]`}>
              <span className="min-w-0"><span className="block truncate text-sm text-zinc-100">{c.name}</span>{c.note && <span className="label">{c.note}</span>}</span>
              {typeof c.price === "number" && <span className="num shrink-0 text-lg font-medium text-zinc-200">{money(c.price)}</span>}
            </li>
          ))}
        </ul>
      ) : <Placeholder scanning={scanning} what="competitors" />}
    </Card>
  );
}

// ---- Results page (restyled) -----------------------------------------------------------------------------------------
const GROUP = { age: "Age", income: "Income", politics: "Political leaning" };
export function segmentExtremes(segments) {
  const all = Object.entries(segments ?? {}).flatMap(([g, list]) => (has(list) ? list.map((x) => ({ ...x, group: GROUP[g] ?? g })) : [])).sort((a, b) => b.value - a.value);
  return all.length ? { best: all[0], worst: all[all.length - 1] } : null;
}

export function SegmentWash({ title, seg, wash, i = 0, scanning, className = "" }) {
  return (
    <Card i={i} title={title} className={`${seg ? wash : ""} ${className}`}>
      {seg ? (
        <>
          <p className="num text-4xl font-medium text-zinc-50">{pct(seg.value)}</p>
          <p className="mt-1 text-sm text-zinc-300">{seg.label}</p><p className="label">{seg.group} &middot; would buy</p>
          <Dots className="mt-4 h-1.5"><div className="h-full rounded-full" style={{ width: `${seg.value}%`, background: wash === "wash-amber" ? "var(--accent)" : MUTED }} /></Dots>
          <div className="mt-auto pt-5"><Link to="/app/personas" className="btn px-4 py-2 text-sm">Explore personas</Link></div>
        </>
      ) : <Placeholder scanning={scanning} what="segments" />}
    </Card>
  );
}

export function IconActions({ i = 0, className = "", onBriefing }) {
  const [busy, setBusy] = useState(false);
  const run = () => { setBusy(true); Promise.resolve(onBriefing()).catch(() => {}).finally(() => setBusy(false)); };
  const base = "flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-zinc-300 transition-colors hover:border-white/30 hover:text-zinc-50";
  return (
    <section className={`rise panel flex h-full flex-row items-center justify-center gap-3 rounded-[26px] p-3 @4xl:flex-col ${className}`} style={{ "--i": i }} aria-label="Actions">
      {onBriefing
        ? <button type="button" onClick={run} disabled={busy} title={busy ? "Writing the briefing, this takes a minute" : "Download briefing"} aria-label={busy ? "Writing the briefing" : "Download briefing"} aria-busy={busy} className={`${base} ${busy ? "cursor-wait" : ""}`}>{busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <FileText size={18} />}</button>
        : <button type="button" disabled title="Download briefing (available once there are results)" aria-label="Download briefing (available once there are results)" className={`${base} cursor-not-allowed opacity-40`}><FileText size={18} /></button>}
      <Link to="/app/new" title="Compare two versions or prices" aria-label="Compare two versions or prices" className={base}><GitCompare size={18} /></Link>
      <Link to="/app/new" title="Run a new simulation" aria-label="Run a new simulation" className={base}><RefreshCw size={18} /></Link>
    </section>
  );
}

export function FixCard({ fix, onApply, scanning, i = 0, className = "" }) {
  return (
    <Card i={i} title="Fix with the biggest impact" className={`wash-violet ${className}`}>
      {fix?.text ? (
        <>
          <p className="text-lg leading-snug text-zinc-50">{fix.text}</p>
          {typeof fix.gain === "number" && <p className="label mt-2">Expected gain: <span className="num text-zinc-100">+{Math.round(fix.gain)}</span> points of would buy</p>}
          <div className="mt-auto pt-6"><button type="button" onClick={() => onApply?.(fix)} disabled={!onApply} className="btn px-5 py-2.5 text-sm">Apply &amp; re-run</button></div>
        </>
      ) : <Placeholder scanning={scanning} what="suggested fix" />}
    </Card>
  );
}

export function CompareCard({ compare, scanning, i = 0, className = "" }) {
  const ok = compare?.a && compare?.b;
  return (
    <Card i={i} title="A/B comparison" note={ok ? "Would buy" : undefined} className={className}>
      {ok ? (
        <>
          {[compare.a, compare.b].map((v, n) => (
            <div key={n} className="mb-3">
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm"><span className="truncate text-zinc-200">{v.label}</span><span className="num text-zinc-50">{pct(v.buy)}</span></div>
              <Dots className="h-1.5"><div className="h-full rounded-full" style={{ width: `${v.buy}%`, background: n === 0 ? "var(--accent)" : MUTED }} /></Dots>
            </div>
          ))}
          {compare.diff && typeof compare.diff.value === "number" && (
            <div className="mt-auto border-t border-white/[0.07] pt-4">
              <p className="label">Difference, A minus B</p>
              <p className="dot mt-2 text-4xl">{compare.diff.value > 0 ? "+" : ""}{Math.round(compare.diff.value)}</p>
              {typeof compare.diff.low === "number" && typeof compare.diff.high === "number" && <p className="label mt-1">Confidence interval {Math.round(compare.diff.low)} to {Math.round(compare.diff.high)}</p>}
            </div>
          )}
        </>
      ) : (scanning ? <Placeholder scanning what="comparison" /> : <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 p-4 text-center"><p className="text-sm font-medium text-zinc-300">No comparison requested</p><p className="mt-1 text-xs text-zinc-500">Add a second version or price when you start a simulation.</p></div>)}
    </Card>
  );
}
