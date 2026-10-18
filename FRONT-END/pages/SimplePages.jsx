import { Link, useOutletContext } from "react-router-dom";
import { PRODUCT_NAME } from "../brand";

function Page({ label, title, children }) {
  return (
    <div className="space-y-5 p-5 md:p-9">
      <header>
        <p className="label">{label}</p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight md:text-4xl">{title}</h1>
      </header>
      {children}
    </div>
  );
}

export function SettingsPage() {
  const { clearAll } = useOutletContext();
  return (
    <Page label="Settings" title="Settings">
      <section className="panel panel-lg veil veil-amber max-w-xl space-y-4 p-6 md:p-8">
        <h2 className="text-lg font-medium">Saved simulations</h2>
        <p className="text-sm leading-relaxed text-zinc-400">{PRODUCT_NAME} keeps your simulations in this browser only. Clearing them leaves the list empty.</p>
        <button className="btn" onClick={clearAll}>Clear saved simulations</button>
      </section>
      <p className="label"><Link to="/" className="underline underline-offset-4">Back to the landing page</Link></p>
    </Page>
  );
}
