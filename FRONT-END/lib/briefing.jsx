// The downloadable briefing: A4, light theme. The written part comes from the backend (POST /api/briefing, the Evolus "Consumer Panel Briefing"
// agent); the numbers come from the same payload as the dashboard (shape in lib/apiShape.js). Nothing is invented: a missing value is written as
// "not available". With example data, or when the backend answers with its example text, every page says so.
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { FIRST_FILTER_NOTE } from "./copy";
import { has, verdictOf } from "./apiShape";
import { PRODUCT_NAME } from "../brand";
import { api } from "./api";

const ink = "#141414", muted = "#6b6b66", line = "#e4e4df", lime = "#a6cf1c";
const s = StyleSheet.create({
  page: { padding: 40, paddingBottom: 64, fontFamily: "Helvetica", fontSize: 10, color: ink, backgroundColor: "#ffffff" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  brand: { fontSize: 11, fontFamily: "Helvetica-Bold", letterSpacing: 0.4 },
  tag: { fontSize: 8, color: muted, borderWidth: 1, borderColor: muted, borderStyle: "dashed", borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  label: { fontSize: 8, color: muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  idea: { fontSize: 15, fontFamily: "Helvetica-Bold", lineHeight: 1.25, marginBottom: 4 },
  date: { fontSize: 9, color: muted, marginBottom: 18 },
  row: { flexDirection: "row", gap: 12, marginBottom: 16 },
  box: { flex: 1, borderWidth: 1, borderColor: line, borderRadius: 8, padding: 12 },
  big: { fontSize: 34, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 9, color: muted, marginTop: 2 },
  h2: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6, marginTop: 4 },
  p: { lineHeight: 1.4, marginBottom: 8 },
  li: { lineHeight: 1.35, marginBottom: 3, paddingLeft: 10 },
  line: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: line },
  bar: { height: 3, backgroundColor: line, borderRadius: 2, marginTop: 2 },
  barFill: { height: 3, backgroundColor: lime, borderRadius: 2 },
  note: { marginTop: 12, padding: 10, backgroundColor: "#f5f5f1", borderRadius: 6, fontSize: 9, color: muted },
  foot: { position: "absolute", left: 40, right: 40, bottom: 26, fontSize: 8, color: muted, borderTopWidth: 1, borderTopColor: line, paddingTop: 6 },
});

const pct = (n) => `${Math.round(n)}%`;
const NA = "Not available";
const GROUPS = { age: "Age", income: "Income", politics: "Political leaning" };
// The agent returns items as sentences, or sometimes as objects ({text, share}, {name, note}): both are written as one line
const line1 = (v) => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    if (v.text) return typeof v.share === "number" ? `${v.text} (${Math.round(v.share)}% of the panel)` : v.text;
    if (v.name) return `${v.name}: ${v.note ?? v.difference ?? v.how_idea_differs ?? ""}`.replace(/: $/, "");
    return Object.values(v).join(" ");
  }
  return String(v);
};
const asList = (x) => (Array.isArray(x) ? x : x ? [x] : []).map(line1);
const buyShare = (data) => (typeof data?.reactions?.buy === "number" ? data.reactions.buy : has(data?.personas) ? (data.personas.filter((p) => p.reaction === "buy").length / data.personas.length) * 100 : null);

const List = ({ items }) => asList(items).map((t, i) => <Text key={i} style={s.li}>{`•  ${t}`}</Text>);

