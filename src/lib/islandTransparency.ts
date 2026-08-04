import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Fully transparent — WebView2 on Windows only honors alpha === 0. */
const CLEAR = { red: 0, green: 0, blue: 0, alpha: 0 } as const;

/** Strip the default webview plate behind the top-edge island (window + webview). */
export async function ensureIslandTransparency(): Promise<void> {
  try {
    await Promise.all([
      getCurrentWebviewWindow().setBackgroundColor(CLEAR),
      getCurrentWindow().setBackgroundColor(CLEAR),
    ]);
  } catch {
    /* Vite / browser preview — no Tauri window */
  }
}
