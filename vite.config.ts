import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import removeConsole from "vite-plugin-remove-console";
import { localApiRoutes } from "./vite-plugins/local-api-routes";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8081,
  },
  plugins: [
    react(),
    mode === "development" && localApiRoutes(),
    mode === "development" && componentTagger(),
    // Remove ALL console logs in production (including console.error)
    // Note: window.console in main.tsx will still work as it's not removed by the plugin
    mode === "production" && removeConsole(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  ssr: {
    external: ["pg", "drizzle-orm"],
  },
}));
