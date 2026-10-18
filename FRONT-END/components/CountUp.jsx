import { useEffect, useRef, useState } from "react";

// A whole number that counts up (or down) to its value; the new value is reached smoothly each time it changes.
export default function CountUp({ value, duration = 900, format }) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(value); from.current = value; return; }
    const start = performance.now(), f = from.current;
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration), e = 1 - Math.pow(1 - p, 3);
      from.current = f + (value - f) * e;
      setV(Math.round(from.current));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format ? format(v) : v}</>;
}
