// Lets you see how real data would fill a page. The example numbers are made up (lib/demoResult.js) and always flagged.
export default function DemoBar({ demo, hasData, onToggle }) {
  if (!onToggle) return null;
  if (demo) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-white/20 px-4 py-3 text-sm text-zinc-300">
        <span><span className="font-medium text-zinc-100">Example data.</span> Made-up numbers that show how results will look. They do not come from the API.</span>
        <button onClick={onToggle} className="btn px-4 py-1.5 text-sm">Hide example</button>
      </div>
    );
  }
  if (hasData) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-white/15 px-4 py-3 text-sm text-zinc-400">
      <span>No data from the API yet. Every card below is a placeholder.</span>
      <button onClick={onToggle} className="btn px-4 py-1.5 text-sm">Show example data</button>
    </div>
  );
}
