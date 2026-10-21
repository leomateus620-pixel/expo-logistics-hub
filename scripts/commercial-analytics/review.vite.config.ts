import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
export default defineConfig({
  root: process.cwd(),
  cacheDir: "/tmp/commercial-analytics-vite",
  plugins: [react()],
  optimizeDeps: { entries: ["scripts/commercial-analytics/review.html"] },
  server: {
    host: "127.0.0.1",
    port: 8088,
    strictPort: true,
    proxy: {
      "/isolated": {
        target: "http://127.0.0.1:55440",
        rewrite: (p) => p.replace(/^\/isolated/, ""),
      },
    },
  },
  resolve: {
    alias: [
      {
        find: "@/integrations/supabase/client",
        replacement: path.resolve(
          "scripts/commercial-analytics/review-client.ts",
        ),
      },
      { find: "@", replacement: path.resolve("src") },
    ],
  },
});
