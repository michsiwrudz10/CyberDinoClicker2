import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = process.cwd();
const frontendDir = resolve(rootDir, "frontend");

export default defineConfig({
  root: frontendDir,
  base: "/CyberDinoClicker/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(frontendDir, "src")
    }
  },
  server: {
    port: 5173,
    open: true,
    headers: {
      "Cache-Control": "no-store"
    },
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API_PROXY || "http://127.0.0.1:8787",
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: resolve(rootDir, "dist"),
    emptyOutDir: true,
    sourcemap: false,
    manifest: true,
    rollupOptions: {
      input: {
        game: resolve(frontendDir, "index.html"),
        admin: resolve(frontendDir, "admin.html")
      },
      output: {
        entryFileNames: "assets/[name].[hash].js",
        chunkFileNames: "assets/[name].[hash].js",
        assetFileNames: "assets/[name].[hash].[ext]"
      }
    }
  }
});
