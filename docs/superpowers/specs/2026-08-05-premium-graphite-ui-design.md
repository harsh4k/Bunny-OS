# Premium Graphite UI Design

## Goal

Refresh Bunny OS into a premium, macOS-inspired desktop assistant without changing backend behavior, IPC contracts, or integrations. The interface will use a dark graphite visual language with clear functional hierarchy and a transparent Dynamic Island canvas.

## Scope

Frontend presentation only:

- Global visual tokens and browser-preview surfaces.
- Expanded dashboard shell, sidebar, title bar, and controls.
- Overview and shared page chrome surfaces.
- Dynamic Island / notification pill presentation, including removal of the visible white backing plate.

Existing views, data flows, action handlers, window geometry, and Tauri commands remain unchanged.

## Visual Direction

The product will use a layered graphite palette rather than pure black. Each elevation level has a distinct semantic surface: application canvas, sidebar, workspace, cards, and controls. A single cool blue accent communicates the active state and primary interaction. Status colors remain semantic and restrained.

Typography stays system-first to retain native macOS character. Spacing becomes denser and more deliberate, with strong alignment between window chrome, navigation, page headers, cards, and action controls. Borders and highlights will create separation; shadows are reserved for floating surfaces.

## Component Design

### Expanded desktop shell

- A dark translucent title bar integrates native-style traffic controls, page title, and window actions.
- The sidebar becomes a low-contrast navigation rail with an unmistakable active state and a quiet product signature.
- The workspace uses a separate graphite surface so primary content reads as an intentional layer rather than a flat panel.

### Home and shared pages

- The overview hero becomes a restrained service-command surface instead of a decorative photo treatment.
- Metrics, shortcuts, and shared cards use a consistent compact surface treatment, predictable spacing, and visible keyboard focus.
- Other settings pages inherit the same tokens through shared page chrome rather than receiving independent visual systems.

### Dynamic Island / notification pill

> Superseded by `docs/superpowers/specs/2026-08-05-stability-island-apps-design.md` — pill is fully clear (no dark glass plate).

- The outer root, stage, and webview canvas stay alpha-transparent.
- The visible island uses only the pill's dark glass surface, with a narrow border, soft highlight, and controlled shadow.
- Hover, focus, active, and error states are differentiated while preserving readable text and keyboard access.

## Interaction and Accessibility

- Existing buttons and navigation remain semantic native controls.
- Focus rings use a high-contrast accent and are never removed.
- Motion is limited to short opacity, transform, and surface transitions; `prefers-reduced-motion` disables nonessential animation.
- Responsive fallback keeps the compact navigation and content layout usable at narrow preview sizes.

## Verification

- Run TypeScript lint and production frontend build.
- Run the existing relevant frontend tests.
- Review dashboard preview and island preview at desktop and narrow widths.
- Confirm no change to Tauri invocation or integration code other than the presentation-layer transparency fix if required.
