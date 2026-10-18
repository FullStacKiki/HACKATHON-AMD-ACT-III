import { useOutletContext } from "react-router-dom";
import DemoBar from "../components/DemoBar";
import { CompetitorsCard, FeedCard, MapCard, ObjectionsCard, SegmentsCard, WtpCard } from "../components/cards";
import { DEMO } from "../lib/demoResult";

// The Insights pages show one part of the latest results each. Same data and same placeholders as the Results page.
function Page({ group, title, children }) {
  const { demo, toggleDemo, result, history } = useOutletContext();
  const data = result ?? history[0]?.result ?? (demo ? DEMO : undefined);
  const has = !!data && Object.keys(data).some((k) => k !== "idea" && k !== "score");
  return (
    <div className="@container space-y-4 p-4 md:p-6">
      <header className="pb-1">
        <p className="label">{group}</p>
        <h1 className="mt-1 text-2xl font-medium tracking-tight md:text-3xl">{title}</h1>
      </header>
      <DemoBar demo={demo} hasData={has} onToggle={toggleDemo} />
      <div className="grid grid-cols-1 gap-4 @4xl:grid-cols-12">{children(data)}</div>
    </div>
  );
}

const ready = (l) => Array.isArray(l) && l.length > 0;

export const PersonasPage = () => (
  <Page group="Panel" title="Personas">
    {(d) => (<>
      <MapCard personas={d?.personas} mode={ready(d?.personas) ? "result" : "idle"} className="@4xl:col-span-8" />
      <FeedCard personas={d?.personas} className="@4xl:col-span-4" i={1} />
    </>)}
  </Page>
);
export const SegmentsPage = () => (
  <Page group="Insights" title="Segments">{(d) => <SegmentsCard segments={d?.segments} overall={d?.reactions?.buy} className="@4xl:col-span-6" />}</Page>
);
export const PricingPage = () => (
  <Page group="Insights" title="Pricing">{(d) => <WtpCard wtp={d?.wtp} customerPrice={d?.customerPrice} className="@4xl:col-span-12" />}</Page>
);
export const ObjectionsPage = () => (
  <Page group="Insights" title="Objections">{(d) => <ObjectionsCard objections={d?.objections} className="@4xl:col-span-7" />}</Page>
);
export const CompetitorsPage = () => (
  <Page group="Insights" title="Competitors">{(d) => <CompetitorsCard competitors={d?.competitors} className="@4xl:col-span-6" />}</Page>
);
