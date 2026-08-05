# Stability Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development or executing-plans.

**Goal:** Fix click-through, clear notification pill, harden app scan/icons, add tests and PRD docs.

**Architecture:** Generation-guarded `islandCursorController`; host-owned catalog; Playwright with `E2E=1` Tauri mock alias.

**Tech Stack:** Tauri v2, React/TS, Vitest, Playwright, Rust `cargo test`.

## Global Constraints

- Local-only; no new cloud APIs or shell execution.
- Dual app catalogs KEEP (Rust paths, Python voice names).
- Notification pill fully clear — no plate, shadow, or sheen.
- One new module: `islandCursorController.ts`.

---

### Task 1: Island cursor controller

**Files:** Create `src/lib/islandCursorController.ts`, modify `src/App.tsx`, test `src/__tests__/islandCursorController.test.ts`

- [ ] Implement generation-guarded poll
- [ ] Wire App.tsx; cleanup sets interactive
- [ ] Unit test stale tick after expand

### Task 2: Clear pill + transparency

**Files:** `NotificationPill.module.css`, `constants.ts`, `islandTransparency.ts`, `App.tsx`

- [ ] Transparent shell; text-shadow; remove sheen/shadows
- [ ] Re-assert transparency after animation settle
- [ ] CSS contract test

### Task 3: Apps + icons

**Files:** `tauri.conf.json`, `commands.rs`, `AppsPanel.tsx`, `FirstRunNotice.tsx`

- [ ] macOS asset scope
- [ ] Icon failure logging
- [ ] Auto-rescan when empty; sample_apps in wizard

### Task 4: E2E + docs

**Files:** `e2e/*.spec.ts`, `playwright.config.ts`, `src/testing/mockTauriCore.ts`, docs updates

- [ ] Playwright with E2E mock
- [ ] beta-checklist soak items
- [ ] PRD, MAINTENANCE, TESTING, architecture

### Task 5: Verify

- [ ] `npm run lint && npm test && npm run build:frontend && npm run test:e2e`
- [ ] `cargo test`
