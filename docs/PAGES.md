# Enable / refresh the public site

GitHub → **Settings** → **Pages** → Deploy from branch **main** → folder **/docs**.

`docs/.nojekyll` must exist so GitHub Pages serves the Next `_next/` CSS/JS (Jekyll otherwise hides `_`-prefixed folders).

## Edit the site

Source lives in `website/` (Next.js + shadcn). Brand icon files:

- `website/public/bunny-os.jpg`
- `website/public/icon.png`

Always use those for logo / favicon / menu mark.

```powershell
cd website
npm install
npm run dev          # local preview
npm run export:pages # builds and copies into ../docs
```

Commit `website/` + updated `docs/` export, then push.

| Page | URL |
|---|---|
| Home | https://harsh4k.github.io/Bunny-OS/ |
| Privacy | https://harsh4k.github.io/Bunny-OS/privacy/ |
| Terms | https://harsh4k.github.io/Bunny-OS/terms/ |

Markdown legal sources (kept): [`privacy.md`](privacy.md), [`terms.md`](terms.md).
