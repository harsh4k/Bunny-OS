# Update strategy & rollback — Bunny OS private beta

## Update model (private beta)

Bunny OS private beta uses **manual updates**:

1. Download the new installer from the trusted release channel.
2. Verify the published `SHA256SUMS.txt` with:
   ```powershell
   Get-FileHash -Algorithm SHA256 .\BunnyOS_x.y.z_x64-setup.exe
   ```
3. Install over the previous version (Windows installer upgrade).
4. Keep Ollama and models as **external** prerequisites — they are not replaced by the app installer.

There is **no silent auto-update** in MVP. Auto-update with hash verification is planned post-beta and must never embed private signing keys in the repo.

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
