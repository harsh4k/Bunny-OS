/**
 * Mock @tauri-apps/api/core for Playwright e2e (E2E=1 vite alias).
 */
type AppRow = {
  id: string | null;
  name: string;
  source: string;
  path: string;
  removable: boolean;
};

const MOCK_APPS: AppRow[] = [
  {
    id: "notepad",
    name: "Notepad",
    source: "start_menu",
    path: "C:\\Windows\\notepad.exe",
    removable: false,
  },
  {
    id: "calc",
    name: "Calculator",
    source: "start_menu",
    path: "C:\\Windows\\System32\\calc.exe",
    removable: false,
  },
];

let catalog = [...MOCK_APPS];

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const isOnboardingHarness =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("e2e") === "onboarding";

  switch (cmd) {
    case "get_onboarding_complete":
      return !isOnboardingHarness as T;
    case "onboarding_scan":
      return {
        os: "Windows",
        arch: "x86_64",
        app_count: catalog.length,
        sample_apps: catalog.slice(0, 4).map((a) => a.name),
      } as T;
    case "complete_onboarding":
      return undefined as T;
    case "list_apps":
      return catalog as T;
    case "rescan_apps":
      catalog = [...MOCK_APPS];
      return catalog as T;
    case "get_app_icon":
      const path = args?.path as string | undefined;
      if (!path) return null as T;
      return `C:\\BunnyOS\\icons\\${path.replace(/[^a-z0-9]/gi, "")}.png` as T;
    case "ollama_running":
      return false as T;
    case "ensure_ollama":
      return "Ollama ready" as T;
    case "get_mic_muted":
      return true as T;
    case "show_window":
      return undefined as T;
    case "open_mic_privacy_settings":
    case "open_sound_settings":
    case "open_accessibility_settings":
    case "open_trusted_https":
      return undefined as T;
    default:
      return undefined as T;
  }
}

export function convertFileSrc(filePath: string): string {
  return `https://asset.localhost/${encodeURIComponent(filePath)}`;
}
