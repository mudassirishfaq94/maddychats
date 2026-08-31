import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The API base can be overridden at build time, but by default the client uses
// same-origin relative URLs (/api/...) which the dev server proxies to Express.
// This keeps DB credentials / JWT secret entirely on the server side.
const API_TARGET = process.env.VITE_API_PROXY ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Allow the proxied preview host (e2b.app) to reach the dev server.
    allowedHosts: true,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
  },
});
