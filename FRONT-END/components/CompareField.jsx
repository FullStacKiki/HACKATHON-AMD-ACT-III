import { useState } from "react";
import { Plus } from "lucide-react";

// Optional "Compare with": a second version of the idea or a second price, to run an A/B comparison.
// value = { kind: "idea" | "price", text: "" }
export default function CompareField({ value, onChange }) {
  const [open, setOpen] = useState(!!value.text);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-100"><Plus size={14} aria-hidden /> Compare with another version or price</button>;
  const kinds = [["idea", "Another version of the idea"], ["price", "Another price"]];
  return (
    <fieldset className="rounded-2xl border border-white/10 p-4">
      <legend className="label px-2">Compare with (optional)</legend>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="What to compare">
        {kinds.map(([k, t]) => (
          <button key={k} type="button" aria-pressed={value.kind === k} onClick={() => onChange({ kind: k, text: "" })} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${value.kind === k ? "border-white/30 bg-white/[0.12] text-zinc-50" : "border-white/10 text-zinc-400 hover:text-zinc-100"}`}>{t}</button>
        ))}
      </div>
      {value.kind === "price" ? (
        <label className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 focus-within:border-white/30">
          <span className="text-zinc-500">$</span>
          <input type="number" min="0" step="any" inputMode="decimal" value={value.text} onChange={(e) => onChange({ ...value, text: e.target.value })} placeholder="Second price" aria-label="Second price" className="w-full bg-transparent text-base outline-none placeholder:text-zinc-500" />
        </label>
      ) : (
        <textarea rows={2} value={value.text} onChange={(e) => onChange({ ...value, text: e.target.value })} placeholder="Describe the second version of the idea…" aria-label="Second version of the idea" className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-transparent p-3 text-base outline-none placeholder:text-zinc-500 focus:border-white/30" />
      )}
      <button type="button" onClick={() => { onChange({ kind: value.kind, text: "" }); setOpen(false); }} className="mt-2 text-xs text-zinc-500 hover:text-zinc-200">Remove comparison</button>
    </fieldset>
  );
}
