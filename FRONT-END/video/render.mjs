// Renders the demo to ../docs/demo.mp4 and public/demo.mp4.
// If video/public/music.mp3 exists the music and the sound effects are added, cut on the beat of audio.json (bpm); otherwise the video is silent.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, "..");
const music = fs.existsSync(path.join(HERE, "public", "music.mp3"));
if (music) execFileSync("node", [path.join(HERE, "make-sfx.mjs")], { stdio: "inherit" });
console.log(music ? "music.mp3 found: adding music and sound effects" : "no video/public/music.mp3: rendering without audio");
const out = path.join(ROOT, "..", "docs", "demo.mp4");
fs.mkdirSync(path.dirname(out), { recursive: true });
execFileSync("npx", ["remotion", "render", "video/index.jsx", "Demo", out, "--image-format=png", "--crf=18", "--config=video/remotion.config.js", "--public-dir=video/public", `--props=${JSON.stringify({ music })}`], { cwd: ROOT, stdio: "inherit" });
fs.copyFileSync(out, path.join(ROOT, "public", "demo.mp4"));
console.log("saved docs/demo.mp4 and FRONT-END/public/demo.mp4");
