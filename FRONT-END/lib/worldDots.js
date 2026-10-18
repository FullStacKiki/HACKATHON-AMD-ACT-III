import landTopo from "world-atlas/land-110m.json";
import statesTopo from "us-atlas/states-10m.json";
import { feature } from "topojson-client";

// The world as a coarse grid of dots, with the dots that fall inside the United States marked.
// Only the US has panel data; the rest is context.
export const STEP = 2.6, LAT_TOP = 84, LAT_BOTTOM = -58;
let cache = null;

const ringsOf = (g) => (g.type === "MultiPolygon" ? g.coordinates.flat() : g.coordinates);
// Fill rings onto a hidden canvas. Rings that cross the antimeridian are unwrapped and painted three times.
function paint(ctx, rings) {
  ctx.fillStyle = "#000";
  for (const ring of rings) {
    let shift = 0, prev = ring[0][0];
    const pts = ring.map(([lon, lat]) => { if (lon - prev > 180) shift -= 360; else if (lon - prev < -180) shift += 360; prev = lon; return [lon + shift, lat]; });
    ctx.beginPath();
    for (const off of [-360, 0, 360]) { pts.forEach(([lon, lat], i) => (i ? ctx.lineTo((lon + off + 180) * 4, (90 - lat) * 4) : ctx.moveTo((lon + off + 180) * 4, (90 - lat) * 4))); ctx.closePath(); }
    ctx.fill();
  }
}

// -> [{ lon, lat, us }]
export function getWorldDots() {
  if (cache) return cache;
  const mk = () => { const c = document.createElement("canvas"); c.width = 1440; c.height = 720; return c.getContext("2d", { willReadFrequently: true }); };
  const landCtx = mk(), usCtx = mk();
  const land = feature(landTopo, landTopo.objects.land);
  paint(landCtx, (land.features ? land.features : [land]).flatMap((f) => ringsOf(f.geometry)));
  feature(statesTopo, statesTopo.objects.states).features.forEach((f) => paint(usCtx, ringsOf(f.geometry)));
  const l = landCtx.getImageData(0, 0, 1440, 720).data, u = usCtx.getImageData(0, 0, 1440, 720).data;
  const dots = [];
  let row = 0;
  for (let lat = LAT_TOP; lat >= LAT_BOTTOM; lat -= STEP * 0.866, row++) {
    for (let lon = -180 + (row % 2 ? STEP / 2 : 0); lon < 180; lon += STEP) {
      const i = (Math.round((90 - lat) * 4) * 1440 + Math.round((lon + 180) * 4)) * 4;
      if (l[i + 3] > 128) dots.push({ lon, lat, us: u[i + 3] > 128 });
    }
  }
  cache = dots;
  return dots;
}
