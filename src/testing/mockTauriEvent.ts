/**
 * Mock @tauri-apps/api/event for Playwright e2e.
 */
export function listen<T>(
  _event: string,
  handler: (event: { payload: T }) => void,
): Promise<() => void> {
  void handler;
  return Promise.resolve(() => {});
}
