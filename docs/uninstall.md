# Uninstall & data cleanup — Bunny OS (Windows)

## Uninstall the app

1. **Settings → Apps → Installed apps** → Bunny OS → Uninstall  
   or run the MSI with `msiexec /x {ProductCode}`
2. The installer removes the program files and Start Menu / tray registration.

## Optional: wipe local data

Bunny keeps privacy-sensitive data under:

`%LOCALAPPDATA%\BunnyOS\`

| Path | Contents |
|---|---|
| `logs\` | Lifecycle logs (7-day retention) |
| `*.sqlite` / memory DB | Opt-in memory facts |
| `diagnostics\` | Exported toolchain dumps |
| config TOML | User settings |

To fully reset after uninstall:

```powershell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\BunnyOS" -ErrorAction SilentlyContinue
```

This does **not** remove Ollama or its models (`%LOCALAPPDATA%\Ollama` / `~\.ollama`).

## Verify clean state

- No `Bunny OS` in Start Menu
- No tray icon after reboot
- Optional: confirm `%LOCALAPPDATA%\BunnyOS` is gone if you wiped it
