// App.jsx: routes the landing page and the app. "New simulation" shows its results right under the live
// analysis; "Results" in the sidebar opens the same dashboard on its own page.
// Numbers come only from the API payload (lib/apiShape.js). Until the API is wired nothing is pre-filled;
// "Show example data" (or ?demo in the address) fills every card with clearly marked, made-up numbers.
import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate, Link } from "react-router-dom";
import IdeaIntake from "./IdeaIntake";
import ResultsDashboard from "./ResultsDashboard";
import Landing from "./pages/Landing";
import AppShell from "./pages/AppShell";
import DashboardPage from "./pages/DashboardPage";
import HistoryPage from "./pages/HistoryPage";
import { SettingsPage } from "./pages/SimplePages";
import { CompetitorsPage, ObjectionsPage, PersonasPage, PricingPage, SegmentsPage } from "./pages/InsightPages";
import { clearHistory, loadHistory, saveHistory } from "./lib/history";
import { DEMO } from "./lib/demoResult";

export default function App() {
  const navigate = useNavigate();
  const [demo, setDemo] = useState(() => new URLSearchParams(window.location.search).has("demo"));
  const toggleDemo = () => setDemo((d) => !d);
  const apiData = demo ? DEMO : undefined; // the API payload for the simulation; undefined until it is wired
  const [result, setResult] = useState(null); // { idea, ...apiPayload } once the analysis is done
  const [history, setHistory] = useState(loadHistory);
  const [run, setRun] = useState(null); // the run in progress, shown in the sidebar
  const [prefill, setPrefill] = useState(""); // idea to start the next simulation with
  const [runKey, setRunKey] = useState(0); // changing it remounts the intake page: back to the search bar

  useEffect(() => saveHistory(history), [history]);

  const finish = (r) => {
    setResult(r);
    setHistory((h) => [{ id: `r${Date.now()}`, idea: r.idea, score: r.score, result: r, at: new Date().toISOString() }, ...h]);
  };
  const openEntry = (e) => {
    setResult(e.result ?? { idea: e.idea, score: e.score });
    navigate("/app/results");
  };
  const restart = () => { setPrefill(""); setResult(null); setRunKey((k) => k + 1); navigate("/app/new"); };
  const applyFix = (fix) => { setPrefill(fix.idea ?? result?.idea ?? ""); setResult(null); setRunKey((k) => k + 1); navigate("/app/new"); };
  const clearAll = () => { clearHistory(); setHistory([]); };

  const ctx = { result, history, openEntry, clearAll, demo, toggleDemo, run };

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<AppShell ctx={ctx} />}>
        <Route index element={<DashboardPage />} />
        <Route
          path="new"
          element={
            <IdeaIntake
              key={runKey}
              data={apiData}
              demo={demo}
              initialIdea={prefill}
              onRunChange={setRun}
              onDone={finish}
              onExample={() => setDemo(true)}
              renderResults={(r) => <ResultsDashboard embedded idea={r.idea} data={r.data} mode={r.mode} status={r.status} demo={demo} onToggleDemo={toggleDemo} onApplyFix={applyFix} />}
            />
          }
        />
        <Route
          path="results"
          element={
            result ? (
              <ResultsDashboard idea={result.idea} data={result} onRestart={restart} onApplyFix={applyFix} demo={demo} onToggleDemo={toggleDemo} />
            ) : demo ? (
              <ResultsDashboard idea="Example idea" data={DEMO} onApplyFix={applyFix} demo onToggleDemo={toggleDemo} />
            ) : (
              <div className="p-5 md:p-9">
                <p className="label">Results</p>
                <h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">No results yet</h1>
                <p className="mt-3 max-w-md text-zinc-400">Run a simulation, or open one from your history.</p>
                <div className="mt-6 flex flex-wrap gap-3"><Link to="/app/new" className="btn btn-accent">New simulation</Link><button onClick={toggleDemo} className="btn">Show example data</button></div>
              </div>
            )
          }
        />
        <Route path="personas" element={<PersonasPage />} />
        <Route path="segments" element={<SegmentsPage />} />
        <Route path="pricing" element={<PricingPage />} />
        <Route path="objections" element={<ObjectionsPage />} />
        <Route path="competitors" element={<CompetitorsPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
