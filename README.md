# Bunny OS

<p align="center">
  <img src="bunny-os.jpg" alt="Bunny OS" width="160" />
</p>

<p align="center">
  <strong>Local voice assistant for your desktop.</strong><br />
  Windows &amp; macOS · no cloud · no telemetry · you stay in control
</p>

Hold **F9** to talk. Say **Hey Bunny** if you enable wake word. Bunny opens apps, searches YouTube, controls media, and chats — all on your machine via [Ollama](https://ollama.com).

---

## Install

### Windows

```powershell
irm https://raw.githubusercontent.com/harsh4k/Bunny-OS/main/install.ps1 | iex
```

### macOS (Apple Silicon)

```bash
curl -fsSL https://raw.githubusercontent.com/harsh4k/Bunny-OS/main/install.sh | bash
```

The script downloads the latest GitHub Release, verifies `SHA256SUMS.txt`, installs, and launches. **No other packages to install** — on first run Bunny can set up official Ollama and a small chat model for you.

| | |
|---|---|
| **Latest** | [v0.2.0](https://github.com/harsh4k/Bunny-OS/releases/latest) |
| **Unsigned beta** | Windows SmartScreen → *More info* → *Run anyway*. macOS: right-click → *Open* if Gatekeeper blocks. |
| **Uninstall** | [docs/uninstall.md](docs/uninstall.md) |

---

## What you get

- **Push-to-talk** — hold F9; island shows while Bunny listens / thinks / speaks
- **Wake word** — optional custom phrase (default **Hey Bunny**); never approves actions by itself
- **Chat** — local models through Ollama; cancel anytime
- **Allowlisted actions** — open apps & HTTPS links, YouTube search/play, Spotify search, media keys, time/date, system summary — no free-form shell
- **Memory** — optional local facts you can review, export, or delete
- **Privacy** — mic starts muted; audio stays in memory; nothing phones home

---

## First launch

1. Complete the short onboarding (privacy → scan → mic → Ollama).
2. If Ollama isn’t installed, tap **Install & start Ollama** — Bunny uses the official installer and only pulls a default model when you have none.
3. Hold **F9** and speak, or open the island from the tray for Chat / Models / Wake.

Tray: left-click shows or hides the panel; right-click has Mute, Wake settings, Quit.

---

## Privacy in one glance

| | |
|---|---|
| Data stays on this PC | ✓ |
| Cloud APIs / telemetry | ✗ |
| Speech & chat | Local (faster-whisper + Ollama) |
| Raw microphone audio | Never written to disk |
| Privileged actions | Click / confirm — voice alone can’t approve them |

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
| `pwsh -File scripts/package-sidecar.ps1` | Frozen sidecar (set `BUNNY_PREFETCH_WHISPER=1` for release) |
| `pwsh -File scripts/verify-beta.ps1` | Automated beta gates |

Stack: **Tauri v2 + React/TypeScript + Rust + Python sidecar**. Project contract: [`CLAUDE.md`](CLAUDE.md). Deeper docs: [`docs/`](docs/). Shipping: [`docs/SHIPPING.md`](docs/SHIPPING.md).

---

## License

Personal / private beta. See the repo for terms as they evolve.
