import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

const e2eMocks = process.env.E2E === "1";

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "~contracts": resolve(__dirname, "contracts"),
      ...(e2eMocks
        ? {
            "@tauri-apps/api/core": resolve(__dirname, "src/testing/mockTauriCore.ts"),
            "@tauri-apps/api/event": resolve(__dirname, "src/testing/mockTauriEvent.ts"),
            "@tauri-apps/api/window": resolve(__dirname, "src/testing/mockTauriWindow.ts"),
            "@tauri-apps/api/dpi": resolve(__dirname, "src/testing/mockTauriDpi.ts"),
            "@tauri-apps/api/webviewWindow": resolve(
              __dirname,
              "src/testing/mockTauriWebview.ts",
            ),
          }
        : {}),
    },
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      // Tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    target:
      process.env.TAURI_ENV_PLATFORM === "windows"
        ? "chrome105"
        : process.env.TAURI_ENV_PLATFORM === "macos"
          ? "safari13"
          : "firefox115",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["src/__tests__/setup.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
}));
