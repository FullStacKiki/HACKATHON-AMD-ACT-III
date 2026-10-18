// Saved simulations shown in the dashboard and history. Stored in the browser only. Starts empty: nothing is pre-filled.
const KEY = "quorum.history.v3";

export function loadHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(raw)) return raw;
  } catch { /* storage blocked or corrupt */ }
  return [];
}

export function saveHistory(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

export function clearHistory() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export { verdictOf, colorOf as colorOfScore } from "./apiShape";

export const formatDate = (iso) =>
  new Date(iso).toLocaleDateString("en", { day: "numeric", month: "short" });
