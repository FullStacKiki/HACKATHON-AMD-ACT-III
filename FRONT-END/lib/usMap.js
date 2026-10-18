import statesTopo from "us-atlas/states-albers-10m.json";
import { feature, mesh } from "topojson-client";

// The United States as a grid of dots, one state at a time. State shapes come from us-atlas (already projected, 975 x 610).
// The API places each person of the panel in a state by its two-letter code.
export const MAP_W = 975, MAP_H = 610, PITCH = 8;

const CODES = "01 AL 02 AK 04 AZ 05 AR 06 CA 08 CO 09 CT 10 DE 11 DC 12 FL 13 GA 15 HI 16 ID 17 IL 18 IN 19 IA 20 KS 21 KY 22 LA 23 ME 24 MD 25 MA 26 MI 27 MN 28 MS 29 MO 30 MT 31 NE 32 NV 33 NH 34 NJ 35 NM 36 NY 37 NC 38 ND 39 OH 40 OK 41 OR 42 PA 44 RI 45 SC 46 SD 47 TN 48 TX 49 UT 50 VT 51 VA 53 WA 54 WV 55 WI 56 WY".split(" ");
const USPS = {};
for (let i = 0; i < CODES.length; i += 2) USPS[CODES[i]] = CODES[i + 1];
export const STATE_NAMES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };

let cache = null;

// -> { dots: [{ x, y, st }], byState: { TX: [dot index, ...] }, outline: Path2D }   (st = two-letter state code)
export function getUS() {
  if (cache) return cache;
  const ctx = document.createElement("canvas").getContext("2d");
  const shapes = feature(statesTopo, statesTopo.objects.states).features.map((f) => {
    const path = new Path2D();
    const polys = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const poly of polys) for (const ring of poly) {
      ring.forEach(([x, y], i) => { i ? path.lineTo(x, y) : path.moveTo(x, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
      path.closePath();
    }
    return { st: USPS[f.id], path, minX, maxX, minY, maxY };
  }).filter((s) => s.st);

  const dots = [], byState = {};
  let row = 0;
  for (let y = 4; y < MAP_H; y += PITCH * 0.866, row++) {
    for (let x = 4 + (row % 2 ? PITCH / 2 : 0); x < MAP_W; x += PITCH) {
      const s = shapes.find((k) => x >= k.minX && x <= k.maxX && y >= k.minY && y <= k.maxY && ctx.isPointInPath(k.path, x, y, "evenodd"));
      if (s) { (byState[s.st] ??= []).push(dots.length); dots.push({ x, y, st: s.st }); }
    }
  }
  const outline = new Path2D();
  for (const line of mesh(statesTopo, statesTopo.objects.states).coordinates) line.forEach(([x, y], i) => (i ? outline.lineTo(x, y) : outline.moveTo(x, y)));
  cache = { dots, byState, outline };
  return cache;
}
