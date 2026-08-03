# Update strategy & rollback — Bunny OS private beta

## Update model (private beta)

Bunny OS private beta uses **manual updates**, with an in-app **Updates** panel:

1. Dashboard → **Updates** shows the installed version.
2. **Download Windows** / **Download Mac** open the latest MSI/DMG from GitHub Releases (allowlisted HTTPS only).
3. **Check for update** (optional) does one HTTPS GET to the public GitHub Releases API, compares tags, and refreshes asset URLs. No background polling.
4. **All releases** opens `https://github.com/harsh4k/Bunny-OS/releases` in the default browser.
5. Run the installer; verify `SHA256SUMS.txt` when published:
   ```powershell
   Get-FileHash -Algorithm SHA256 .\Bunny.OS_x.y.z_x64_en-US.msi
   ```
6. Install over the previous version (Windows installer upgrade / replace `.app` on Mac).
7. Keep Ollama and models as **external** prerequisites — they are not replaced by the app installer.

The Updates panel also shows a **status board**: Ollama installed/running/version, chat models (recommended present?), and voice (bundled with Bunny). Actions: Install/start Ollama, open Ollama download, pull recommended model via `ensure_ollama`. Refresh is user-triggered only.

There is **no silent auto-update**. Opening an installer URL uses the system browser/download manager — Bunny does not write installers into app data. Tauri updater + code signing is planned post-beta and must never embed private signing keys in the repo.

## Signing

- Code signing certificate thumbprint may be set in `src-tauri/tauri.conf.json` → `bundle.windows.certificateThumbprint` on the release machine only.
- Prefer injecting the thumbprint via CI secret / local override — do not commit secrets.
- Unsigned builds are acceptable for local smoke tests; private beta distribution should be signed when a cert is available.

## Rollback

1. Uninstall the newer Bunny OS build from Windows Apps & features.
2. Reinstall the previous known-good installer (keep prior artifacts + checksums).
3. User data lives under `%LOCALAPPDATA%\BunnyOS\` (memory DB, logs, diagnostics).  
   Rollback of the app binary does **not** automatically wipe this directory.
4. To fully reset: quit Bunny OS, delete `%LOCALAPPDATA%\BunnyOS\`, then reinstall.

## Sidecar / Ollama mismatch

If a new app build expects a bundled sidecar binary:

```powershell
pwsh -File scripts/package-sidecar.ps1
npm run build
```

If Ollama is missing or outdated, Bunny OS stays usable for tray/lifecycle UI and shows actionable errors for chat/pull — it does not silently install models.

## Release checklist (maintainer)

1. `pwsh -File scripts/verify-beta.ps1`
2. `pwsh -File scripts/package-sidecar.ps1`
3. `npm run build` (requires MSVC `link.exe`)
4. Sign installer (human + cert)
5. `pwsh -File scripts/checksum-release.ps1 -Path <installer-or-dir>`
6. Attach installer + `SHA256SUMS.txt` to the release notes
