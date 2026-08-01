# Shipping checklist — Bunny OS (real users)

## What “no gaps” means here

| Layer | Status |
|---|---|
| Code paths Win + Mac | Shipped (voice, wake “hey bunny”, media, installers) |
| CI builds both OS | `.github/workflows/release.yml` on `v*` tags |
| Checksums on release | `SHA256SUMS.txt` uploaded; installers **fail closed** without it |
| Whisper weights | Prefetched into frozen sidecar in CI (`BUNNY_PREFETCH_WHISPER=1`) |
| First-run UI | Forces dashboard + onboarding (mic / Accessibility on Mac) |
| **Code signing** | **Requires your certs** — see below |

## Tag a public release

```powershell
git tag v0.1.0
git push origin v0.1.0
```

Watch **Actions → release**. When green, users install with:

```powershell
irm https://raw.githubusercontent.com/harsh4k/Bunny-OS/main/install.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/harsh4k/Bunny-OS/main/install.sh | bash
```

## Code signing (required before wide public traffic)

Without these, Windows SmartScreen and macOS Gatekeeper will scare users. Install scripts clear quarantine on Mac as a **beta** escape hatch — that is not a substitute for notarization.

### Windows Authenticode
1. Buy/create a code-signing certificate
2. Configure Tauri / CI secrets for MSI signing (`certificateThumbprint` or Azure/SignPath)

### Apple Developer ID + notarization
Add GitHub Actions secrets (used by `release.yml` when present):

| Secret | Purpose |
|---|---|
| `APPLE_CERTIFICATE` | Base64 `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | p12 password |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: …` |
| `APPLE_ID` | Apple ID email |
| `APPLE_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | Team ID |

Until secrets exist, CI still publishes **unsigned** DMGs. `install.sh` removes quarantine after copy to `/Applications`.

## Manual verify after CI

1. Release page has `.msi`, arm64 `.dmg`, x64 `.dmg`, `SHA256SUMS.txt`
2. `install.ps1 -WhatIf` / `install.sh --what-if` resolve assets
3. Fresh VM / Mac: install → onboarding → F9 PTT → wake “hey bunny” → media play

## Honest remaining risk until certs

- SmartScreen / Gatekeeper warnings on first download
- Notarization stapling only after Apple secrets are set
