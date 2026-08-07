/**
 * Mock @tauri-apps/api/window for Playwright island preview.
 */
export function getCurrentWindow() {
  return {
    setIgnoreCursorEvents: async () => {},
    outerPosition: async () => ({ x: 0, y: 0 }),
    outerSize: async () => ({ width: 220, height: 38 }),
    scaleFactor: async () => 1,
    setSize: async () => {},
    setPosition: async () => {},
    setShadow: async () => {},
    setBackgroundColor: async () => {},
  };
}

export async function cursorPosition() {
  return { x: 0, y: 0 };
}

export async function currentMonitor() {
  return {
    scaleFactor: 1,
    size: { width: 1920, height: 1080 },
    position: { x: 0, y: 0 },
  };
}

export class LogicalPosition {
  constructor(public x: number, public y: number) {}
}

export class LogicalSize {
  constructor(public width: number, public height: number) {}
}
