// Marks a card whose data has not arrived from the API. Never shows a number.
export default function Placeholder({ scanning = false, what = "data", className = "" }) {
  return (
    <div className={`flex min-h-[8rem] flex-1 flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-white/15 p-4 text-center ${scanning ? "sheen" : ""} ${className}`}>
      <p className="text-sm font-medium text-zinc-300">{scanning ? "Waiting for the analysis" : "Not available yet"}</p>
      <p className="text-xs text-zinc-500">{scanning ? `The ${what} will appear here.` : `The API has not returned the ${what}.`}</p>
    </div>
  );
}
