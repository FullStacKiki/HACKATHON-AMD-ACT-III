import { useState } from "react";
import IdeaIntake from "./dashboard";
import ResultsDashboard from "./ResultsDashboard";

export default function App() {
  const [resultsData, setResultsData] = useState(null);
  const [currentIdea, setCurrentIdea] = useState("");
  const [baseScore, setBaseScore] = useState(null);
  const [activeSources, setActiveSources] = useState([]);

  const handleDone = ({ idea, score, sources, rawData }) => {
    setCurrentIdea(idea);
    setBaseScore(score);
    setActiveSources(sources);
    if (rawData) {
      setResultsData(rawData);
    }
  };

  const handleRestart = () => {
    setResultsData(null);
    setCurrentIdea("");
    setBaseScore(null);
    setActiveSources([]);
  };

  return (
    <div>
      {!resultsData ? (
        <IdeaIntake onDone={handleDone} score={baseScore} />
      ) : (
        <ResultsDashboard
          data={resultsData}
          idea={currentIdea}
          baseScore={baseScore}
          sources={activeSources}
          onRestart={handleRestart}
        />
      )}
    </div>
  );
}
