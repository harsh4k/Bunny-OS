# Uninstall & data cleanup — Bunny OS

## Windows

1. **Settings → Apps → Installed apps** → Bunny OS → Uninstall  
   or run the MSI with `msiexec /x {ProductCode}`
2. The installer removes the program files and Start Menu / tray registration.

### Optional: wipe local data

`%LOCALAPPDATA%\BunnyOS\`

| Path | Contents |
|---|---|
| `logs\` | Lifecycle logs (7-day retention) |
| `*.sqlite` / memory DB | Opt-in memory facts |
| `wake\` | Wake phrase settings + optional custom models |
| `diagnostics\` | Exported toolchain dumps |
| config TOML | User settings |

```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\BunnyOS" -ErrorAction SilentlyContinue
```

## macOS

1. Quit Bunny OS from the menu bar / tray.
2. Drag **Bunny OS.app** from `/Applications` to Trash (or delete the app bundle).
3. Empty Trash if you want the binary gone immediately.

### Optional: wipe local data

`~/Library/Application Support/BunnyOS/`

```bash
rm -rf "$HOME/Library/Application Support/BunnyOS"
```

This does **not** remove Ollama or its models (`~/.ollama`).

## Verify clean state

- No Bunny OS in Start Menu (Windows) / Applications (macOS)
- No tray / menu-bar icon after reboot
- Optional: confirm the app-data folder above is gone if you wiped it
