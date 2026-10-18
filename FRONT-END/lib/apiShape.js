// What the interface expects from the API, per simulation. Every field is optional:
// when a field is missing the card that needs it shows a clearly marked placeholder, never a made-up number.
//
// {
//   score:        0-100                                  overall viability (needle, verdict)
//   scoreRange:   { low, high }                          uncertainty interval of the score
//   reactions:    { buy, undecided, no }                 share of the panel (percent) in each reaction
//   customerPrice: number                                the price the customer plans to charge (highlighted on the curve)
//   wtp:          [{ price, share, low?, high? }]        share of the panel willing to pay at each price (low/high = uncertainty)
//   segments: {
//     age:      [{ label: "18-29", value: 0-100 }]       reaction by age group
//     income:   [{ label: "<$50k", value: 0-100 }]       reaction by income bracket
//     politics: [{ label: "Independent", value: 0-100 }] reaction by political leaning
//   }
//   objections:   [{ text, share: 0-100 }]               main objections and the share of the panel that raised them
//   competitors:  [{ name, price?, note? }]
//   previous:     { score }                              the previous run, for the "Previous / Current" strip
//   buyInterval:  { low, high }                          uncertainty interval of reactions.buy
//   run:          { personas?, runtimeSeconds? }         run status (runtime on the MI300X)
//   topFix:       { text, gain?, idea? }                 the change with the biggest impact (gain = expected points of "would buy"; idea = the idea rewritten with the fix)
//   wtpViews:     [{ question, segment, points: [{ price, share, low?, high? }] }]   curves per question and segment (feeds the dropdowns)
//   compare:      { a: { label, buy }, b: { label, buy }, diff: { value, low, high } }   A/B, only when requested
//   personas:     [{ id, state: "TX", age, income, politics, reaction: "buy" | "undecided" | "no", answer?, reason? }]
//                                                        one entry per person of the panel (one dot on the map, one line in the feed)
// }

export const verdictOf = (n) => (n < 33.3 ? "At risk" : n < 66.6 ? "Needs work" : "Strong");
export const colorOf = (n) => (n < 33.3 ? "var(--warn)" : n < 66.6 ? "var(--amber)" : "var(--lime)");
export const REACTION = { buy: { label: "Would buy", color: "var(--lime)" }, undecided: { label: "Undecided", color: "var(--amber)" }, no: { label: "Would not buy", color: "var(--warn)" } };
export const has = (list) => Array.isArray(list) && list.length > 0;

// Values read off the curve itself, never typed in: the share at a price, and the price where the share drops to 50%.
export function shareAt(wtp, price) {
  if (!has(wtp) || typeof price !== "number") return null;
  const p = [...wtp].sort((a, b) => a.price - b.price);
  if (price <= p[0].price) return p[0].share;
  for (let i = 1; i < p.length; i++) if (price <= p[i].price) { const t = (price - p[i - 1].price) / (p[i].price - p[i - 1].price); return p[i - 1].share + t * (p[i].share - p[i - 1].share); }
  return p[p.length - 1].share;
}
export function halfPrice(wtp) {
  if (!has(wtp)) return null;
  const p = [...wtp].sort((a, b) => a.price - b.price);
  for (let i = 1; i < p.length; i++) if (p[i - 1].share >= 50 && p[i].share <= 50) { const t = (p[i - 1].share - 50) / (p[i - 1].share - p[i].share || 1); return p[i - 1].price + t * (p[i].price - p[i - 1].price); }
  return null;
}
