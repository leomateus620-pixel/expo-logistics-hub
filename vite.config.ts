import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("maplibre-gl")) return "maps-maplibre";
          if (id.includes("/leaflet/") || id.includes("\\leaflet\\")) return "maps-leaflet";
          if (id.includes("html5-qrcode")) return "qr";
          if (id.includes("jspdf")) return "pdf";
          // Note: recharts/d3 are intentionally NOT in a manual chunk.
          // Forcing them into a single chunk causes a TDZ ReferenceError
          // ("Cannot access 'S' before initialization") on production builds
          // because of cross-module circular initialization. Let Vite split
          // them automatically alongside the lazy Dashboard chart components.
          if (id.includes("@radix-ui")) return "ui-radix";
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("react-router") ||
            id.includes("scheduler")
          ) {
            return "react-vendor";
          }
          if (id.includes("@supabase") || id.includes("@tanstack")) return "data-vendor";
        },
      },
    },
  },
}));
