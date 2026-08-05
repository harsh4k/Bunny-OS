import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const websitePackage = JSON.parse(readFileSync("website/package.json", "utf8"));
const tauriConfig = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const cargoToml = readFileSync("src-tauri/Cargo.toml", "utf8");
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1];

const versions = {
  "package.json": packageJson.version,
  "website/package.json": websitePackage.version,
  "src-tauri/tauri.conf.json": tauriConfig.version,
  "src-tauri/Cargo.toml": cargoVersion,
};
const expected = packageJson.version;
const mismatches = Object.entries(versions).filter(([, version]) => version !== expected);

if (mismatches.length > 0) {
  for (const [file, version] of mismatches) {
    console.error(`${file}: expected ${expected}, found ${version ?? "missing"}`);
  }
  process.exit(1);
}

const releaseTag = process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME || "";
if (releaseTag && releaseTag !== `v${expected}`) {
  console.error(`Release tag ${releaseTag} does not match app version v${expected}`);
  process.exit(1);
}

const updateLinks = readFileSync("src/lib/updateLinks.ts", "utf8");
if (!updateLinks.includes(`v${expected}`)) {
  console.error(`src/lib/updateLinks.ts: expected v${expected} in fallback installer URLs`);
  process.exit(1);
}

console.log(`Version OK: ${expected}${releaseTag ? ` (${releaseTag})` : ""}`);
