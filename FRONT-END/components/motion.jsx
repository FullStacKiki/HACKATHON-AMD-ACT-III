import { useEffect, useRef, useState } from "react";

const prefersReduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));

// Fades, un-blurs and lifts its children the first time they scroll into view.
export function Reveal({ as: Tag = "div", delay = 0, className = "", children, ...rest }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setOn(true); io.disconnect(); }
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={`reveal ${on ? "in" : ""} ${className}`} style={{ "--d": `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  );
}

// Runs `fn(el, rect, vh)` on scroll and resize, once per animation frame.
function useScrollFrame(ref, fn) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const run = () => { raf = 0; fn(el, el.getBoundingClientRect(), window.innerHeight); };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(run); };
    run();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Drifts at a different speed from the page while it crosses the viewport.
export function Parallax({ speed = 0.1, className = "", children }) {
  const ref = useRef(null);
  useScrollFrame(ref, (el, r, vh) => {
    if (prefersReduced()) return;
    const p = clamp((vh - r.top) / (vh + r.height));
    el.style.transform = `translate3d(0, ${((0.5 - p) * speed * 400).toFixed(1)}px, 0)`;
  });
  return <div ref={ref} className={className} style={{ willChange: "transform" }}>{children}</div>;
}

// Grows from slightly small to full size as it scrolls into view.
export function ScrollScale({ from = 0.9, className = "", children }) {
  const ref = useRef(null);
  useScrollFrame(ref, (el, r, vh) => {
    if (prefersReduced()) return;
    const p = clamp((vh - r.top) / (vh * 0.65));
    el.style.transform = `scale(${(from + (1 - from) * p).toFixed(3)})`;
  });
  return <div ref={ref} className={className} style={{ willChange: "transform", transformOrigin: "50% 0%" }}>{children}</div>;
}

// Words light up one by one as the paragraph scrolls through the middle of the screen.
export function ScrollWords({ text, accent = [], className = "" }) {
  const ref = useRef(null);
  const words = text.split(" ");
  const [lit, setLit] = useState(0);
  useScrollFrame(ref, (el, r, vh) => {
    if (prefersReduced()) { setLit(words.length); return; }
    const p = clamp((vh * 0.8 - r.top) / (r.height + vh * 0.25));
    setLit(Math.round(p * words.length));
  });
  return (
    <p ref={ref} className={className} aria-label={text}>
      {words.map((w, i) => {
        const on = i < lit;
        const isAccent = accent.some((a) => w.toLowerCase().startsWith(a));
        return (
          <span key={i} aria-hidden="true" className="transition-colors duration-300" style={{ color: on ? (isAccent ? "var(--lime)" : "var(--text)") : "var(--dim)" }}>
            {w}{" "}
          </span>
        );
      })}
    </p>
  );
}
