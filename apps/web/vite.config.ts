import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin in development too, so the browser never needs CORS.
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
