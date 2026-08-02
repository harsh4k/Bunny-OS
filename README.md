# Bunny OS

<p align="center">
  <img src="bunny-os.jpg" alt="Bunny OS" width="160" />
</p>

<p align="center">
  <strong>A voice helper for your computer.</strong><br />
  Windows &amp; Mac · stays on your PC · no account needed
</p>

---

## Install (easiest)

**Website:** [harsh4k.github.io/Bunny-OS](https://harsh4k.github.io/Bunny-OS/)

<p align="center">
  <img src="bunny-os.jpg" alt="Bunny OS icon" width="120" />
</p>

| Your computer | Click this |
|---|---|
| **Windows** | [Download Bunny OS](https://github.com/harsh4k/Bunny-OS/releases/download/v0.2.1/Bunny.OS_0.2.1_x64_en-US.msi) |
| **Mac (Apple chip)** | [Download Bunny OS](https://github.com/harsh4k/Bunny-OS/releases/download/v0.2.1/Bunny.OS_0.2.1_aarch64.dmg) |

### First-time steps

1. Download the file for your computer (table above).
2. Open it. **Windows** may say it protected your PC → **More info** → **Run anyway**.
3. Follow the short setup on screen (microphone + optional chat helper).
4. Hold **F9** and talk. Or click the Bunny icon near the clock.

Checksums: [SHA256SUMS.txt](https://github.com/harsh4k/Bunny-OS/releases/download/v0.2.1/SHA256SUMS.txt) · [All versions](https://github.com/harsh4k/Bunny-OS/releases)

**Before you install:** [Privacy Policy](https://harsh4k.github.io/Bunny-OS/privacy.html) · [Terms of Use](https://harsh4k.github.io/Bunny-OS/terms.html)  
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

- Hold **F9** to talk — Bunny listens, thinks, and can speak back
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
