# Bunny OS website (Next.js + shadcn)

Marketing site for GitHub Pages. Uses the official Bunny icon (`public/bunny-os.jpg`, `public/icon.png`).

## Develop

```powershell
cd website
npm install
npm run dev
```

Open http://localhost:3000

## Publish to GitHub Pages

Pages is set to **main / docs**. Export the Next build into `docs/`:

```powershell
cd website
npm run export:pages
```

Then commit the updated `docs/` output (plus `website/` source) and push.

## Brand

Always use:

- `public/bunny-os.jpg` — hero / wordmark companion
- `public/icon.png` — favicon / small marks (from `src-tauri/icons/128x128.png`)
