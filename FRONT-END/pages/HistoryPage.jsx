import { useOutletContext } from "react-router-dom";
import SimulationCard from "../components/SimulationCard";

export default function HistoryPage() {
  const { history, openEntry } = useOutletContext();
  return (
    <div className="space-y-6 p-4 md:p-8">
      <header>
        <p className="label">History</p>
        <h1 className="mt-1 text-2xl font-medium tracking-tight md:text-3xl">All simulations</h1>
      </header>
      {history.length === 0 ? (
        <p className="panel p-8 text-center text-zinc-400">Nothing here yet: simulations you run will be listed here.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {history.map((h, i) => <SimulationCard key={h.id} entry={h} index={i} onOpen={openEntry} />)}
        </div>
      )}
    </div>
  );
}
