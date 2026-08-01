# Shipping checklist — Bunny OS (unsigned beta)

We are **not** paying for Windows Authenticode or Apple Developer notarization.
Distribution is checksum-verified + clear SmartScreen / Gatekeeper instructions.

## What ships

| Layer | Status |
|---|---|
| Code paths Win + Mac | Yes |
| CI release artifacts | MSI + arm64/x64 DMG + `SHA256SUMS.txt` via `.github/workflows/release.yml` |
| Checksums | Install scripts **fail closed** without `SHA256SUMS.txt` |
| Whisper | Prefetched into frozen sidecar in CI |
| Ollama | Auto-download official installer + pull `llama3.2:1b` on first use |
| Paid code signing | **Skipped** (by choice) |

## Tag a beta release

```powershell
git tag v0.1.1
git push origin v0.1.1
```

Watch **Actions → release**. When green, the GitHub Release page has the installers.

```powershell
irm https://raw.githubusercontent.com/harsh4k/Bunny-OS/main/install.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/harsh4k/Bunny-OS/main/install.sh | bash
```

## Unsigned OS warnings (expected)

### Windows SmartScreen
1. “Windows protected your PC”
2. **More info** → **Run anyway**

### macOS Gatekeeper
`install.sh` copies into `/Applications` and runs `xattr -dr com.apple.quarantine` on the app.
If Finder still blocks: right-click app → **Open** → Open.

## After CI is green (human beta)

Use [`docs/beta-checklist.md`](beta-checklist.md) — install, onboarding, F9, wake, chat, uninstall.
