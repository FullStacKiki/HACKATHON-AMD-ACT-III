// Where the backend lives. Locally the dev server (and nginx in Docker) forward /api to it, so nothing needs setting.
// For a deployed frontend (Vercel...) set VITE_API_URL to the backend address, for example https://quorum-backend.onrender.com
export const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export const api = (path) => `${API_URL}${path}`;
