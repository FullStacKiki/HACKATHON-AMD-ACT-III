// The Quorum demo video. 1920x1080, 60 fps.
//   1 hook  2 problem  3 solution (the simulation starts, the people answer)  4 proof (our own components)  5 closing
// One idea per shot, 2 to 4 seconds each. One camera style (slow push-in, slight 3D tilt, always the same way) and one transition everywhere.
// Text is only subtitles. Charts and cards are our React components rendered here; the app clips are 2560x1440 and never scaled past 1:1.
// Cuts land on the beat of audio.json (bpm). If video/public/music.mp3 exists, music and light sound effects are added (see render.mjs).
import { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Easing, Freeze, OffthreadVideo, Sequence, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { CameraMotionBlur } from "@remotion/motion-blur";
import { MemoryRouter } from "react-router-dom";
import { LogoMark } from "../components/Logo";
import { CompareCard, FeedCard, IconActions, NeedleCard, ObjectionsCard, SegmentWash, SegmentsCard, WtpCard, segmentExtremes } from "../components/cards";
import { DEMO, DEMO_EXTRACT } from "../lib/demoResult";
import { PRODUCT_NAME } from "../brand";
import MARKS from "./marks.json";
import AUDIO from "./audio.json";

export const FPS = 60;
const f2 = (s) => Math.round(s * FPS);
const B = MARKS.boxes, M = MARKS.marks;
const BEAT = 60 / AUDIO.bpm;
const snap = (sec) => Math.max(1, Math.round(sec / BEAT)) * BEAT; // shot lengths are whole beats
const smooth = Easing.bezier(0.25, 0.1, 0.25, 1);               // every move uses this curve or a spring, never a straight line
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const prog = (f, a, b) => smooth(clamp01((f - a) / (b - a)));
const lerp = (a, b, p) => a + (b - a) * p;
const DISPLAY = '"Bricolage Grotesque", Inter, sans-serif';

// ---- The shots -------------------------------------------------------------------------------------------------
// kind clip: a recording, everything dimmed and blurred except `focus`; at is the second in the recording, focus a box in 1920x1080 CSS pixels.
const grow = (b, l, t, r, bt) => ({ x: b.x - l, y: b.y - t, w: b.w + l + r, h: b.h + t + bt });
const SHOTS = [
  { id: "hook", act: 1, kind: "still", dur: 3, say: "Validating an idea takes weeks.", pill: true },
  { id: "wait", act: 2, kind: "wait", dur: 3.5, say: "Real feedback is slow." },
  { id: "chat", act: 2, kind: "clip", dur: 3.5, at: M.compare + 0.3, focus: B.compare, say: "One chatbot gives one opinion." },
  { id: "landing", act: 3, kind: "clip", dur: 3, at: M.hero + 0.4, focus: grow(B.hero, 40, 20, 40, 120), say: "Quorum simulates a real panel." },
  { id: "people", act: 3, kind: "clip", dur: 3, at: M.people + 0.3, focus: B.people, say: "Built from real survey respondents." },
  { id: "intake", act: 3, kind: "clip", dur: 3, at: M.pdf - 0.2, focus: B.form, say: "Start from a PDF or text." },
  { id: "scan", act: 3, kind: "clip", dur: 3, at: M.scan - 3.2, focus: { x: 520, y: 140, w: 1180, h: 680 }, say: "Then the simulation starts." },
  { id: "dots", act: 3, kind: "clip", dur: 3.5, at: M.dots - 0.7, focus: B.map, say: "Every dot is a person answering." },
  { id: "buy", act: 4, kind: "cards", dur: 3.5, say: "The share that would buy." },
  { id: "gauge", act: 4, kind: "cards", dur: 3, say: "One viability score." },
  { id: "curve", act: 4, kind: "cards", dur: 3.5, say: "Demand, price by price." },
  { id: "segments", act: 4, kind: "cards", dur: 4, say: "Who says yes, and who does not." },
  { id: "feed", act: 4, kind: "cards", dur: 4, say: "What people actually said." },
  { id: "objections", act: 4, kind: "cards", dur: 3.5, say: "The objections that come up most." },
  { id: "compare", act: 4, kind: "cards", dur: 3, say: "Compare two versions side by side." },
  { id: "briefing", act: 4, kind: "cards", dur: 4, say: "Download a one-page briefing." },
  { id: "close1", act: 5, kind: "close", dur: 4, say: "Test your idea in minutes." },
  { id: "close2", act: 5, kind: "close", dur: 4, say: "Built on AMD Instinct + ROCm." },
];
let cursor = 0;
export const PLACED = SHOTS.map((s) => { const dur = f2(snap(s.dur)); const p = { ...s, from: cursor, dur }; cursor += dur; return p; });
export const TOTAL_FRAMES = cursor;
// Subtitle rules, checked at build time: at most 8 words, on screen at least 1 second per 3 words.
PLACED.forEach((s) => {
  const words = s.say.split(/\s+/).length;
  if (words > 8) throw new Error(`Subtitle too long (${words} words): ${s.say}`);
  if ((s.dur - f2(0.75)) / FPS < words / 3) throw new Error(`Subtitle on screen too briefly: ${s.say}`);
});
const BG_AT = M.results + 0.6; // a still of the results page: the blurred dashboard behind the cards

// ---- Pieces ---------------------------------------------------------------------------------------------------
const GRAIN = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";
const Backdrop = () => (
  <AbsoluteFill style={{ background: "#0a0a0a" }}>
    <AbsoluteFill style={{ background: "radial-gradient(60% 50% at 50% 55%, rgba(198,241,53,.07), transparent 70%)" }} />
    <AbsoluteFill style={{ backgroundImage: GRAIN, opacity: 0.07, mixBlendMode: "screen" }} />
  </AbsoluteFill>
);

// The one transition: a quick push through blur. The camera motion blur is switched on only around it.
const Through = ({ dur, children }) => {
  const f = useCurrentFrame();
  const a = prog(f, 0, 14), o = prog(f, dur - 12, dur);
  return (
    <AbsoluteFill style={{ opacity: a * (1 - o), transform: `scale(${lerp(1.16, 1, a) * lerp(1, 1.1, o)})`, filter: `blur(${(1 - a) * 12 + o * 10}px)` }}>
      {children}
    </AbsoluteFill>
  );
};
const Blurred = ({ dur, children }) => {
  const f = useCurrentFrame();
  const moving = f < 18 || f > dur - 16;
  return <CameraMotionBlur samples={moving ? 4 : 1} shutterAngle={150}><Through dur={dur}>{children}</Through></CameraMotionBlur>;
};

// Subtitle: always at the same place, black at 85%, white Inter 36px.
const Say = ({ text, dur }) => {
  const f = useCurrentFrame();
  const o = prog(f, f2(0.4), f2(0.4) + 10) * (1 - prog(f, dur - f2(0.35) - 10, dur - f2(0.35)));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 56, display: "flex", justifyContent: "center", zIndex: 9, opacity: o }}>
      <div style={{ background: "rgba(0,0,0,.85)", borderRadius: 8, padding: "12px 26px", color: "#fff", fontFamily: "Inter, sans-serif", fontWeight: 500, fontSize: 36, lineHeight: 1.3, maxWidth: 1400, textAlign: "center" }}>{text}</div>
    </div>
  );
};
const Pill = () => (
  <div style={{ position: "absolute", left: 40, bottom: 62, border: "1px dashed rgba(255,255,255,.4)", borderRadius: 999, padding: "9px 20px", fontSize: 22, color: "#e4e4e7", background: "rgba(0,0,0,.85)", zIndex: 9, fontFamily: "Inter, sans-serif" }}>
    Example data, not real results
  </div>
);

