# Ponytail cut decisions (2026-08-02)

Challenge each audit finding before cutting.

| Finding | Verdict | Why |
|---|---|---|
| Dual Rust/Python executors | **KEEP** | Voice needs in-process execute; chat needs broker + audit confirm. Merge = redesign. |
| Delete docs/superpowers | **KEEP** | Agent/process source of truth; not dead code. |
| Unify Start Menu scans | **KEEP** | Catalog returns names; open_app needs `.lnk` paths — different jobs. |
| Advisor CSS shell dup | **CUT** | Reuse ChatPanel shell classes. |
| Static Voice board row | **CUT** | Hardcode in UI; drop from Rust board. |
| Twin open_* page commands | **CUT** | One allowlisted `open_trusted_https`. |
| Placeholder IPC | **CUT** | Unused, not in Python allowlist. |
| `get_focused_window_text` IPC | **CUT** | No UI caller; keep `platform_screen` for enrich. |
| UpdatesPanel shrink | **CUT** | Drop redundant getVersion; one Ollama CTA. |
| voice_intents table | **KEEP** | High voice regression risk for little gain. |
| Identity aliases | **CUT** | Pure no-ops; `.get(key, key)` covers. |
| browser_click_role | **KEEP** | Shipped W4 allowlist feature; Mac stub is honest. |
| pending_snapshot | **KEEP** | Test helper; private `_pending` access is worse. |
| Unify DEFAULT_MODEL tags | **KEEP** | `llama3.2:1b` (pull) vs instruct-q4 (chat prefer) are intentional. |
