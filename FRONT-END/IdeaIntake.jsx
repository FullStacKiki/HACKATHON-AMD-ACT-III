// IdeaIntake.jsx
// Setup: Tailwind CSS enabled, no extra packages.
// Usage: <IdeaIntake data={apiPayload} onDone={({ idea, ...data }) => save(...)} renderResults={({ idea, data, mode, status }) => <Results ... />} />
// The page starts as a single search bar. Once the idea is sent the bar goes away and `renderResults` takes over:
// it is called with mode "scan" while the analysis runs (the needle sweeps and the map shows a moving light) and
// with mode "result" when it is done. At that moment `onDone` is called by itself, with the idea and the API payload.
//
// Right now the processing is simulated with a timeline (STEPS below) that only drives the status text and the moment
// the analysis counts as done. To wire the real backend: send the idea to your API, pass the response as `data`,
// and call setLabel / setPhase("done") when it answers. No number on screen is invented: all of them come from `data`.
import { useEffect, useRef, useState } from "react";
import { FileText, TriangleAlert, X } from "lucide-react";
import CompareField from "./components/CompareField";
import { PdfChip, usePdfExtract } from "./components/PdfUpload";
import { DEMO } from "./lib/demoResult";
import { runPanel } from "./lib/panelApi";

const STEPS = [
  { at: 500, label: "Reading your idea" },
  { at: 1500, label: "Asking the panel" },
  { at: 3400, label: "Collecting reactions" },
  { at: 5200, label: "Looking for objections" },
  { at: 7000, label: "Estimating willingness to pay" },
  { at: 8800, label: "Analysis complete", done: true },
];

const Field = ({ label, children }) => <label className="block"><span className="label mb-1.5 block">{label}</span>{children}</label>;
const inputCls = "w-full rounded-xl border border-white/10 bg-transparent px-3 py-2.5 text-base text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-white/30";

