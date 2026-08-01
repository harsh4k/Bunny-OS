# Cargo config for Bunny OS

`config.toml` is intentionally absent so macOS / Linux / MSVC CI hosts are not forced onto MinGW.

For **local Windows MinGW (GNU) builds**, copy the override:

```powershell
Copy-Item .cargo\config.toml.windows .cargo\config.toml
```

That file pins `x86_64-pc-windows-gnu`, a space-safe `target-dir`, and the `gcc` linker.

Release CI (`.github/workflows/release-windows.yml`) uses the MSVC target and does not need this file.
