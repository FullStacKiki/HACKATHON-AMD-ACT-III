import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ChevronDown, ChevronsLeft, ChevronsRight, ChevronsUpDown, CircleHelp, Clock, Gauge, LayoutGrid, MessageCircle, PieChart, Plus, Settings, Tag, Target, Users, X } from "lucide-react";
import { LogoMark } from "./Logo";
import { PRODUCT_NAME } from "../brand";

const INSIGHTS = [["/app/segments", PieChart, "Segments"], ["/app/pricing", Tag, "Pricing"], ["/app/objections", MessageCircle, "Objections"], ["/app/competitors", Target, "Competitors"]];

const item = (collapsed, sub) => ({ isActive }) =>
  `nav-item flex items-center rounded-xl text-sm transition-colors ${collapsed ? "h-11 w-11 justify-center" : `gap-3 px-3 ${sub ? "py-2" : "py-2.5"}`} ${
    isActive ? "bg-white/[0.09] text-zinc-50 shadow-[inset_0_1px_0_rgb(var(--fg)/0.06)]" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
  }`;
const Badge = ({ n }) => <span className="num ml-auto rounded-full bg-white/[0.09] px-2 py-0.5 text-[11px] text-zinc-300">{n}</span>;
const round = "flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-400 transition-colors hover:text-zinc-100";

// A run in progress: name, time elapsed, a thin progress line (no percentage: the length is not known) and a small action
function RunCard({ run }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.round((now - (run.startedAt ?? now)) / 1000));
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3">
      <div className="flex items-baseline justify-between gap-2"><p className="truncate text-xs font-medium text-zinc-200">{run.idea}</p><span className="num shrink-0 text-[11px] text-zinc-500">{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span></div>
      <p className="label mt-0.5">{run.label || "Starting"}</p>
      <div className="sheen mt-2.5 h-px w-full bg-white/10" role="progressbar" aria-label="Run in progress" />
      {run.cancel && <button type="button" onClick={run.cancel} className="mt-2.5 rounded-full border border-white/15 px-3 py-1 text-[11px] text-zinc-300 hover:border-white/30 hover:text-zinc-50">Cancel</button>}
    </div>
  );
}

// `collapsed` shrinks the desktop sidebar to an icon rail. `onToggle` collapses it; `onClose` closes the mobile drawer.
export default function Sidebar({ history, hasResult, runs = [], onNavigate, onClose, collapsed = false, onToggle }) {
  const [open, setOpen] = useState(true);
  const link = (to, Icon, label, { end, sub, badge } = {}) => (
    <NavLink key={to} to={to} end={end} onClick={onNavigate} className={item(collapsed, sub)} title={collapsed ? label : undefined} aria-label={collapsed ? label : undefined}>
      <Icon size={17} strokeWidth={1.6} aria-hidden />{!collapsed && <span>{label}</span>}{!collapsed && badge ? <Badge n={badge} /> : null}
    </NavLink>
  );
  return (
    <div className={`flex h-full flex-col ${collapsed ? "items-center p-3" : "p-4"}`}>
      {/* Logo, name, plan label and switcher */}
      <div className={`flex ${collapsed ? "flex-col items-center gap-3 pb-4" : "items-center justify-between gap-2 pb-5"}`}>
        <Link to="/" onClick={onNavigate} className="flex min-w-0 items-center gap-2.5" aria-label="Back to the landing page">
          <LogoMark size={collapsed ? 30 : 32} />
          {!collapsed && <span className="min-w-0 leading-none"><span className="block text-lg font-medium tracking-tight text-zinc-100">{PRODUCT_NAME}</span><span className="mt-1 block text-[11px] text-zinc-500">Early access</span></span>}
        </Link>
        <span className="flex items-center gap-1">
          {!collapsed && <ChevronsUpDown size={15} className="text-zinc-600" aria-hidden />}
          {onToggle && <button onClick={onToggle} className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}</button>}
          {onClose && <button onClick={onClose} className="btn h-10 w-10 p-0" aria-label="Close menu"><X size={18} /></button>}
        </span>
      </div>

      {!collapsed && (
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-white/[0.05] p-1" role="group" aria-label="View">
          {[["/app/results", Gauge, "Results"], ["/app/personas", Users, "Personas"]].map(([to, Icon, t]) => (
            <NavLink key={to} to={to} onClick={onNavigate} className={({ isActive }) => `flex items-center justify-center gap-1.5 rounded-full py-2 text-xs font-medium transition-colors ${isActive ? "bg-white/[0.13] text-zinc-50" : "text-zinc-400 hover:text-zinc-100"}`}><Icon size={14} strokeWidth={1.6} aria-hidden />{t}</NavLink>
          ))}
        </div>
      )}

      <nav aria-label="App" className={`flex-1 space-y-1 overflow-y-auto ${collapsed ? "flex flex-col items-center" : "w-full"}`}>
        {!collapsed && <p className="label px-3 pb-1">Navigation</p>}
        {link("/app", LayoutGrid, "Overview", { end: true })}
        {link("/app/new", Plus, "New simulation")}
        {link("/app/history", Clock, "History", { badge: history.length })}
        {collapsed ? INSIGHTS.map(([to, Icon, t]) => link(to, Icon, t)) : (
          <div>
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100">
              <PieChart size={17} strokeWidth={1.6} aria-hidden /><span>Insights</span><ChevronDown size={14} className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {open && <div className="ml-5 mt-0.5 space-y-0.5 border-l border-white/10 pl-2.5">{INSIGHTS.map(([to, Icon, t]) => link(to, Icon, t, { sub: true }))}</div>}
          </div>
        )}
      </nav>

      {!collapsed && (
        <div className="mt-4">
          <p className="label px-1 pb-2">Active runs</p>
          {runs.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 px-3 py-3 text-xs text-zinc-500">No active runs</p> : <div className="space-y-2">{runs.map((r, k) => <RunCard key={k} run={r} />)}</div>}
        </div>
      )}

      <div className={`mt-4 flex gap-2 border-t border-white/[0.07] pt-4 ${collapsed ? "flex-col items-center" : ""}`}>
        <Link to="/#how-it-works" className={round} aria-label="Help: how it works" title="Help"><CircleHelp size={17} strokeWidth={1.6} /></Link>
        <NavLink to="/app/settings" onClick={onNavigate} className={round} aria-label="Settings" title="Settings"><Settings size={17} strokeWidth={1.6} /></NavLink>
      </div>
    </div>
  );
}
