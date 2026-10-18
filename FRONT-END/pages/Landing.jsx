import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Menu, Play, X } from "lucide-react";
import CountUp from "../components/CountUp";
import HowItWorks from "../components/HowItWorks";
import Logo from "../components/Logo";
import PeopleSection from "../components/PeopleSection";
import { NeedleCard, SegmentWash, segmentExtremes } from "../components/cards";
import { DEMO } from "../lib/demoResult";
import { Parallax, Reveal, ScrollScale } from "../components/motion";
import { PRODUCT_NAME } from "../brand";

const NAV = [["Why a panel", "#people"], ["How it works", "#how-it-works"], ["Demo", "#demo"]];

// true once the element has been on screen
function useInView(threshold = 0.3) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, on];
}

// the section on screen, to highlight its link in the navbar
function useActive(ids) {
  const [active, setActive] = useState("");
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)), { rootMargin: "-40% 0px -50% 0px" });
    ids.forEach((id) => { const el = document.getElementById(id); el && io.observe(el); });
    return () => io.disconnect();
  }, [ids]);
  return active;
}

function Navbar() {
  const [open, setOpen] = useState(false);
  const active = useActive(["people", "how-it-works", "demo"]);
  return (
    <header className="sticky top-3 z-40 px-3">
      <nav aria-label="Main" className="mx-auto max-w-3xl rounded-full border border-white/10 bg-bg/70 px-4 py-2 backdrop-blur-xl md:px-5">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" aria-label={`${PRODUCT_NAME} home`}><Logo /></Link>
          <ul className="hidden items-center gap-6 text-sm md:flex">
            {NAV.map(([t, h]) => <li key={h}><a href={h} className={`transition-colors ${active === h.slice(1) ? "text-zinc-50" : "text-zinc-400 hover:text-zinc-100"}`}>{t}</a></li>)}
          </ul>
          <div className="flex items-center gap-2">
            <Link to="/app" className="btn btn-accent px-5 py-2 text-sm">Test now</Link>
            <button className="btn h-9 w-9 p-0 md:hidden" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={17} /> : <Menu size={17} />}</button>
          </div>
        </div>
        {open && <ul className="mt-2 space-y-1 border-t border-white/10 pt-2 md:hidden">{NAV.map(([t, h]) => <li key={h}><a href={h} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 text-base text-zinc-300 hover:bg-white/5">{t}</a></li>)}</ul>}
      </nav>
    </header>
  );
}

// A huge headline, one line at a time sliding up from behind a mask
const Line = ({ children, d = 0 }) => <span className="block overflow-hidden pb-[0.08em]"><span className="slide-up" style={{ "--d": `${d}ms` }}>{children}</span></span>;

const EX = segmentExtremes(DEMO.segments);

function Hero() {
  return (
    <section className="relative isolate flex min-h-[calc(100svh-4rem)] flex-col overflow-hidden px-5 pb-8 pt-14 md:px-10 md:pt-20">
      {/* the brand name as a faint giant watermark, drifting at its own pace as you scroll */}
      <Parallax speed={0.18} className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 flex justify-center">
        <span aria-hidden className="translate-y-[18%] whitespace-nowrap font-display text-[clamp(6rem,24vw,24rem)] leading-none text-white/[0.045]">{PRODUCT_NAME}</span>
      </Parallax>

      <div className="mx-auto flex w-full max-w-[88rem] flex-1 flex-col">
        <h1 className="ml-auto max-w-[62rem] text-right font-display text-[clamp(2.9rem,8.4vw,8.4rem)] leading-[0.9] tracking-tight text-zinc-50">
          <Line>Test your</Line><Line d={110}>business idea</Line><Line d={220}>in <em className="text-accent not-italic">minutes</em></Line>
        </h1>
        <Reveal delay={500} className="ml-auto mt-8 flex items-center gap-5">
          <a href="#demo" className="btn hidden px-5 py-3 text-sm sm:inline-flex"><Play size={15} aria-hidden /> Watch demo</a>
          <Link to="/app" className="group flex items-center gap-4 text-base text-zinc-100">Test your idea<span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-[#0b0d02] transition-transform group-hover:translate-x-1"><ArrowRight size={22} aria-hidden /></span></Link>
        </Reveal>

        <div className="mt-auto flex flex-col gap-8 pt-14 lg:flex-row lg:items-end lg:justify-between">
          {/* The same cards as the dashboard, filled with example data (labelled) */}
          <Reveal delay={350} className="w-full max-w-4xl">
            <div className="mb-3 flex items-center justify-between gap-3"><p className="label">What a result looks like</p><span className="label rounded-full border border-white/10 px-2.5 py-1">Example data</span></div>
            <div className="grid gap-3 md:grid-cols-3">
              <NeedleCard i={0} score={DEMO.score} range={DEMO.scoreRange} mode="result" />
              <SegmentWash i={1} title="Most favorable segment" seg={EX.best} wash="wash-amber" />
              <SegmentWash i={2} title="Least favorable segment" seg={EX.worst} wash="wash-navy" />
            </div>
          </Reveal>
          <Reveal delay={600} className="text-xs leading-relaxed text-zinc-400 lg:text-right">
            <p className="flex items-center gap-2 text-zinc-300 lg:justify-end"><span className="h-1.5 w-1.5 rounded-full bg-accent" />Built from 2,058 real US consumers</p>
            <p className="mt-1 font-medium text-zinc-200">Synthetic consumer panel</p>
            <p>Built with the AMD Token Factory and Evolus</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// Facts that are true today. Only what is confirmed.
const FACTS = [
  { big: 2058, fmt: (n) => n.toLocaleString("en-US"), title: "US consumers", text: "Real survey respondents stand behind the panel." },
  { big: 3, title: "Survey datasets", text: "Twin-2K-500, GSS and ANES." },
  { big: "Hundreds", title: "Simulated people per run", text: "Each one answers as a real respondent would." },
  { big: "260M", title: "US adults", text: "Weighted to represent 260M US adults (ACS 2024). Run on an open model (DeepSeek-V4-Flash) served on AMD via Token Factory." },
];

function Facts() {
  const [ref, on] = useInView(0.35);
  return (
    <section ref={ref} className="px-5 py-24 md:px-10 md:py-32">
      <div className="mx-auto max-w-[88rem]">
        <Reveal><p className="label">The panel</p><h2 className="mt-4 font-display text-[clamp(2.3rem,5.2vw,5rem)] leading-[0.98] tracking-tight">The panel in numbers.</h2></Reveal>
        <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map((f, i) => (
            <Reveal as="li" key={f.title} delay={i * 90} className={`panel flex min-h-[15rem] flex-col rounded-[26px] p-6 ${["wash-amber", "wash-navy", "", "wash-violet"][i]}`}>
              <p className="label">{f.title}</p>
              <p className={`dot mt-5 ${typeof f.big === "number" ? "text-[clamp(2.6rem,4.6vw,4.2rem)]" : "text-[clamp(1.6rem,2.7vw,2.4rem)]"}`}>{typeof f.big === "number" ? (on ? <CountUp value={f.big} duration={1400} format={f.fmt} /> : 0) : f.big}</p>
              <p className="mt-auto pt-6 text-sm leading-relaxed text-zinc-300">{f.text}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

function DemoVideo() {
  const [ready, setReady] = useState(false);
  return (
    <div className="relative aspect-video overflow-hidden rounded-[26px] border border-white/10 bg-black">
      <video
        src="/demo.mp4" controls playsInline preload="metadata"
        onLoadedMetadata={() => setReady(true)} onError={() => setReady(false)}
        className={`absolute inset-0 h-full w-full object-cover ${ready ? "" : "pointer-events-none opacity-0"}`}
      />
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-900">
          <span className="flex h-20 w-20 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur md:h-24 md:w-24" aria-hidden>
            <Play size={30} className="ml-1" fill="currentColor" />
          </span>
          <p className="label">Demo video coming soon</p>
        </div>
      )}
    </div>
  );
}

function DemoSection() {
  return (
    <section id="demo" className="scroll-mt-8 px-5 py-24 md:px-10 md:py-32">
      <div className="mx-auto max-w-[88rem]">
        <Reveal className="mb-10 md:mb-14">
          <p className="label">Demo</p>
          <h2 className="mt-4 font-display text-[clamp(2.6rem,6.4vw,5.8rem)] leading-[0.95] tracking-tight">See it in action</h2>
        </Reveal>
        <ScrollScale><DemoVideo /></ScrollScale>
      </div>
    </section>
  );
}


function Closing() {
  return (
    <section className="relative isolate overflow-hidden px-5 pb-10 pt-24 md:px-10 md:pt-32">
      <Parallax speed={0.12} className="pointer-events-none absolute inset-x-0 bottom-10 -z-10 flex justify-end"><span aria-hidden className="translate-x-[8%] whitespace-nowrap font-display text-[clamp(6rem,23vw,22rem)] leading-none text-white/[0.04]">{PRODUCT_NAME}</span></Parallax>
      <div className="mx-auto max-w-[88rem]">
        <Reveal className="panel wash-violet rounded-[26px] p-8 md:p-14">
        <h2 className="max-w-4xl font-display text-[clamp(2.6rem,7vw,6.6rem)] leading-[0.94] tracking-tight">Find out before you build.</h2>
        <div className="mt-12 grid gap-10 lg:grid-cols-12">
          <Reveal delay={120} className="lg:col-span-5"><Link to="/app" className="btn btn-accent px-8 py-4 text-base">Test now <ArrowRight size={18} /></Link></Reveal>
          <Reveal delay={200} className="grid gap-8 sm:grid-cols-2 lg:col-span-7">
            <div><p className="label">What you bring</p><p className="mt-2 text-base leading-relaxed text-zinc-300">Your idea and who it's for, or a PDF that describes it.</p></div>
            <div><p className="label">What you get</p><p className="mt-2 text-base leading-relaxed text-zinc-300">Who would buy, at what price and why not, with an uncertainty range.</p></div>
          </Reveal>
        </div>
        </Reveal>
        <footer className="mt-28 flex flex-col items-start justify-between gap-6 border-t border-white/10 pt-8 md:flex-row md:items-center">
          <Logo />
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-500">{NAV.map(([t, h]) => <li key={h}><a href={h} className="hover:text-zinc-200">{t}</a></li>)}<li><Link to="/app" className="hover:text-zinc-200">Test now</Link></li></ul>
          <p className="text-xs text-zinc-600">Decision support based on survey data, not a guarantee of success.</p>
        </footer>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="overflow-x-clip">
      <Navbar />
      <main>
        <Hero />
        <Facts />
        <PeopleSection />
        <HowItWorks />
        <DemoSection />
      </main>
      <Closing />
    </div>
  );
}
