import { useEffect, useState } from "react";
import { Composition, continueRender, delayRender, staticFile } from "remotion";
import "../index.css";
import { Demo, FPS, TOTAL_FRAMES } from "./Demo";

const FONTS = [
  ["Inter", "Inter-500.woff2", "500 600"],
  ["Bricolage Grotesque", "BricolageGrotesque-600.woff2", "600"],
  ["Doto", "Doto-700.woff2", "700"],
];

// The fonts ship with the video project, so a render never needs the network.
function WithFonts({ children }) {
  const [handle] = useState(() => delayRender("fonts"));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Promise.all(FONTS.map(([family, file, weight]) => new FontFace(family, `url(${staticFile("fonts/" + file)})`, { weight }).load().then((f) => document.fonts.add(f))))
      .catch(() => {})
      .finally(() => { setReady(true); continueRender(handle); });
  }, [handle]);
  return ready ? children : null;
}

export const Root = () => (
  <Composition id="Demo" component={(props) => <WithFonts><Demo {...props} /></WithFonts>} defaultProps={{ music: false }} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
);