export default function IdeaIntake({ onDone, data, renderResults, demo = false, initialIdea = "", onRunChange, onExample }) {
  const [drag, setDrag] = useState(false);
  const [pdf, setPdf] = useState(null); // { name, size, example } once the PDF has been read
  const [audience, setAudience] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [compare, setCompare] = useState({ kind: "idea", text: "" });
  const [idea, setIdea] = useState(initialIdea);
  const [live, setLive] = useState(null); // the payload of a real panel run
  const [notice, setNotice] = useState(""); // why example data is shown instead of a real run
  const [formError, setFormError] = useState("");
  const abort = useRef(null);
  const pdfApi = usePdfExtract({
    demo,
    onExtracted: (file, f, example) => { setPdf({ name: file.name, size: file.size, example }); setIdea(f.idea ?? ""); setAudience(f.audience ?? ""); setPrice(f.price != null ? String(f.price) : ""); setCategory(f.category ?? ""); },
  });
  const [phase, setPhase] = useState("idle"); // idle | running | done
  const [label, setLabel] = useState("");
  const timers = useRef([]);
  const startedAt = useRef(0);

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    abort.current?.abort(); abort.current = null;
    setPhase("idle"); setLabel(""); setLive(null); setNotice("");
  };

  const fallBack = (why) => { onExample?.(); setLive(DEMO); setNotice(why); setLabel("Showing example data"); setPhase("done"); };

  const start = (e) => {
    e?.preventDefault();
    if (!idea.trim() || phase === "running") return;
    if (!demo && (!audience.trim() || !category.trim() || !(Number(price) > 0))) {
      setFormError("To run the real panel, fill in the target audience, the category and the price. Or turn on example data.");
      return;
    }
    setFormError("");
    reset();
    startedAt.current = Date.now();
    setPhase("running");
    if (demo) {
      STEPS.forEach((s) =>
        timers.current.push(setTimeout(() => {
          setLabel(s.label);
          if (s.done) setPhase("done");
        }, s.at))
      );
      return;
    }
    // The real panel: the survey is designed, then the people answer. If anything fails, example data under the banner.
    const ctl = new AbortController();
    abort.current = ctl;
    setLabel("Designing the survey");
    runPanel({ pitch: idea.trim(), audience: audience.trim(), category: category.trim(), price: Number(price) }, {
      signal: ctl.signal,
      onProgress: (p) => p && p.done > 0 && setLabel(`Asking the panel: ${p.done} of ${p.total} people`),
    }).then((job) => {
      if (job.example_data || !job.result) return fallBack(job.notice || "The panel could not be run right now.");
      setLive(job.result); setLabel("Analysis complete"); setPhase("done");
    }).catch((err) => { if (err.name !== "AbortError") fallBack("The backend could not be reached."); });
  };

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // The analysis reports itself as soon as it is done: no "View results" click.
  useEffect(() => {
    if (phase === "done") onDone?.({ idea, ...(live ?? data), request: { audience, price, category, compare: compare.text ? compare : null, source: pdf ? "pdf" : "text" } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const running = phase === "running";
  useEffect(() => { onRunChange?.(running ? { idea, label, startedAt: startedAt.current, cancel: reset } : null); }, [running, label]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onRunChange?.(null), []); // eslint-disable-line react-hooks/exhaustive-deps
  const mode = running ? "scan" : phase === "done" ? "result" : "idle";

  return (
    <div className={`px-4 py-6 text-zinc-100 md:px-8 md:py-10 ${phase === "idle" ? "flex min-h-[calc(100svh-1.5rem)] items-center" : ""}`}>
      <div className="mx-auto w-full max-w-6xl">
        {phase === "idle" ? (
          <div className="space-y-6">
            <header className="text-center">
              <h1 className="text-3xl font-medium tracking-tight md:text-5xl">What's your business idea?</h1>
              <p className="mt-3 text-base text-zinc-400 md:text-lg">Describe it or drop a PDF on the bar. A synthetic panel of US consumers will react to it.</p>
            </header>

            <form onSubmit={start} className="mx-auto max-w-3xl space-y-4">
              {/* One bar for everything: type the idea, or drop a PDF on it, or use the chip at the bottom */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); pdfApi.run(e.dataTransfer.files?.[0]); }}
                className={`panel p-3 transition-colors focus-within:border-white/25 ${drag ? "border-accent bg-accent/[0.05]" : ""}`}
              >
                <label htmlFor="idea" className="sr-only">Your business idea</label>
                <textarea
                  id="idea" rows={2} value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) start(e); }}
                  placeholder={drag ? "Drop the PDF here" : "Example: An app that connects students with local home cooks..."}
                  className="w-full resize-none rounded-xl bg-transparent p-2 text-base text-zinc-100 outline-none placeholder:text-zinc-500"
                />
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 px-1">
                  <PdfChip api={pdfApi} />
                  <button type="submit" disabled={!idea.trim()} className="btn btn-accent">Analyze idea</button>
                </div>
              </div>

              {pdfApi.phase === "error" && (
                <p className="flex items-start gap-2.5 rounded-2xl border border-warn/40 px-4 py-3 text-sm text-zinc-200" role="alert">
                  <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />
                  <span className="flex-1">{pdfApi.error.text}</span>
                  <button type="button" onClick={pdfApi.dismiss} className="text-zinc-500 hover:text-zinc-100" aria-label="Dismiss"><X size={14} /></button>
                </p>
              )}

              {formError && <p className="flex items-start gap-2.5 rounded-2xl border border-warn/40 px-4 py-3 text-sm text-zinc-200" role="alert"><TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden /><span className="flex-1">{formError}</span></p>}

              {pdf ? (
                <div className="panel space-y-4 p-5">
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2.5">
                    <span className="flex min-w-0 items-center gap-2 text-sm text-zinc-200"><FileText size={16} className="shrink-0 text-zinc-400" aria-hidden /><span className="truncate">{pdf.name}</span>{pdf.size > 0 && <span className="label shrink-0">{pdf.size < 1048576 ? `${Math.max(1, Math.round(pdf.size / 1024))} KB` : `${(pdf.size / 1048576).toFixed(1)} MB`}</span>}</span>
                    <button type="button" onClick={() => { setPdf(null); setIdea(""); setAudience(""); setPrice(""); setCategory(""); }} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100"><X size={13} aria-hidden /> Remove</button>
                  </div>
                  {pdf.example
                    ? <p className="rounded-xl border border-dashed border-white/20 px-3 py-2.5 text-sm text-zinc-300"><span className="font-medium text-zinc-100">Example data.</span> These fields are made up, not read from your file.</p>
                    : <p className="text-sm text-zinc-400">We read these from your PDF. The idea is in the bar above. Check everything and edit what you need before you run the analysis.</p>}
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Target audience"><input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Not found in the PDF" className={inputCls} /></Field>
                    <Field label="Category"><input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Not found in the PDF" className={inputCls} /></Field>
                    <Field label="Price"><div className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 focus-within:border-white/30"><span className="text-zinc-500">$</span><input type="number" min="0" step="any" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Not found" className="w-full bg-transparent text-base text-zinc-100 outline-none placeholder:text-zinc-500" /></div></Field>
                  </div>
                </div>
              ) : (
                <div className="space-y-3"><p className="px-1 text-xs text-zinc-500">PDF only, up to 10 MB. You can also drop it on the bar. <button type="button" onClick={pdfApi.example} className="underline underline-offset-4 hover:text-zinc-200">No PDF at hand? Try it with example data</button></p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Target audience"><input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Who is it for?" className={inputCls} /></Field>
                    <Field label="Category"><input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="For example, food and beverage" className={inputCls} /></Field>
                    <Field label="Price (US dollars)"><div className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 focus-within:border-white/30"><span className="text-zinc-500">$</span><input type="number" min="0" step="any" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="9" className="w-full bg-transparent text-base text-zinc-100 outline-none placeholder:text-zinc-500" /></div></Field>
                  </div>
                </div>
              )}
              <CompareField value={compare} onChange={setCompare} />
            </form>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex justify-end">
              <button type="button" onClick={reset} className="btn">{running ? "Cancel" : "New idea"}</button>
            </div>
            {notice && <p className="rounded-2xl border border-dashed border-white/20 px-4 py-3 text-sm text-zinc-300" role="status">{notice} The numbers below are made up.</p>}
            {renderResults?.({ idea, data: live ?? data, mode, status: label })}
          </div>
        )}
      </div>
    </div>
  );
}
