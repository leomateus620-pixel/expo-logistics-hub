import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
// Isolated visual QA; no fixture or local permission override enters the public build.
export default defineConfig({
  root: path.resolve("scripts/volunteers"),
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "@/integrations/supabase/client",
        replacement: path.resolve("scripts/exporural/previewSupabase.ts"),
      },
      {
        find: "@/hooks/useAuth",
        replacement: path.resolve("scripts/volunteers/reviewAuth.ts"),
      },
      { find: "@", replacement: path.resolve("src") },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 5199,
    strictPort: true,
    fs: { allow: [path.resolve(".")] },
    headers: {
      "Content-Security-Policy":
        "connect-src 'self' ws://127.0.0.1:5199; form-action 'none'",
    },
  },
});
