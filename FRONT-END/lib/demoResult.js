// EXAMPLE ONLY. "Show example data" (or ?demo in the address) fills every card with these made-up numbers, flagged as such.
// The personas are generated here, and every aggregate below is counted from them, so the example is at least self-consistent.
const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (r, a) => a[Math.floor(r() * a.length)];

// More entries for the most populous states
const STATES = "CA CA CA CA TX TX TX FL FL FL NY NY NY PA PA IL IL OH OH GA GA NC NC MI MI NJ VA WA AZ MA TN IN MO MD WI CO MN SC AL LA KY OR OK CT UT IA NV AR MS KS NM NE ID WV HI NH ME MT RI DE SD ND AK VT WY DC".split(" ");
const AGES = [["18-29", 18, 29], ["30-44", 30, 44], ["45-59", 45, 59], ["60+", 60, 80]];
const INCOMES = ["Under $50k", "$50-100k", "Over $100k"];
const POLITICS = ["Democrat", "Independent", "Republican"];
const REASONS = {
  buy: ["It would save me time every week.", "The price feels fair for what it does.", "I would try it for a month."],
  undecided: ["I would want to see reviews first.", "Depends on how it compares with what I use now.", "Not sure it fits my budget."],
  no: ["Too expensive for what it is.", "I already have a similar option.", "I do not trust the quality.", "Not available where I live."],
};
const ANSWER = { buy: "Yes, I would buy it.", undecided: "I am not sure yet.", no: "No, I would not buy it." };

function build() {
  const r = rng(7), personas = [];
  for (let i = 0; i < 180; i++) {
    const ai = Math.floor(r() * 4), inc = Math.floor(r() * 3), pol = Math.floor(r() * 3);
    const p = 0.22 + (3 - ai) * 0.1 + inc * 0.1 + (pol === 0 ? 0.08 : pol === 1 ? 0.03 : -0.04), x = r();
    const reaction = x < p ? "buy" : x < p + 0.28 ? "undecided" : "no";
    personas.push({ id: `p${i}`, state: pick(r, STATES), age: AGES[ai][1] + Math.floor(r() * (AGES[ai][2] - AGES[ai][1])), income: INCOMES[inc], politics: POLITICS[pol], reaction, answer: ANSWER[reaction], reason: pick(r, REASONS[reaction]) });
  }
  const pct = (n, d) => Math.round((n / d) * 100);
  const reactions = Object.fromEntries(["buy", "undecided", "no"].map((k) => [k, pct(personas.filter((p) => p.reaction === k).length, personas.length)]));
  const group = (labels, of) => labels.map((label) => { const g = personas.filter((p) => of(p) === label); return { label, value: pct(g.filter((p) => p.reaction === "buy").length, g.length || 1) }; });
  const counts = {};
  personas.filter((p) => p.reaction === "no").forEach((p) => { counts[p.reason] = (counts[p.reason] || 0) + 1; });
  const objections = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([text, n]) => ({ text, share: pct(n, personas.length) }));
  const score = Math.round(reactions.buy + reactions.undecided * 0.4 + 12);
  return {
    score,
    previous: { score: score - 5 },
    scoreRange: { low: score - 8, high: score + 8 }, // the interval is centred on the score
    reactions, personas, objections,
    buyInterval: { low: Math.max(0, reactions.buy - 7), high: reactions.buy + 7 },
    run: { personas: personas.length, runtimeSeconds: 134 },
    topFix: { text: "Offer a free first week: it answers the most common objection", gain: 6, idea: "A weekly box of ready-to-cook meals for busy college students, with a free first week" },
    compare: { a: { label: "Version A, $9", buy: reactions.buy }, b: { label: "Version B, $12", buy: Math.max(0, reactions.buy - 9) }, diff: { value: 9, low: 2, high: 16 } },
    customerPrice: 9,
    wtp: [4, 6, 8, 10, 12, 14, 16].map((price, i) => ({ price, share: [82, 71, 58, 44, 31, 20, 12][i], low: [78, 66, 52, 38, 25, 15, 8][i], high: [86, 76, 64, 50, 37, 25, 16][i] })),
    wtpViews: [
      { question: "Price per week", segment: "Everyone", points: [4, 6, 8, 10, 12, 14, 16].map((price, i) => ({ price, share: [82, 71, 58, 44, 31, 20, 12][i], low: [78, 66, 52, 38, 25, 15, 8][i], high: [86, 76, 64, 50, 37, 25, 16][i] })) },
      { question: "Price per week", segment: "18-29", points: [4, 6, 8, 10, 12, 14, 16].map((price, i) => ({ price, share: [90, 82, 70, 56, 42, 30, 20][i] })) },
      { question: "Price per week", segment: "60+", points: [4, 6, 8, 10, 12, 14, 16].map((price, i) => ({ price, share: [70, 55, 40, 28, 18, 10, 5][i] })) },
    ],
    segments: { age: group(AGES.map((a) => a[0]), (p) => AGES.find((a) => p.age >= a[1] && p.age <= a[2])[0]), income: group(INCOMES, (p) => p.income), politics: group(POLITICS, (p) => p.politics) },
    competitors: [{ name: "Competitor A", price: 12, note: "Monthly plan" }, { name: "Competitor B", price: 7, note: "Free tier with ads" }, { name: "Competitor C", price: 15, note: "Annual plan" }],
  };
}
export const DEMO = build();

// EXAMPLE ONLY: what /api/extract would return for a PDF. Used when example data is on, and flagged in the interface.
export const DEMO_EXTRACT = { idea: "A weekly box of ready-to-cook meals for busy college students", audience: "College students aged 18 to 24 living off campus", price: 9, category: "Food and beverage" };
