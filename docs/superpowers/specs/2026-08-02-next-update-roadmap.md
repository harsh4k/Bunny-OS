# Bunny OS — Next Update Roadmap

Date: 2026-08-02  
Status: planning only (not in v0.1.1)

Features that fit Bunny’s **local-only + allowlisted actions** model. Ordered by value / feasibility.

## 1. Session log in Memory (remainder of “C”)

Compact per-turn summaries users can browse and delete. Complements auto-facts from v0.1.1.

## 2. Screen context Q&A (opt-in)

Answer questions about what’s on screen via **OS accessibility / UI Automation** text from the focused window — not always-on pixel OCR. Explicit toggle; never silent capture.

## 3. Voice follow-up v2

Multi-step slots: open YouTube → “sunflower” → “play the first one.” Stronger than the v0.1.1 domain hint.

## 4. Allowlisted browser tools

Local automation with confirm for risky steps: focus tab, scroll, type-in-page, click-by-role. No free-form shell; no arbitrary scripts.

## 5. Smarter app catalog aliases

`yt`, `chrome`, `edge`, etc. mapped reliably on Windows + macOS.

## 6. Wake reliability pack

Better false-trigger tuning, optional openWakeWord models, persist sensitivity profiles.

## Explicitly deferred

- Unrestricted browser RPA / “do everything”
- Cloud OCR / always-on screen recording
- Telemetry or remote model APIs
