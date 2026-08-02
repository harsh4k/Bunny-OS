import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const outDir = resolve(process.cwd(), "out");
const docsDir = resolve(process.cwd(), "..", "docs");

/** Never wipe these when exporting the Next site into docs/. */
function shouldKeep(name) {
  if (name === "superpowers") return true;
  if (name.endsWith(".md")) return true;
  return false;
}

if (!existsSync(outDir)) {
  console.error("Missing out/ — run next build first.");
  process.exit(1);
}

mkdirSync(docsDir, { recursive: true });

for (const name of readdirSync(docsDir)) {
  if (shouldKeep(name)) continue;
  rmSync(join(docsDir, name), { recursive: true, force: true });
}

for (const name of readdirSync(outDir)) {
  cpSync(join(outDir, name), join(docsDir, name), { recursive: true });
}

const brand = resolve(process.cwd(), "public", "bunny-os.jpg");
if (existsSync(brand)) {
  cpSync(brand, join(docsDir, "bunny-os.jpg"));
}

// GitHub Pages runs Jekyll by default; without this, `_next/` is omitted (404 CSS/JS).
writeFileSync(join(docsDir, ".nojekyll"), "");

console.log("Exported Next site into docs/ for GitHub Pages.");
console.log("Preserved all *.md and docs/superpowers/");
