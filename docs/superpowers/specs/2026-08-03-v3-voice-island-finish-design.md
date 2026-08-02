# Bunny OS v3 — Voice, Island & Finish Design

**Date:** 2026-08-03  
**Version target:** v0.3.0  
**Ponytail:** full — root-cause first; no cloud TTS; no animation libs. Design-system rewrite **allowed** where it raises finish quality. Persona is in scope.

## Problem

v2 ships but feels unfinished: TTS blabbers and can’t be interrupted; F9 first hold often misses; island pops instead of morphing; dashboard looks template-sloppy; Bunny reads as a stiff **butler** (“composed… dry wit… one or two short sentences”) instead of a real **assistant + advisor**. User bar: v1=1x, v2=3x, v3=10x finish.

## Root causes (verified)

1. **F9 first miss** — Press/release spawn separate async IPC tasks; remute can land between unmute and `start_listen` (`hotkey.rs`).
2. **No cut-off** — `set_mute(true)` while speaking does **not** stop TTS; only pill Stop / F9-down barge-in do.
3. **Blabber** — Soft length + `MAX_SPOKEN_CHARS = 2000` lets long essays through.
4. **Robotic voice** — OS SAPI / NSSpeech only (privacy). Rate untuned; length is the bigger lever.
5. **Island pop** — Idle `hide_window`; show = hard full-size reveal. No dormant line.
6. **UI slop** — Tokens exist but underused; brand asset unused; Overview is a metric dump; letter “B”.
7. **Butler persona** — Shared copy in [`chat_handler.SYSTEM_PROMPT`](sidecar/chat_handler.py) + [`memory.PERSONA`](sidecar/memory.py) optimizes for deference and brevity, not judgment or advice.

## Non-goals (ponytail cuts)

- Cloud or new local neural TTS (Piper/Coqui/etc.)
- Framer/GSAP or animating Tauri `setSize` for line↔pill
- New dashboard *pages* / features unrelated to finish
- Speculative long-term memory rewriting for “tone”

## Revised product stance

**Bunny = personal OS assistant *and* advisor.**  
- **Assistant:** when intent is clear (open, play, time, media), act — short confirm.  
- **Advisor:** when asked what to do / which option / how to think about it, give a clear recommendation, brief why, optional next step — candid, not deferential.  
- **Not a butler:** no stiff “composed servant” voice; no empty wit that replaces help.  
- **Channel rule:** spoken replies stay interruptible and length-capped; typed chat can go deeper (still structured, not essays).

## Solution waves

### Wave A — Voice reliability

**A1. Serialize PTT IPC** — Ordered `SetMute(false) → StartListen` vs remute/`StopListen`.

**A2. Interrupt while speaking** — Mute or F9-down while `SPEAKING` → stop TTS + cancel. Remute-after-capture when not speaking stays.

**A3. Spoken budget** — Hard ~250-char trim at sentence boundary; mild SAPI rate bump. Length cap ≠ personality kill — advisor answers spoken as “recommendation + why” in ≤2 sentences.

### Wave A′ — Persona (assistant + advisor)

**Single soul, two depths** (ponytail: one shared persona string + thin voice suffix, not two products):

| Channel | Depth |
|---------|--------|
| Voice / TTS | Act if clear; if advising, one recommendation + one-line why; ≤2 sentences |
| Chat panel | Same soul; can add 1–2 options or a short plan when useful |

Rewrite `PERSONA` + `SYSTEM_PROMPT` (keep in sync; tests already assert “You are Bunny”):

- Capable local desktop partner — do and advise.
- Prefer a clear call over hedging; say uncertainty briefly.
- Dry wit only when it clarifies, never instead of the answer.
- Still: allowlist tools only; never invent apps/URLs; memories untrusted.

### Wave B — Mac-like island

**B1.** Always-visible dormant ~6–8px line → CSS morph to pill. No idle hide. No resize for morph.  
**B2.** True monitor-top placement.  
**B3.** Expand: keep size jump; optional opacity ease.

### Wave C — Visual finish (rewrite allowed)

Ponytail ladder: rewrite **tokens + shell composition + type** if sand/graphite still reads as AI-slop; don’t add UI kits.

**C0. Design-system pass (optional but encouraged)**  
Tighten or refresh CSS variables in [`src/index.css`](src/index.css): display/body pairing, radii scale, surface hierarchy, focus rings. Keep dark desktop-native (not purple glow, not cream serif). Export a tiny token comment block as the artboard contract.

**C1.** Bunny mark everywhere letter “B” is — sidebar, Overview, tray-adjacent brand.

**C2.** Overview as one artboard: mark + product name + status + Talk/Mic + quieter secondary row.

**C3.** Apply new/ refreshed tokens across ExpandedDashboard panes (not a page-by-page redesign of logic).

## Acceptance

- First F9 hold after cold start listens on short holds (~400ms+).
- During speak-back, F9 barge-in, tray/UI mute (`interrupt_speech`), or pill tap silences within ~200ms.
- Spoken replies ≤2 short sentences (~280 char hard cap); advisor voice still gives a real recommendation.
- Chat advice feels useful (call + why), not servant-polite — persona is assistant + advisor.
- Idle = thin top line (no auto-hide); hover/F9 morphs; no pop-from-nothing.
- Expanded window uses bunny mark + Overview artboard, not letter “B” / metric dump.

## Ship

Soak on Win (+ Mac if available) → tag **v0.3.0**.
