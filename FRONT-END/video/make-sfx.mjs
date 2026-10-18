// Makes the light sound effects used on the main cuts (our own synthesized sounds, no samples, no licence needed).
// Run by `npm run demo:render`; needs ffmpeg on the PATH.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "public", "sfx");
fs.mkdirSync(dir, { recursive: true });
const ff = (...a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a]);
// whoosh: filtered noise that swells and fades
ff("-f", "lavfi", "-i", "anoisesrc=d=0.7:c=pink:r=44100:a=0.5", "-af", "highpass=f=400,lowpass=f=5200,afade=t=in:d=0.25,afade=t=out:st=0.25:d=0.45,volume=1.4", path.join(dir, "whoosh.wav"));
// tick: short soft sine blip
ff("-f", "lavfi", "-i", "sine=f=1320:d=0.12:r=44100", "-af", "afade=t=out:st=0.02:d=0.1,volume=0.8", path.join(dir, "tick.wav"));
// hit: low thump for the closing
ff("-f", "lavfi", "-i", "sine=f=70:d=0.9:r=44100", "-af", "afade=t=in:d=0.01,afade=t=out:st=0.05:d=0.85,volume=1.6", path.join(dir, "hit.wav"));
console.log("sfx written to", dir);
