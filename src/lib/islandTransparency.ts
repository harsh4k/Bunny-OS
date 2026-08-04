import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

/** Fully transparent — WebView2 on Windows only honors alpha === 0. */
const CLEAR = { red: 0, green: 0, blue: 0, alpha: 0 } as const;

/** Strip the default white webview plate behind the top-edge island. */
export async function ensureIslandTransparency(): Promise<void> {
  try {
    await getCurrentWebviewWindow().setBackgroundColor(CLEAR);
  } catch {
    /* Vite / browser preview — no Tauri window */
  }
}
