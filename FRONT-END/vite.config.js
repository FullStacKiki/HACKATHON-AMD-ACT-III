import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Locally /api goes to the backend (uvicorn backend.main:app, port 8000). VITE_API_TARGET changes that; VITE_API_URL (see lib/api.js) points a deployed build at a remote backend.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { "/api": process.env.VITE_API_TARGET || "http://127.0.0.1:8000" } },
});
