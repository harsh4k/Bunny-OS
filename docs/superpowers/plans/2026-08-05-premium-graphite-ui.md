# Premium Graphite UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Bunny OS desktop UI into a cohesive dark graphite, macOS-inspired interface and ensure the Dynamic Island has no visible white canvas.

**Architecture:** Retheme existing presentation layers rather than adding a second component system. Global semantic CSS custom properties feed every dashboard, overview, shared-page, and notification style; current React state, IPC calls, component interfaces, and Tauri window geometry remain intact.

**Tech Stack:** React 18, TypeScript, CSS Modules, Vite, Tauri 2, Vitest.

## Global Constraints

- Modify frontend presentation only; do not alter sidecar, Rust, IPC contracts, or action handlers.
- Do not add packages or change the component architecture.
- Use semantic CSS custom properties instead of component-level literal colors.
- Preserve keyboard focus, reduced-motion behavior, responsive fallbacks, and existing visible actions.
- Keep all edited source files below 300 lines; split only if a file cannot remain focused.

---

### Task 1: Establish the graphite surface system

**Files:**
- Modify: `src/index.css`

**Interfaces:**
- Consumes: existing `--color-*`, `--shadow-*`, `--radius-*`, and `--font-*` custom properties.
- Produces: dark semantic tokens consumed by every CSS Module without component API changes.

- [ ] **Step 1: Replace the light surface tokens with the graphite hierarchy**

Replace the existing surface and text token values at the top of `src/index.css` with this semantic system:

```css
--color-bg: #111214;
--color-surface: #18191c;
--color-surface-solid: #1d1e21;
--color-surface-elevated: #27282c;
--color-sidebar: #161719;
--color-selection: rgba(10, 132, 255, 0.18);
--color-selection-strong: rgba(10, 132, 255, 0.28);
--color-border: rgba(255, 255, 255, 0.12);
--color-border-soft: rgba(255, 255, 255, 0.07);
--color-text-primary: #f4f4f5;
--color-text-secondary: #b1b2b7;
--color-text-muted: #808188;
--color-brand: #0a84ff;
--color-brand-dim: #0071df;
--color-brand-soft: #64b5ff;
```

- [ ] **Step 2: Update global chrome and preview canvas**

Keep `html`, `body`, and `#root` alpha-transparent for Tauri. Replace the dashboard browser-preview background with graphite washes and retain the existing size constraints:

```css
html[data-surface="dashboard"]:not([data-tauri]),
html[data-surface="dashboard"]:not([data-tauri]) body {
  background:
    radial-gradient(80% 64% at 50% 0%, rgba(74, 80, 92, 0.34) 0%, transparent 62%),
    linear-gradient(180deg, #0d0e10 0%, #151619 52%, #0b0c0e 100%);
}
```

- [ ] **Step 3: Verify the token foundation**

Run: `npm run lint`

Expected: exits with code 0 and reports no TypeScript errors.

### Task 2: Refine the desktop shell and navigation

**Files:**
- Modify: `src/components/ExpandedDashboard.module.css`

**Interfaces:**
- Consumes: the semantic tokens produced by Task 1 and existing class names from `ExpandedDashboard.tsx`.
- Produces: the same shell DOM with graphite hierarchy, native-style control affordances, and accessible focus styles.

- [ ] **Step 1: Restyle the shell surfaces without changing layout contracts**

Use the existing `.shell`, `.sidebar`, `.workspace`, and `.windowBar` selectors. Apply `var(--color-surface-solid)` to the shell and workspace, `var(--color-sidebar)` to the sidebar, and a translucent elevated surface to the title bar. Preserve the current two-column grid, drag regions, and `data-motion` animation selectors.

```css
.windowBar {
  background: color-mix(in srgb, var(--color-surface-elevated) 88%, transparent);
  border-bottom: 0.5px solid var(--color-border-soft);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
}

.navItem[data-active="true"] {
  color: var(--color-text-primary);
  background: var(--color-selection);
  box-shadow: inset 0 0 0 0.5px rgba(100, 181, 255, 0.14);
}
```

- [ ] **Step 2: Make window controls and navigation states feel native**

Keep the traffic-light affordances but move all neutral colors to semantic tokens. Give `.collapse` and `.hideBtn` elevated dark control surfaces, use `var(--color-brand-soft)` for focus outlines, and retain every existing hover, active, and reduced-motion behavior.

