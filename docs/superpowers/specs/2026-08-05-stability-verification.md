# P0 stability verification — 2026-08-05

Automated gates run on dev host (Windows).

| Gate | Result |
|------|--------|
| `npm run lint` | PASS |
| `npm test` | PASS (143 tests) |
| `npm run build:frontend` | PASS |
| `npm run test:e2e` | PASS (4 tests) |
| `cargo test` | SKIP — `link.exe` not available (no MSVC Build Tools on this host) |

## Manual desktop soak (required before tag)

- [ ] Expand island → dashboard fully clickable
- [ ] Notification pill: no white/black plate
- [ ] Apps Rescan → real entries + PNG icons where OS extract succeeds

See `docs/beta-checklist.md` section I.
