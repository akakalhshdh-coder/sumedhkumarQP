import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API = process.env.QP_API ?? "http://127.0.0.1:8765";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: API, changeOrigin: true },
      "/ws": { target: API.replace("http", "ws"), ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three", "@react-three/fiber", "@react-three/drei", "@react-three/postprocessing", "postprocessing"],
          charts: ["lightweight-charts"],
        },
      },
    },
  },
});