// ai: the answer of /api/briefing, or null when the backend could not be reached
export function Briefing({ idea, data, demo, ai }) {
  const buy = buyShare(data);
  const iv = data?.buyInterval, sr = data?.scoreRange, score = data?.score;
  const wtp = has(data?.wtp) ? [...data.wtp].sort((a, b) => a.price - b.price) : null;
  const obj = has(data?.objections) ? [...data.objections].sort((a, b) => b.share - a.share).slice(0, 4) : null;
  const text = ai?.briefing;
  const example = !!demo || !!ai?.example_data;
  const workspace = ai?.workspace || "[TBD]";
  const date = new Date().toISOString().slice(0, 10);
  return (
    <Document title={`${PRODUCT_NAME} briefing`}>
      <Page size="A4" style={s.page}>
        <View style={s.top}>
          <Text style={s.brand}>{PRODUCT_NAME.toUpperCase()} BRIEFING</Text>
          {example && <Text style={s.tag}>Example data</Text>}
        </View>
        <Text style={s.label}>Business idea</Text>
        <Text style={s.idea}>{idea || NA}</Text>
        <Text style={s.date}>{date}{typeof data?.run?.personas === "number" ? ` · ${data.run.personas} simulated people` : ""}</Text>

        <View style={s.row}>
          <View style={s.box}>
            <Text style={s.label}>Would buy</Text>
            <Text style={s.big}>{buy === null ? "--" : pct(buy)}</Text>
            <Text style={s.sub}>{iv && typeof iv.low === "number" ? `Interval ${pct(iv.low)} to ${pct(iv.high)}` : "Interval: not available"}</Text>
          </View>
          <View style={s.box}>
            <Text style={s.label}>Viability score</Text>
            <Text style={s.big}>{typeof score === "number" ? Math.round(score) : "--"}</Text>
            <Text style={s.sub}>{typeof score === "number" ? `${verdictOf(score)}${sr ? ` · range ${Math.round(sr.low)} to ${Math.round(sr.high)}` : ""}` : NA}</Text>
          </View>
        </View>

        {text ? (
          <View>
            {ai.source === "example" && <Text style={[s.note, { marginTop: 0, marginBottom: 10 }]}>{ai.notice || "The written briefing is example text."}</Text>}
            <Text style={s.h2}>Verdict</Text><Text style={s.p}>{text.verdict}</Text>
            <Text style={s.h2}>Who would buy</Text><Text style={s.p}>{text.who_buys}</Text>
            <Text style={s.h2}>Price</Text><Text style={s.p}>{text.price}</Text>
            <Text style={s.h2}>Main objections</Text><List items={text.objections} />
            <Text style={[s.h2, { marginTop: 8 }]}>Competitors</Text><List items={text.competitors} />
            <Text style={[s.h2, { marginTop: 8 }]}>Next steps</Text><List items={text.next_steps} />
            <Text style={[s.h2, { marginTop: 8 }]}>Caveats</Text><List items={text.caveats} />
          </View>
        ) : (
          <Text style={[s.note, { marginTop: 0, marginBottom: 12 }]}>The written briefing is not available: the backend could not be reached. The numbers on this page come from the panel results.</Text>
        )}

        <Text style={[s.h2, { marginTop: 14 }]} break={!!text}>Panel data: who would buy</Text>
        <View style={s.row}>
          {Object.entries(GROUPS).map(([k, name]) => (
            <View key={k} style={{ flex: 1 }}>
              <Text style={s.label}>{name}</Text>
              {has(data?.segments?.[k]) ? data.segments[k].map((x) => (
                <View key={x.label} style={{ marginBottom: 4 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text>{x.label}</Text><Text>{pct(x.value)}</Text></View>
                  <View style={s.bar}><View style={[s.barFill, { width: `${Math.max(0, Math.min(100, x.value))}%` }]} /></View>
                </View>
              )) : <Text style={s.sub}>{NA}</Text>}
            </View>
          ))}
        </View>

        <Text style={s.h2}>Panel data: willingness to pay</Text>
        {wtp ? wtp.map((p) => (
          <View key={p.price} style={s.line}><Text>{`$${p.price} per week${p.price === data.customerPrice ? "  (your price)" : ""}${typeof ai?.optimal_price === "number" && p.price === ai.optimal_price ? "  (revenue-maximizing price)" : ""}`}</Text><Text>{pct(p.share)} would buy</Text></View>
        )) : <Text style={s.sub}>{NA}</Text>}

        {!text && (
          <View>
            <Text style={[s.h2, { marginTop: 14 }]}>Main objections</Text>
            {obj ? obj.map((o) => <View key={o.text} style={s.line}><Text>{o.text}</Text><Text>{pct(o.share)}</Text></View>) : <Text style={s.sub}>{NA}</Text>}
            {data?.topFix?.text && <Text style={[s.h2, { marginTop: 14 }]}>Fix with the biggest impact</Text>}
            {data?.topFix?.text && <Text>{data.topFix.text}</Text>}
          </View>
        )}

        <Text style={s.note}>{FIRST_FILTER_NOTE}</Text>
        <View style={s.foot} fixed>
          <Text>{`Evolus workspace: ${workspace}. ${example ? "Example data: made-up numbers that show how a briefing will look. " : ""}Decision support based on survey data, not a guarantee of success.`}</Text>
        </View>
      </Page>
    </Document>
  );
}

const slug = (t) => (t || "idea").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").split("-").slice(0, 6).join("-") || "idea";

// Asks the backend for the written briefing (it runs the Evolus agent: allow a minute or two). null if the backend cannot be reached.
export async function fetchBriefing({ idea, data, demo }) {
  const buy = buyShare(data);
  const body = {
    idea, audience: data?.request?.audience || undefined,
    reactions: buy === null ? undefined : { buy }, buyInterval: data?.buyInterval, segments: data?.segments, wtp: data?.wtp,
    objections: data?.objections, competitors: data?.competitors, example_data: !!demo,
  };
  try {
    const r = await fetch(api("/api/briefing"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(240000) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Builds the PDF in the browser and saves it as [idea-name]-briefing-[date].pdf
export async function downloadBriefing({ idea, data, demo }) {
  const ai = await fetchBriefing({ idea, data, demo });
  const blob = await pdf(<Briefing idea={idea} data={data} demo={demo} ai={ai} />).toBlob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(idea)}-briefing-${new Date().toISOString().slice(0, 10)}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
