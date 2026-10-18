// Records the real flow of the app (landing -> Test now -> example PDF -> run -> results) at 1920x1080 CSS pixels, device scale factor 2, recorded as 2560x1440 so the video can be zoomed up to 1.33x without softening.
// Needs: the dev server running (npm run dev), ffmpeg on the PATH, and a Chromium for Playwright (npx playwright install chromium,
// or CHROME_EXE=/path/to/chrome). Writes video/public/clip.mp4 and video/marks.json (where each section starts, and where its card is on screen).
// The flow uses ?demo, so everything it shows is example data.
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const HERE = path.dirname(new URL(import.meta.url).pathname);
const RAW = fs.mkdtempSync(path.join(os.tmpdir(), "quorum-rec-"));
const browser = await chromium.launch(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {});
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
// A visible cursor: the video does not capture the real one
await ctx.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.style.cssText = "position:fixed;z-index:2147483647;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:2px solid #fff;background:rgba(198,241,53,.35);box-shadow:0 0 0 1px rgba(0,0,0,.5);pointer-events:none;left:-50px;top:-50px;transition:transform .12s";
    document.body.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => (c.style.transform = "scale(.7)"), true);
    addEventListener("mouseup", () => (c.style.transform = "scale(1)"), true);
  });
});
const page = await ctx.newPage();
// Playwright's own recording captures at the CSS size and pads the rest with grey, so the frames come straight from Chrome's screencast:
// the page renders at 2x and the frames arrive at 2560x1440. Frame times and marks share one clock, so they line up exactly.
const cdp = await ctx.newCDPSession(page);
const frames = [];
let firstTs = null, writing = Promise.resolve();
cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
  const ts = metadata.timestamp;
  firstTs ??= ts;
  const file = path.join(RAW, `${String(frames.length).padStart(6, "0")}.jpg`);
  frames.push({ file, ts });
  writing = writing.then(() => fs.promises.writeFile(file, Buffer.from(data, "base64")));
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 2560, maxHeight: 1440, everyNthFrame: 1 });
while (firstTs === null) await new Promise((r) => setTimeout(r, 20));
const t0 = Date.now(), marks = {};
const boxes = {};
const mark = (k) => { marks[k] = +(Date.now() / 1000 - firstTs).toFixed(2); console.log(k, marks[k]); };
const card = (t) => page.locator(`text=${t}`).first().locator("xpath=ancestor::*[contains(@class,'panel')][1]");
const grab = async (k, loc) => { try { const b = await loc.boundingBox(); if (b) boxes[k] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; } catch {} };
const pause = (ms) => page.waitForTimeout(ms);
const glide = async (sel, opts = {}) => { const b = await page.locator(sel).first().boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 40 }); };
const click = async (sel) => { await glide(sel); await pause(350); await page.locator(sel).first().click(); };
const toEl = async (sel, block = "center") => { await page.locator(sel).first().evaluate((e, b) => e.scrollIntoView({ block: b, behavior: "smooth" }), block); await pause(1900); };

await page.goto(BASE + "/?demo");
await pause(4200); mark("hero"); await grab("hero", page.locator("h1").first());
await pause(2600);
await toEl("#people", "start"); mark("people"); await grab("people", page.locator('#people div[class*="lg:grid-cols-12"]').first()); await pause(3600);
await page.evaluate(() => window.scrollBy({ top: 520, behavior: "smooth" })); await pause(2200); mark("compare");
await grab("compare", page.locator("text=A general chatbot").first().locator("xpath=ancestor::*[contains(@class,'grid')][1]")); await pause(3200);
await toEl("#how-it-works", "start"); mark("how"); await grab("how", page.locator("#how-it-works ol")); await pause(1500);
await page.mouse.move(1100, 480, { steps: 30 });
await page.locator("#how-it-works ol li").nth(1).hover(); await pause(1800);
await page.locator("#how-it-works ol li").nth(2).hover(); await pause(1800);
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })); await pause(2200);
await click("nav a:has-text('Test now')"); await pause(2800);
await click("aside a:has-text('New simulation')"); await pause(1800);
await pause(1200); await click("button:has-text('Try it with example data')"); await pause(3000); mark("pdf"); await grab("form", page.locator("form").first()); await pause(1800);
await click("button:has-text('Analyze idea')"); const clicked = Date.now(); await pause(3800); mark("scan");
await grab("status", page.locator("text=Runtime on MI300X").first().locator("xpath=ancestor::*[contains(@class,'panel')][1]"));
await toEl("canvas"); await grab("map", page.locator("canvas").first());
await pause(Math.max(0, 8800 - (Date.now() - clicked)) + 200); mark("dots");
const mb = await page.locator("canvas").first().boundingBox();
for (const [fx, fy] of [[0.3, 0.42], [0.52, 0.46], [0.72, 0.38], [0.62, 0.64]]) { await page.mouse.move(mb.x + mb.width * fx, mb.y + mb.height * fy, { steps: 50 }); await pause(1300); }
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })); await pause(2600); mark("results");
const [dl] = await Promise.all([page.waitForEvent("download"), click("button[aria-label='Download briefing']")]);
await dl.saveAs(path.join(HERE, "public", "briefing.pdf")); await pause(800);
mark("end");
await cdp.send("Page.stopScreencast");
await writing;
await ctx.close();
await browser.close();
fs.mkdirSync(path.join(HERE, "public"), { recursive: true });
fs.writeFileSync(path.join(HERE, "marks.json"), JSON.stringify({ sync: 0, marks, boxes }, null, 1));
// Frames only arrive when the page changes: hold each one until the next, then resample to 60 fps.
const list = frames.map((fr, i) => `file '${fr.file}'\nduration ${(i + 1 < frames.length ? frames[i + 1].ts - fr.ts : 0.04).toFixed(4)}`).join("\n") + `\nfile '${frames[frames.length - 1].file}'\n`;
fs.writeFileSync(path.join(RAW, "frames.txt"), list);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(RAW, "frames.txt"), "-vf", "fps=60,scale=2560:1440", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-g", "15", "-preset", "fast", "-an", path.join(HERE, "public", "clip.mp4")]);
const secs = frames[frames.length - 1].ts - frames[0].ts;
console.log(`${frames.length} screencast frames in ${secs.toFixed(1)} s (${(frames.length / secs).toFixed(1)} per second)`);
// The briefing, as an image, for the video
try {
  execFileSync("qlmanage", ["-t", "-s", "2400", "-o", path.join(HERE, "public"), path.join(HERE, "public", "briefing.pdf")], { stdio: "ignore" });
  fs.renameSync(path.join(HERE, "public", "briefing.pdf.png"), path.join(HERE, "public", "briefing.png"));
} catch (e) { console.log("briefing.png not made:", e.message); }
fs.rmSync(RAW, { recursive: true, force: true });
console.log("clip.mp4 and marks.json written");