// A recording (2560x1440) laid out at 1920x1080 so the frames keep their sharpness.
const Rec = ({ from, freeze = false, style }) => {
  const v = <OffthreadVideo src={staticFile("clip.mp4")} startFrom={f2(from)} muted style={{ width: 2560, height: 1440, display: "block" }} />;
  return (
    <div style={{ width: 1920, height: 1080, overflow: "hidden", position: "relative", background: "#0a0a0a", ...style }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 2560, height: 1440, transformOrigin: "0 0", transform: "scale(0.75)" }}>{freeze ? <Freeze frame={0}>{v}</Freeze> : v}</div>
    </div>
  );
};

// The camera: slow push-in and a slight tilt, the same way in every shot. The scale is large enough that a tilted screen always covers the frame.
const Stage = ({ dur, children }) => {
  const f = useCurrentFrame();
  const p = prog(f, 0, dur);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#0a0a0a" }}>
      <div style={{ position: "absolute", inset: 0, transform: `perspective(2000px) rotateY(${lerp(-3, -5, p)}deg) rotateX(${lerp(1, 2, p)}deg) scale(${lerp(1.15, 1.21, p)})` }}>{children}</div>
    </div>
  );
};

// Everything is dimmed and blurred except the element the subtitle is about.
const FocusClip = ({ s }) => {
  const pad = 18;
  const x = Math.max(0, s.focus.x - pad), y = Math.max(0, s.focus.y - pad);
  const w = Math.min(1920 - x, s.focus.w + pad * 2), h = Math.min(1080 - y, s.focus.h + pad * 2);
  return (
    <>
      <Stage dur={s.dur}>
        <div style={{ position: "absolute", inset: 0, filter: "blur(7px) brightness(0.36)" }}><Rec from={s.at} /></div>
        <div style={{ position: "absolute", left: x, top: y, width: w, height: h, overflow: "hidden", borderRadius: 22, boxShadow: "0 0 0 1px rgba(255,255,255,.14), 0 40px 90px rgba(0,0,0,.65)" }}>
          <div style={{ position: "absolute", left: -x, top: -y }}><Rec from={s.at} /></div>
        </div>
      </Stage>
      <Pill />
      <Say text={s.say} dur={s.dur} />
    </>
  );
};

