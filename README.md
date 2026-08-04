# Bunny OS

<p align="center">
  <img src="docs/bunny-os.jpg" alt="Bunny OS" width="160" />
</p>

<p align="center">
  <strong>A voice helper for your computer.</strong><br />
  Windows &amp; Mac · stays on your PC · no account needed
</p>

<p align="center">
  <a href="https://github.com/harsh4k/Bunny-OS/releases/download/v0.3.4/Bunny.OS_0.3.4_x64_en-US.msi"><img src="https://img.shields.io/badge/Windows-0.3.4_MSI-0e0f12?style=for-the-badge&labelColor=d4bc94" alt="Download Windows MSI 0.3.4" /></a>
  <a href="https://github.com/harsh4k/Bunny-OS/releases/download/v0.3.4/Bunny.OS_0.3.4_aarch64.dmg"><img src="https://img.shields.io/badge/macOS-0.3.4_DMG-0e0f12?style=for-the-badge&labelColor=d4bc94" alt="Download Mac DMG 0.3.4" /></a>
  <a href="https://harsh4k.github.io/Bunny-OS/"><img src="https://img.shields.io/badge/Website-harsh4k.github.io-0e0f12?style=for-the-badge&labelColor=9aa1ad" alt="Bunny OS website" /></a>
</p>

---

## Install (easiest)

**Current release: [v0.3.4](https://github.com/harsh4k/Bunny-OS/releases/tag/v0.3.4)** · **Website:** [harsh4k.github.io/Bunny-OS](https://harsh4k.github.io/Bunny-OS/)

| Your computer | Installer |
|---|---|
| **Windows 10/11 (x64)** | [Bunny.OS_0.3.4_x64_en-US.msi](https://github.com/harsh4k/Bunny-OS/releases/download/v0.3.4/Bunny.OS_0.3.4_x64_en-US.msi) |
| **Mac (Apple silicon)** | [Bunny.OS_0.3.4_aarch64.dmg](https://github.com/harsh4k/Bunny-OS/releases/download/v0.3.4/Bunny.OS_0.3.4_aarch64.dmg) |

### First-time steps

1. Download the file for your computer (badges above or table).
2. Open it. **Windows** may say it protected your PC → **More info** → **Run anyway**.
3. Follow the short setup on screen (microphone + optional chat helper).
4. Hold **F9** and talk — the top-edge island expands while Bunny listens. Or click the Bunny icon near the clock.

Checksums: [SHA256SUMS.txt](https://github.com/harsh4k/Bunny-OS/releases/download/v0.3.4/SHA256SUMS.txt) · [All releases](https://github.com/harsh4k/Bunny-OS/releases/latest)

**Before you install:** [Privacy Policy](https://harsh4k.github.io/Bunny-OS/privacy/) · [Terms of Use](https://harsh4k.github.io/Bunny-OS/terms/)  
(Markdown copies: [`docs/privacy.md`](docs/privacy.md), [`docs/terms.md`](docs/terms.md))

### Advanced install (optional)

```powershell
irm https://raw.githubusercontent.com/harsh4k/Bunny-OS/main/install.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/harsh4k/Bunny-OS/main/install.sh | bash
```

[Uninstall help](docs/uninstall.md)

---

## What you can do

- Hold **F9** to talk — a sleek top bar expands into the voice island while Bunny listens, thinks, and can speak back
- Optional wake phrase (**Hey Bunny**)
- Chat with a **local** model (Ollama) — nothing is sent to a Bunny cloud
- Open apps, YouTube, Spotify search, media keys, time/date
- Optional Memory and Screen context (you turn them on)
- Updates board — check version yourself; no silent auto-install

---

## Privacy in one glance

| | |
|---|---|
| Data stays on this PC | ✓ |
| Cloud APIs / telemetry from Bunny | ✗ |
| Speech & chat | Local (faster-whisper + Ollama) |
| Raw microphone audio | Never written to disk |
| Risky actions | Need your confirm on screen |

---

## Develop (contributors)

```powershell
npm install
python scripts/gen-icons.py
npm run dev
```

| Command | What it does |
|---|---|
| `npm run lint` / `npm test` | Type-check & frontend tests |
| `python -m unittest discover -s sidecar/tests` | Sidecar tests |
| `pwsh -File scripts/package-sidecar.ps1` | Frozen sidecar |
| `pwsh -File scripts/verify-beta.ps1` | Automated beta gates |

Stack: **Tauri v2 + React/TypeScript + Rust + Python sidecar**. Contract: [`CLAUDE.md`](CLAUDE.md). More: [`docs/`](docs/). Shipping: [`docs/SHIPPING.md`](docs/SHIPPING.md). Public site setup: [`docs/PAGES.md`](docs/PAGES.md).

---

## Licence

Personal / private beta. See [Terms of Use](docs/terms.md).
