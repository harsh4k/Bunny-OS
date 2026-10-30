/**
 * Mock @tauri-apps/api/event for Playwright e2e (E2E=1 vite alias only).
 *
 * Tests push events with `window.__bunnyE2E.emit(event, payload)`, e.g. a
 * sidecar stream chunk that opens the browser confirm banner.
 */
type Handler = (event: { payload: unknown }) => void;

const handlers = new Map<string, Set<Handler>>();

export function listen<T>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<() => void> {
  const set = handlers.get(event) ?? new Set<Handler>();
  // Wrap per call: real Tauri registers every listen() separately, even for
  // the same function, and each unlisten removes only its own registration.
  const entry: Handler = (e) => (handler as Handler)(e);
  set.add(entry);
  handlers.set(event, set);
  return Promise.resolve(() => {
    set.delete(entry);
  });
}

function emit(event: string, payload: unknown): void {
  for (const handler of [...(handlers.get(event) ?? [])]) {
    handler({ payload });
  }
}

if (typeof window !== "undefined") {
  (window as unknown as { __bunnyE2E: { emit: typeof emit } }).__bunnyE2E = { emit };
}
