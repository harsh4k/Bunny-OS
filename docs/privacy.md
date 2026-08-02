# Privacy Policy — Bunny OS

**Effective date:** 2 August 2026  
**Last updated:** 2 August 2026  
**Product:** Bunny OS (desktop application for Windows and macOS)  
**Publisher:** harsh4k (personal / private beta)  
**Contact / grievances:** [GitHub Issues](https://github.com/harsh4k/Bunny-OS/issues)

> This policy describes how Bunny OS handles information on **your** computer.  
> It is written for users in **India** with reference to the **Digital Personal Data Protection Act, 2023 (DPDP Act)**, the **Information Technology Act, 2000**, and related rules.  
> **This is not legal advice.** If you need advice for your situation, consult a qualified Indian lawyer.

Public page: <https://harsh4k.github.io/Bunny-OS/privacy/>

---

## 1. Plain summary

| Topic | What Bunny does |
|---|---|
| Cloud / telemetry | **None.** Bunny does not phone home or sell data. |
| Where data lives | On **your device** only (app data folder). |
| Microphone | Opt-in; used only while you talk (e.g. hold F9). Raw audio is **not** saved. |
| Chat / voice AI | Runs locally via **Ollama** and **faster-whisper** on your machine. |
| Screen context | **Off by default.** If you turn it on, Bunny may read focused-window UI text when you ask about the screen. |
| Children | Not directed at children under 18. |

---

## 2. Who we are and your role under Indian law

Bunny OS is a **personal-use desktop program**. You install and run it yourself.

Under the DPDP Act:

- You are typically the **Data Principal** for information about you that the app processes on your device.
- Because processing stays on your machine and we do not operate a cloud service that collects your personal data, many “Data Fiduciary” cloud duties that apply to online platforms **do not apply in the same way**. We still explain what the software does so you can make an informed choice (consent / notice).

If this product is later offered commercially or processes others’ data on your behalf, this policy will be updated.

---

## 3. What information the app may process

All of the following stay **local** unless **you** deliberately open an external site or installer:

1. **Voice audio (temporary)** — captured in memory for speech-to-text; not written as raw recordings.
2. **Transcripts / chat text** — used to run commands or chat; may be stored if Memory / session log is enabled.
3. **Memory facts** — optional text you save; you can review, export, or delete.
4. **App inventory** — names/paths of installed apps from a read-only scan so “open Notepad” works.
5. **Settings** — wake phrase, mute, screen-context toggle, etc. (local config / SQLite).
6. **Logs** — technical logs for debugging; rotated (~7-day retention).
7. **Screen-context text (optional)** — focused window title / UI text when Screen is On and you ask a screen-related question. Not continuous capture; not uploaded.
8. **Update check (optional)** — only if **you** click Compare on the Updates panel: one request to GitHub’s public Releases API. No account required.

### Third-party software you may install

- **Ollama** (from ollama.com) and models you pull — subject to Ollama’s own terms/privacy.
- **YouTube / Spotify / browser pages** — if you ask Bunny to open them, those sites’ policies apply.
- **GitHub** — if you download installers or open Issues.

Bunny does not send your microphone audio or chat to those services for AI inference.

---

## 4. Purpose of processing

- Provide a local voice/chat assistant and allowlisted desktop actions you request.
- Remember optional facts you choose to save.
- Improve reliability via local logs you can export/delete with diagnostics tools.

We do **not** process data for advertising, profiling for third parties, or sale of personal data.

---

## 5. Consent and your controls

By installing and using Bunny OS you agree to this policy and the [Terms of Use](terms.md).

You can:

- Keep the microphone muted; unmute only while using push-to-talk / wake.
- Disable Memory and Screen context.
- Delete memories, clear session log, or uninstall (see [uninstall docs](uninstall.md)).
- Refuse optional GitHub update compare and Ollama install.

Withdrawing consent for optional features is done in the app (toggles / delete). Uninstalling removes the program; you may still need to delete the app-data folder to wipe local databases/logs.

---

## 6. Retention

| Data | Typical retention |
|---|---|
| Raw mic audio | Not retained on disk |
| Memory / session (if enabled) | Until you delete or clear |
| Logs | About 7 days (rotation) |
| Settings | Until you change or uninstall + wipe app data |

---

## 7. Security

- No free-form shell execution; actions are allowlisted.
- Privileged browser type/click needs on-screen confirm.
- Installers should be verified with published checksums (`SHA256SUMS.txt`).
- Beta builds may be **unsigned** (Windows SmartScreen / macOS Gatekeeper warnings are expected).

No security measure is perfect. Use a personal device you control.

---

## 8. Cross-border transfer

Bunny OS is designed so **personal data processed by the app stays on your device**. We do not operate a Bunny cloud that transfers your transcripts abroad.

If **you** visit foreign websites or download Ollama/models, those providers’ locations and policies apply.

---

## 9. Children

Bunny OS is intended for users **18 years or older** (age of majority for contracting in India). Do not use it to process children’s data.

---

## 10. Your rights (DPDP-oriented)

For data stored **on your device** by Bunny OS, you can access, correct, and erase it using in-app Memory controls, diagnostics export, and by deleting local app data / uninstalling.

To raise a grievance about this policy or the software’s data practices, open a GitHub Issue (link above). We will aim to respond within a reasonable time for a personal beta project.

You may also have rights to approach the Data Protection Board of India under the DPDP Act for applicable complaints against Data Fiduciaries; that framework is aimed primarily at organisations processing personal data in the course of offering goods/services—not at software that only runs offline on your PC. This paragraph is informational only.

---

## 11. Changes

We may update this policy when features change. The “Last updated” date will change. Continued use after an update means you accept the revised policy for that version.

---

## 12. Governing language

English version controls. If translated, English prevails in case of conflict.