- [ ] **Step 3: Visually verify the shell at supported widths**

Run: `npm run dev:frontend -- --host 127.0.0.1`

Open: `http://127.0.0.1:1420/?ui=dashboard`

Expected: the shell has a distinct sidebar and workspace, readable active navigation, and no light browser-preview plate.

### Task 3: Unify home and secondary page surfaces

**Files:**
- Modify: `src/components/OverviewPane.module.css`
- Modify: `src/components/PageChrome.module.css`

**Interfaces:**
- Consumes: semantic token system from Task 1 and unchanged component markup.
- Produces: compact, coherent command surfaces for overview, metrics, shortcuts, and secondary pages.

- [ ] **Step 1: Replace decorative light/image treatments with dark command surfaces**

Use the existing stage and hero class names. Keep their content hierarchy and action buttons, but make the image layers subordinate to an opaque graphite gradient. Use `var(--color-surface-elevated)` for cards and metric tiles, `var(--color-border)` for hairlines, and `var(--color-brand)` only for primary action emphasis.

```css
.stageInner,
.heroInner {
  background:
    radial-gradient(90% 80% at 100% 0%, rgba(10, 132, 255, 0.18), transparent 62%),
    linear-gradient(145deg, var(--color-surface-elevated), var(--color-bg));
  border: 0.5px solid var(--color-border);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.stagePhoto,
.heroPhoto {
  opacity: 0.14;
}
```

- [ ] **Step 2: Normalize cards, metrics, tiles, and controls**

Keep the existing `.metrics`, `.metric`, `.tile`, `.card`, `.btnInk`, `.btnGlass`, and `.btnGhost` class interfaces. Use hover changes in border and surface value only; do not add layout shifts, large shadows, or new icons. Retain the current 720px grid fallbacks.

- [ ] **Step 3: Confirm content remains usable**

Run: `npm run lint && npm run test`

Expected: lint succeeds and the existing component tests pass without changes to behavior.

### Task 4: Remove the notification canvas plate and polish the island

**Files:**
- Modify: `src/components/notification/constants.ts`
- Modify: `src/components/notification/NotificationPill.module.css`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: `applyNotificationCssVars`, the existing island geometry custom properties, and `NotificationPill` props.
- Produces: an alpha-transparent outer notification canvas and a dark, self-contained pill without any API or geometry changes.

- [ ] **Step 1: Map notification variables to global semantic tokens**

Change `NOTIFICATION_COLOR` to use semantic custom-property references, avoiding a separate color system:

```ts
export const NOTIFICATION_COLOR = {
  bg: "var(--color-island)",
  bgHover: "var(--color-island-hover)",
  border: "var(--color-island-rim)",
  borderHover: "var(--color-island-rim-hover)",
  title: "var(--color-island-text)",
  subtitle: "var(--color-island-text-muted)",
  accent: "var(--color-brand-soft)",
  accentDim: "var(--color-text-muted)",
  glow: "rgba(255, 255, 255, 0.08)",
  glowCool: "rgba(100, 181, 255, 0.08)",
} as const;
```

- [ ] **Step 2: Make the outer island surface explicitly transparent**

Preserve `.stage` and `.hit` geometry. Ensure `.stage`, `.hit`, `.face`, and their ancestors use no opaque background, and leave the dark background exclusively on `.shell`. Do not alter `--island-*` dimensions or pointer-event behavior.

```css
.stage,
.hit,
.face {
  background: transparent;
}

.shell {
  background: var(--notification-bg, var(--color-island));
  border-color: transparent;
}
```

- [ ] **Step 3: Preserve interactive states**

Keep the existing hover, focus, error, and reduced-motion selectors. Use the semantic island rim and brand focus color for visible contrast. Do not touch `NotificationPill.tsx`, `VoicePill.tsx`, or `src/lib/islandGeometry.ts`.

- [ ] **Step 4: Verify production output**

Run: `npm run lint && npm run test && npm run build:frontend`

Expected: all commands exit with code 0. In the desktop app, the area surrounding the island is transparent and the only visible notification surface is the dark pill.

## Final Review

- [ ] Inspect `git diff --check` for whitespace errors.
- [ ] Confirm no changes exist under `sidecar/`, `src-tauri/src/`, `contracts/`, or integration action handlers.
- [ ] Run `npm run lint && npm run build:frontend` one final time.
