import CountUp from "./CountUp";
import { colorOfScore, formatDate, verdictOf } from "../lib/history";

// Small card: the score is the point. The score comes from the API; if it is missing the card says so.
export default function SimulationCard({ entry, index = 0, onOpen }) {
  const has = typeof entry.score === "number";
  const c = has ? colorOfScore(entry.score) : "var(--muted)";
  return (
    <button
      onClick={() => onOpen(entry)}
      aria-label={`${entry.idea}. ${has ? `Score ${Math.round(entry.score)}, ${verdictOf(entry.score)}` : "No score yet"}`}
      style={{ "--i": index }}
      className="rise panel-hover panel flex h-full min-h-[10.5rem] flex-col p-5 text-left"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <span className="label whitespace-nowrap">{formatDate(entry.at)}</span>
        <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: c }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />{has ? verdictOf(entry.score) : "No score yet"}
        </span>
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-snug text-zinc-300">{entry.idea}</p>
      <p className="num mt-auto pt-4 text-4xl" style={{ color: c }}>{has ? <CountUp value={Math.round(entry.score)} /> : "–"}</p>
    </button>
  );
}
