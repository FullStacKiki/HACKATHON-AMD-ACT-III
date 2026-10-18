import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { DEMO_EXTRACT } from "../lib/demoResult";

const MAX = 10 * 1024 * 1024; // 10 MB
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Reads a PDF into the form. It checks the file (PDF only, up to 10 MB), sends it to POST /api/extract and hands the
// extracted fields { idea, audience, price, category } to `onExtracted(file, fields, isExample)`. It never starts the simulation.
// With example data on, no request is made: the example fields come back, flagged as such.
export function usePdfExtract({ onExtracted, demo }) {
  const [phase, setPhase] = useState("idle"); // idle | loading | error
  const [error, setError] = useState({ text: "", noText: false });
  const [name, setName] = useState("");
  const ctl = useRef(null), cancelled = useRef(false);

  const fail = (text, noText = false) => { setError({ text, noText }); setPhase("error"); };

  const run = async (file) => {
    if (!file) return;
    if (!(file.type === "application/pdf" || /\.pdf$/i.test(file.name))) return fail("Only PDF files are supported.");
    if (file.size > MAX) return fail("This file is larger than 10 MB. Try a smaller PDF.");
    setName(file.name); setPhase("loading"); cancelled.current = false;
    if (demo) { await wait(900); if (!cancelled.current) { setPhase("idle"); onExtracted(file, DEMO_EXTRACT, true); } return; }
    ctl.current = new AbortController();
    const timer = setTimeout(() => ctl.current.abort(), 60000);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body, signal: ctl.current.signal });
      const json = await res.json().catch(() => null);
      if (res.status === 422 || json?.error === "no_text") return fail("This PDF has no text we can read. It may be a scan. Try describing your idea instead.", true);
      if (!res.ok || !json) throw new Error(String(res.status));
      setPhase("idle");
      onExtracted(file, json, false);
    } catch {
      if (!cancelled.current) fail("Couldn't read this PDF, try describing it instead.");
    } finally { clearTimeout(timer); }
  };

  const cancel = () => { cancelled.current = true; ctl.current?.abort(); setPhase("idle"); };
  const example = () => onExtracted({ name: "example.pdf", size: 0 }, DEMO_EXTRACT, true);
  return { phase, error, name, run, cancel, example, dismiss: () => setPhase("idle") };
}

// The "Upload a PDF" chip that sits at the bottom of the search bar (shows the progress while the PDF is being read)
export function PdfChip({ api }) {
  const input = useRef(null);
  if (api.phase === "loading") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-2 text-sm text-zinc-300" role="status">
        <Loader2 size={15} className="animate-spin text-accent" aria-hidden /><span className="max-w-[10rem] truncate">Reading {api.name}…</span>
        <button type="button" onClick={api.cancel} className="text-xs text-zinc-500 hover:text-zinc-100">Cancel</button>
      </span>
    );
  }
  return (
    <>
      <button type="button" onClick={() => input.current.click()} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-2 text-sm text-zinc-300 transition-colors hover:border-white/30 hover:text-zinc-50"><FileUp size={15} aria-hidden /> Upload a PDF</button>
      <input ref={input} type="file" accept="application/pdf,.pdf" onChange={(e) => { api.run(e.target.files?.[0]); e.target.value = ""; }} className="sr-only" aria-label="Choose a PDF file" />
    </>
  );
}