const StillShot = ({ s }) => (
  <>
    <Stage dur={s.dur}><div style={{ position: "absolute", inset: 0, filter: "blur(8px) brightness(0.4)" }}><Rec from={BG_AT} freeze /></div></Stage>
    <Pill />
    <Say text={s.say} dur={s.dur} />
  </>
);

// The problem, as a screen that is still empty: boxes that wait.
const WaitShot = ({ s }) => {
  const f = useCurrentFrame();
  const p = prog(f, 0, s.dur);
  return (
    <>
      <Backdrop />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", transform: `perspective(2000px) rotateY(${lerp(-3, -5, p)}deg) rotateX(${lerp(1, 2, p)}deg) scale(${lerp(1, 1.06, p)})` }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 380px)", gridTemplateRows: "repeat(2, 300px)", gap: 28 }}>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const sweep = prog((f + i * 14) % 150, 0, 150);
            return <div key={i} style={{ borderRadius: 28, border: "2px solid rgba(255,255,255,.22)", background: `linear-gradient(105deg, rgba(255,255,255,.03) ${sweep * 140 - 40}%, rgba(255,255,255,.10) ${sweep * 140 - 20}%, rgba(255,255,255,.03) ${sweep * 140}%)` }} />;
          })}
        </div>
      </AbsoluteFill>
      <Say text={s.say} dur={s.dur} />
    </>
  );
};

