# Private beta checklist — Bunny OS

Use this before expanding the action allowlist. Automated gates do **not** replace the human items.

## A. Automated (CI / local)

```powershell
pwsh -File scripts/verify-beta.ps1
```

Expected: frontend tests, lint, frontend build, Python suite, `cargo fmt --check` all pass.  
If `link.exe` is present, `cargo test` also runs.

## B. Packaging

- [ ] `pwsh -File scripts/package-sidecar.ps1` (Windows) / `bash scripts/package-sidecar.sh` (macOS)
- [ ] Tag `v*` → `.github/workflows/release.yml` publishes MSI + arm64 DMG + `SHA256SUMS.txt`
- [ ] Installer is code-signed / notarized (see [`SHIPPING.md`](SHIPPING.md) — certs not in repo)
- [ ] `install.ps1 -WhatIf` / `install.sh --what-if` resolve assets and checksums

## C. Fresh install / first run

### Windows
- [ ] Fresh Windows 10/11 VM or clean profile install
- [ ] Install via the one-liner in [README](../README.md#install-windows) (or `-LocalMsi`)
- [ ] Onboarding opens automatically (privacy → scan → mic/sound → Ollama → Finish)

### macOS
- [ ] Fresh Intel + Apple Silicon Macs (or both CI DMGs)
- [ ] Install via `install.sh` (copies to `/Applications`, clears quarantine)
- [ ] Grant Microphone + Accessibility when prompted
- [ ] Onboarding opens automatically; media keys work after Accessibility
- [ ] Gatekeeper: unsigned beta may need “Open anyway” until notarization secrets are set

- [ ] Mic starts muted; Ollama is external; Memory Off available
- [ ] Ollama stopped → chat/advisor shows actionable “unreachable” guidance (no crash loop)
- [ ] Ollama started → model advisor shows Fast / Balanced / Quality and requires click before pull

See also [`docs/uninstall.md`](uninstall.md).

## D. Safe assistant loop

- [ ] Typed chat responds via Ollama
- [ ] Proposed `open_app` / `open_url` / `youtube_search` require click confirm
- [ ] Audit log shows each brokered action
- [ ] Voice / wake word never auto-approves an action

## E. Voice / wake / memory

- [ ] Push-to-talk mute + cancel work from active states
- [ ] No raw audio files under `%LOCALAPPDATA%\BunnyOS\`
- [ ] Wake settings panel: enable/disable + sensitivity; Talk/hotkey fallback remains
- [ ] Memory Off blocks new facts; Forget / Delete All / Export work
- [ ] Stored memories treated as untrusted data (persona stays first)

## F. Resilience

- [ ] Sleep/resume: tray returns; sidecar recovers or Recover works
- [ ] Bluetooth / default mic change: Talk still works or shows clear error
- [ ] Sidecar kill: degraded → recover path
- [ ] Clean uninstall; optional delete of `%LOCALAPPDATA%\BunnyOS\`

## G. Security gate

- [ ] Prompt-injection corpus cannot reach shell/process/file execution (allowlist broker)
- [ ] Non-HTTPS / file / javascript URLs rejected
- [ ] Diagnostics export contains no transcripts/audio/memory text by default
- [ ] Logs under `%LOCALAPPDATA%\BunnyOS\logs\` contain lifecycle only (no chat bodies)

## I. Island & Apps stability (P0)

- [ ] Expand island → dashboard fully clickable (no stuck click-through)
- [ ] Notification pill: no white/black plate behind text
- [ ] Apps → Rescan lists Start Menu / Applications entries
- [ ] App dock shows PNG icons when OS extract succeeds; glyph fallback shows status if not

## H. Daily-drive sign-off (human)

Date range: ________ → ________  
Machines: ________  
Issues found: ________  

- [ ] Used as daily local assistant for several days
- [ ] No expansion of allowlist until this section is signed

Signer: ________
