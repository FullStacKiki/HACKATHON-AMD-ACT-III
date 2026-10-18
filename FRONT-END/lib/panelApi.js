// The real panel (backend: POST /api/panel starts a run, GET /api/panel/{jobId} reports it). A run takes minutes, so it is polled.
// The result is { status: "done", example_data, result, notice }: with example_data true there is no result and the caller shows its own
// example data under the "Example data" banner.
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
});

export async function runPanel(req, { signal, onProgress } = {}) {
  const r = await fetch("/api/panel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req), signal });
  if (!r.ok) throw new Error(`The backend answered ${r.status}`);
  const { jobId } = await r.json();
  for (;;) {
    await sleep(3000, signal);
    const s = await fetch(`/api/panel/${jobId}`, { signal });
    if (!s.ok) throw new Error(`The backend answered ${s.status}`);
    const job = await s.json();
    onProgress?.(job.progress);
    if (job.status === "done") return job;
  }
}