// Real animations (counters, charts) take a moment to settle; hold the render until they have, once per mount.
const Settle = ({ ms = 2400, children }) => {
  const [h] = useState(() => delayRender("settle"));
  useEffect(() => { const t = setTimeout(() => continueRender(h), ms); return () => clearTimeout(t); }, [h, ms]);
  return children;
};
const NO_MOTION = ".rise,.page-in,.slide-up{animation:none!important} *{transition:none!important}";
const SHADOW = "drop-shadow(0 50px 50px rgba(0,0,0,.55)) drop-shadow(0 14px 18px rgba(0,0,0,.4))";
const ex = segmentExtremes(DEMO.segments);
const Hero = () => {
  const buy = DEMO.reactions?.buy, iv = DEMO.buyInterval;
  return (
    <div>
      <p className="label">Would buy <span className="text-zinc-600">&middot;</span> <span className="text-zinc-500">{DEMO_EXTRACT.idea}</span></p>
      <p className="dot mt-3 text-[7.5rem] leading-none" style={{ color: "var(--text)" }}>{Math.round(buy)}%</p>
      <p className="label mt-3">{`Interval ${Math.round(iv.low)}% to ${Math.round(iv.high)}%`}</p>
    </div>
  );
};

// Our components as separate layers in one 1200px perspective. Every layer leans the same way, at its own depth, with its own soft shadow;
// they come in a few frames apart and the vanishing point drifts slowly, so the layers shift against each other.
// w and h are the size a layer is laid out at, z how much it is scaled up (vector, so it stays sharp).
const CARDS = {
  buy: { z: 1.9, gap: 0, items: [{ w: 720, h: 230, ry: -8, rx: 4, tz: 40, el: () => <Hero /> }] },
  gauge: { z: 1.6, gap: 0, items: [{ w: 320, h: 440, ry: -8, rx: 4, tz: 40, el: () => <NeedleCard score={DEMO.score} range={DEMO.scoreRange} previous={DEMO.previous?.score} mode="result" /> }] },
  curve: { z: 1.7, gap: 0, items: [{ w: 660, h: 440, ry: -7, rx: 4, tz: 40, el: () => <WtpCard wtp={DEMO.wtp} views={DEMO.wtpViews} customerPrice={DEMO.customerPrice} /> }] },
  segments: { z: 2.2, gap: 72, items: [
    { w: 300, h: 260, ry: -10, rx: 6, tz: 90, el: () => <SegmentWash title="Most favorable segment" seg={ex?.best} wash="wash-amber" /> },
    { w: 300, h: 260, ry: -7, rx: 4, tz: -40, el: () => <SegmentWash title="Least favorable segment" seg={ex?.worst} wash="wash-navy" /> },
  ] },
  feed: { z: 1.5, gap: 0, items: [{ w: 520, h: 531, ry: -8, rx: 4, tz: 40, el: () => <FeedCard personas={DEMO.personas} /> }] },
  objections: { z: 1.5, gap: 0, items: [{ w: 440, h: 531, ry: -8, rx: 4, tz: 40, el: () => <ObjectionsCard objections={DEMO.objections} /> }] },
  compare: { z: 2, gap: 0, items: [{ w: 400, h: 300, ry: -8, rx: 4, tz: 40, el: () => <CompareCard compare={DEMO.compare} /> }] },
  briefing: { z: 1, gap: 90, items: [
    { w: 190, h: 76, ry: -10, rx: 6, tz: 120, scale: 2.2, el: () => <IconActions onBriefing={() => {}} /> },
    { w: 590, h: 834, ry: -7, rx: 4, tz: -30, el: () => <img src={staticFile("briefing.png")} style={{ width: 590, height: 834, objectFit: "contain", background: "#fff", borderRadius: 6, display: "block" }} /> },
  ] },
};
const CardsShot = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { z, gap, items } = CARDS[s.id];
  const sizes = items.map((c) => ({ w: c.w * (c.scale ?? z), h: c.h * (c.scale ?? z) }));
  const total = sizes.reduce((t, c) => t + c.w, 0) + gap * (items.length - 1);
  const drift = prog(f, 0, s.dur);
  let x = 960 - total / 2;
  return (
    <>
      <Backdrop />
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", opacity: 0.32, filter: "blur(9px)" }}>
        <div style={{ width: 1920, height: 1080, transformOrigin: "50% 50%", transform: `scale(${lerp(1.12, 1.2, drift)})` }}><Rec from={BG_AT} freeze /></div>
      </div>
      <style>{NO_MOTION}</style>
      <div style={{ position: "absolute", inset: 0, perspective: 1200, perspectiveOrigin: `${lerp(44, 56, drift)}% 42%` }}>
        <MemoryRouter><Settle>
          {items.map((c, i) => {
            const left = x; x += sizes[i].w + gap;
            const p = spring({ frame: f - 2 - i * 10, fps, config: { damping: 22, stiffness: 90 } });
            const sc = c.scale ?? z;
            return (
              <div key={i} style={{ position: "absolute", left, top: 440 - sizes[i].h / 2, width: sizes[i].w, height: sizes[i].h, opacity: p, transform: `translate3d(0, ${(1 - p) * 50}px, ${lerp(-320, c.tz, p) + drift * 30}px) rotateY(${c.ry}deg) rotateX(${c.rx}deg)`, filter: SHADOW }}>
                <div style={{ width: c.w, height: c.h, transformOrigin: "0 0", transform: `scale(${sc})` }} className="text-zinc-100">{c.el()}</div>
              </div>
            );
          })}
        </Settle></MemoryRouter>
      </div>
      <Pill />
      <Say text={s.say} dur={s.dur} />
    </>
  );
};

