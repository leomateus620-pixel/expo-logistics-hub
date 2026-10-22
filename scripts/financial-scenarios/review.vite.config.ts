import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
const root = process.cwd();
export default defineConfig({
  root,
  cacheDir: path.join("/tmp", `financial-review-vite-${path.basename(root)}`),
  optimizeDeps: { entries: ["scripts/financial-scenarios/review.html"] },
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 8087,
    strictPort: true,
    proxy: {
      "/isolated": {
        target: "http://127.0.0.1:55439",
        rewrite: (p) => p.replace(/^\/isolated/, ""),
      },
    },
  },
  resolve: {
    alias: [
      ...["useCurrentOrg", "useAuth", "useOrgCommissions"].map((name) => ({
        find: `@/hooks/${name}`,
        replacement: path.join(
          root,
          "scripts/financial-2028/review-context.tsx",
        ),
      })),
      {
        find: "@/integrations/supabase/client",
        replacement: path.join(
          root,
          "scripts/financial-scenarios/review-client.ts",
        ),
      },
      { find: "@", replacement: path.join(root, "src") },
    ],
  },
});
