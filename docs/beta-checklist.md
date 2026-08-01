# Private beta checklist — Bunny OS

Use this before expanding the action allowlist. Automated gates do **not** replace the human items.

## A. Automated (CI / local)

```powershell
pwsh -File scripts/verify-beta.ps1
```

Expected: frontend tests, lint, frontend build, Python suite, `cargo fmt --check` all pass.  
If `link.exe` is present, `cargo test` also runs.

## B. Packaging

- [ ] `pwsh -File scripts/package-sidecar.ps1` produces `src-tauri/binaries/bunny-sidecar-x86_64-pc-windows-msvc.exe`
- [ ] `npm run build` produces a Windows installer (requires VS Build Tools / MSVC)
- [ ] Installer is code-signed (cert not in repo)
- [ ] `pwsh -File scripts/checksum-release.ps1 -Path <artifact>` written and published

## C. Fresh install / first run

- [ ] Fresh Windows 10/11 VM or clean profile install
- [ ] `irm https://raw.githubusercontent.com/harsh4k/Bunny-OS/main/install.ps1 | iex` (or `-LocalMsi`)
- [ ] Onboarding: privacy → system scan → mic/sound settings links → Ollama check → Finish
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

## H. Daily-drive sign-off (human)

Date range: ________ → ________  
Machines: ________  
Issues found: ________  

- [ ] Used as daily local assistant for several days
- [ ] No expansion of allowlist until this section is signed

Signer: ________
