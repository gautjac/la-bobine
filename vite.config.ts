import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The editor app. API + project assets are served by the local studio server
// (server/index.ts, port 7788); in dev, Vite proxies those paths so the app can
// use relative URLs everywhere except inside Remotion props (see api.ts).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5788,
    strictPort: true, // a second instance must fail loudly, not drift to 5789
    proxy: {
      "/api": "http://localhost:7788",
      "/projects": "http://localhost:7788",
      "/download": "http://localhost:7788",
    },
  },
  build: { outDir: "app/dist", emptyOutDir: true },
});