const CloseShot = ({ s }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - 4, fps, config: { damping: 20, stiffness: 80 } });
  const d = prog(f, 0, s.dur);
  return (
    <>
      <Backdrop />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", color: "#ededeb", transform: `perspective(2000px) rotateY(${lerp(-3, -5, d)}deg) rotateX(${lerp(1, 2, d)}deg) scale(${lerp(1, 1.06, d)})` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28, opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
          <LogoMark size={120} />
          <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 132, letterSpacing: -2 }}>{PRODUCT_NAME}</span>
        </div>
      </AbsoluteFill>
      <Say text={s.say} dur={s.dur} />
    </>
  );
};

const Shot = ({ s }) => (s.kind === "clip" ? <FocusClip s={s} /> : s.kind === "still" ? <StillShot s={s} /> : s.kind === "wait" ? <WaitShot s={s} /> : s.kind === "cards" ? <CardsShot s={s} /> : <CloseShot s={s} />);

// ---- Sound (only with video/public/music.mp3, see render.mjs) --------------------------------------------------
const Sound = () => {
  const { durationInFrames } = useVideoConfig();
  const first = (act) => PLACED.find((s) => s.act === act);
  const vol = (f) => AUDIO.musicVolume * Math.min(1, f / FPS) * Math.min(1, (durationInFrames - f) / f2(1.5));
  return (
    <>
      <Audio src={staticFile("music.mp3")} volume={vol} startFrom={f2(AUDIO.firstBeat ?? 0)} />
      {[2, 3, 4].map((act) => <Sequence key={act} from={first(act).from}><Audio src={staticFile("sfx/whoosh.wav")} volume={AUDIO.sfxVolume} /></Sequence>)}
      {PLACED.filter((s) => s.act === 4).map((s) => <Sequence key={s.id} from={s.from + 6}><Audio src={staticFile("sfx/tick.wav")} volume={AUDIO.sfxVolume * 0.6} /></Sequence>)}
      <Sequence from={first(5).from}><Audio src={staticFile("sfx/hit.wav")} volume={AUDIO.sfxVolume} /></Sequence>
    </>
  );
};

export const Demo = ({ music = false }) => (
  <AbsoluteFill style={{ background: "#0a0a0a" }}>
    {PLACED.map((s) => <Sequence key={s.id} from={s.from} durationInFrames={s.dur}><Blurred dur={s.dur}><Shot s={s} /></Blurred></Sequence>)}
    {music && <Sound />}
  </AbsoluteFill>
);
