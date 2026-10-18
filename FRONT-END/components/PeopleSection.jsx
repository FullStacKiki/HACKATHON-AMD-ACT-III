import { Check, X } from "lucide-react";
import { Reveal } from "./motion";

// Illustrative personas, not real respondents. They answer the same question to show that people disagree.
const QUESTION = "Would you buy this at $9.99/week?";
const PERSONAS = [
  { age: 24, income: "$35k", state: "Ohio", politics: "Democrat", answer: "Yes", why: "Cheaper than what I spend on lunch." },
  { age: 58, income: "$92k", state: "Texas", politics: "Republican", answer: "No", why: "I don't pay weekly for anything." },
  { age: 41, income: "$68k", state: "Georgia", politics: "Independent", answer: "Maybe", why: "Only if I can cancel any time." },
  { age: 33, income: "$120k", state: "California", politics: "Republican", answer: "Yes", why: "It would save me an hour a week." },
  { age: 67, income: "$48k", state: "Florida", politics: "Democrat", answer: "No", why: "That adds up to too much a year." },
  { age: 29, income: "$55k", state: "Michigan", politics: "Independent", answer: "Maybe", why: "I'd try a free week first." },
  { age: 46, income: "$78k", state: "Pennsylvania", politics: "Republican", answer: "No", why: "I already have something like it." },
  { age: 22, income: "$28k", state: "Arizona", politics: "Independent", answer: "Yes", why: "Looks worth it for a student." },
];
const ANSWER = { Yes: "var(--lime)", Maybe: "var(--amber)", No: "var(--warn)" };
const WASH = { 0: "wash-navy", 2: "wash-amber", 5: "wash-violet" }; // a few cards get a colour wash, the rest stay monochrome
const TALLY = ["Yes", "Maybe", "No"].map((a) => ({ a, n: PERSONAS.filter((p) => p.answer === a).length }));

const CHATBOT = ["One opinion", "Tends to be optimistic", "No idea who it represents"];
const QUORUM = ["Hundreds of answers", "From profiles of real survey respondents", "A model fine-tuned only for this task, on AMD Instinct MI300X", "Trained on real answers, including the \u201cno\u201d"];

function List({ items, good }) {
  const Icon = good ? Check : X;
  return (
    <ul className="mt-5 space-y-3">
      {items.map((t) => (
        <li key={t} className="flex gap-2.5 text-sm leading-snug text-zinc-300">
          <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${good ? "bg-accent text-[#0b0d02]" : "border border-white/20 text-zinc-500"}`}><Icon size={12} strokeWidth={2.5} aria-hidden /></span>{t}
        </li>
      ))}
    </ul>
  );
}

export default function PeopleSection() {
  return (
    <section id="people" className="scroll-mt-8 px-5 py-24 md:px-10 md:py-32">
      <div className="mx-auto max-w-[88rem]">
        <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-6 md:mb-14">
          <h2 className="max-w-3xl font-display text-[clamp(2.3rem,5.4vw,5rem)] leading-[0.98] tracking-tight">Not one chatbot. Hundreds of people.</h2>

        </Reveal>

        <div className="grid gap-4 lg:grid-cols-12">
          {/* The tally of the eight answers */}
          <Reveal className="panel wash-navy flex flex-col rounded-[26px] p-6 lg:col-span-4">
            <div className="flex items-start justify-between gap-3"><p className="label">Same question, {PERSONAS.length} people</p><span className="label rounded-full border border-white/10 px-2.5 py-1">Example personas</span></div>
            <p className="mt-4 font-display text-2xl leading-snug text-zinc-50">&ldquo;{QUESTION}&rdquo;</p>
            <div className="mt-6 flex h-1.5 overflow-hidden rounded-full bg-white/[0.07]" role="img" aria-label={TALLY.map((t) => `${t.n} ${t.a}`).join(", ")}>
              {TALLY.map((t) => <div key={t.a} className="h-full" style={{ width: `${(t.n / PERSONAS.length) * 100}%`, background: ANSWER[t.a] }} />)}
            </div>
            <ul className="mt-auto grid grid-cols-3 gap-3 pt-8">
              {TALLY.map((t) => (
                <li key={t.a}>
                  <p className="dot text-6xl" style={{ color: ANSWER[t.a] }}>{t.n}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-300"><span className="h-2 w-2 rounded-full" style={{ background: ANSWER[t.a] }} />{t.a}</p>
                </li>
              ))}
            </ul>
          </Reveal>

          {/* Eight people, eight answers */}
          <ul className="grid gap-4 sm:grid-cols-2 lg:col-span-8 xl:grid-cols-4">
            {PERSONAS.map((p, i) => (
              <Reveal as="li" key={i} delay={(i % 4) * 80} className={`panel flex min-h-[13rem] flex-col rounded-[26px] p-5 ${WASH[i] ?? ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="label">{p.age} &middot; {p.state}</p>
                  <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-zinc-100"><span className="h-1.5 w-1.5 rounded-full" style={{ background: ANSWER[p.answer] }} />{p.answer}</span>
                </div>
                <p className="mt-4 text-[15px] leading-snug text-zinc-100">&ldquo;{p.why}&rdquo;</p>
                <div className="mt-auto flex flex-wrap gap-1.5 pt-5">
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-zinc-400">{p.income}</span>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-zinc-400">{p.politics}</span>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-3">
          <Reveal className="panel rounded-[26px] p-6"><h3 className="font-display text-3xl text-zinc-100">A general chatbot</h3><List items={CHATBOT} /></Reveal>
          <Reveal delay={90} className="panel wash-violet rounded-[26px] border-accent/40 p-6"><h3 className="font-display text-3xl text-zinc-100">Quorum</h3><List items={QUORUM} good /></Reveal>
          {/* Evaluation numbers stay [TBD] until the evaluation is done */}
          <Reveal delay={180} className="panel wash-amber flex flex-col rounded-[26px] p-6">
            <p className="label">Accuracy on products it never saw</p>
            <div className="mt-auto grid grid-cols-3 gap-3 pt-6">
              {[["[TBD]%", "Quorum"], ["[TBD]%", "A general model"], ["84.4%", "Human ceiling"]].map(([v, l]) => (
                <div key={l}><p className="num text-xl font-semibold text-zinc-50 md:text-2xl">{v}</p><p className="mt-1 text-xs text-zinc-400">{l}</p></div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
