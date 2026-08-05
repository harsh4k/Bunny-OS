# Bunny OS — Testing

## Matrix

| Layer | Tool | Scope |
|-------|------|--------|
| Frontend unit | Vitest + jsdom | Components, island math, cursor controller |
| Frontend e2e | Playwright | Dashboard Apps, notification pill, onboarding (mocked Tauri) |
| Rust host | `cargo test` | user_apps, start_menu, app_icons, broker |
| Python sidecar | `python -m unittest discover sidecar/tests` | catalog, voice, inventory |
| Desktop soak | Human | `docs/beta-checklist.md` |

## Unit tests (`npm test`)

| File | Covers |
|------|--------|
| `islandHitTest.test.ts` | Hit rect geometry |
| `islandCursorController.test.ts` | Stale tick cannot re-arm ignore after expand |
| `islandTransparency.test.ts` | Transparency API invoked |
| `AppsPanel.test.tsx` | list_apps, auto-rescan when empty, icon vs glyph |
| `VoicePill.test.tsx` | Pill interaction, status copy |
| `FirstRunNotice.test.tsx` | Onboarding wizard (mocked IPC) |

Run: `npm test` or `npm run test:watch`

## E2E tests (`npm run test:e2e`)

Builds frontend with `E2E=1`, which aliases `@tauri-apps/api/core` to `src/testing/mockTauriCore.ts`.

| Spec | URL / harness |
|------|----------------|
| `e2e/dashboard-apps.spec.ts` | `?e2e=apps` harness |
| `e2e/notification-pill.spec.ts` | `?ui=island` |
| `e2e/onboarding.spec.ts` | `?e2e=onboarding` |

Run: `npm run test:e2e`

## Mocking Tauri in Vitest

```typescript
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockImplementation(async (cmd: string) => { ... }),
  convertFileSrc: (p: string) => `asset://localhost/${p}`,
}));
```

See `CompactPanel.test.tsx` and `FirstRunNotice.test.tsx`.

## Verification gate (P0 DoD)

```powershell
npm run lint
npm test
npm run build:frontend
npm run test:e2e
cargo test --manifest-path src-tauri/Cargo.toml  # Windows: requires MSVC `link.exe`
```

Manual (Windows desktop):

1. Expand island → dashboard fully clickable.
2. Notification pill: no plate/flash behind text.
3. Apps → Rescan → real Start Menu apps; PNG icons when extract succeeds.

Record soak in `docs/beta-checklist.md` section I.
