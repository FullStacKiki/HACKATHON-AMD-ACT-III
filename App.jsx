// App.jsx: moves from the intake page to the results dashboard.
import { useState } from "react";
import IdeaIntake from "./IdeaIntake";
import ResultsDashboard from "./ResultsDashboard";

export default function App() {
  const [result, setResult] = useState(null); // { idea, score, sources } once the analysis is done

  if (!result) return <IdeaIntake onDone={setResult} />;

  return (
    <ResultsDashboard
      idea={result.idea}
      baseScore={result.score}
      sources={result.sources}
      onRestart={() => setResult(null)}
    />
  );
}
