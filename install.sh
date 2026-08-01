#!/usr/bin/env bash
# Bunny OS macOS bootstrap
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/harsh4k/Bunny-OS/main/install.sh | bash
#   BUNNY_VERSION=v0.1.0 ./install.sh
#   ./install.sh --local-dmg ./Bunny-OS_0.1.0_aarch64.dmg
#   ./install.sh --what-if
#
# Downloads the latest GitHub Release .dmg, verifies SHA256 when a checksums
# asset is present, then opens it. Does not pip-install anything — the release
# DMG already embeds the frozen sidecar.

set -euo pipefail

REPO="${BUNNY_REPO:-harsh4k/Bunny-OS}"
VERSION="${BUNNY_VERSION:-latest}"
LOCAL_DMG=""
WHAT_IF=0
SKIP_LAUNCH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --local-dmg) LOCAL_DMG="${2:-}"; shift 2 ;;
    --what-if) WHAT_IF=1; shift ;;
    --skip-launch) SKIP_LAUNCH=1; shift ;;
    --repo) REPO="${2:-}"; shift 2 ;;
    --version) VERSION="${2:-}"; shift 2 ;;
    -h|--help)
      echo "Usage: install.sh [--local-dmg PATH] [--version TAG|latest] [--what-if] [--skip-launch]"
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

step() { printf '==> %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

api_headers=(-H "Accept: application/vnd.github+json" -H "User-Agent: BunnyOS-Install" -H "X-GitHub-Api-Version: 2022-11-28")
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  api_headers+=(-H "Authorization: Bearer $GITHUB_TOKEN")
fi

fetch_release() {
  local url
  if [[ "$VERSION" == "latest" ]]; then
    url="https://api.github.com/repos/$REPO/releases/latest"
  else
    local tag="$VERSION"
    [[ "$tag" == v* ]] || tag="v$tag"
    url="https://api.github.com/repos/$REPO/releases/tags/$tag"
  fi
  curl -fsSL "${api_headers[@]}" "$url"
}

find_dmg() {
  # stdin: release JSON → stdout: browser_download_url\tname
  python3 - <<'PY'
import json, sys
rel = json.load(sys.stdin)
assets = rel.get("assets") or []
for a in assets:
    name = a.get("name") or ""
    if name.lower().endswith(".dmg"):
        print(f"{a['browser_download_url']}\t{name}")
        sys.exit(0)
sys.exit(1)
PY
}

find_checksum() {
  python3 - <<'PY'
import json, sys
rel = json.load(sys.stdin)
assets = rel.get("assets") or []
for a in assets:
    name = (a.get("name") or "").lower()
    if "sha256" in name or "checksum" in name:
        print(f"{a['browser_download_url']}\t{a['name']}")
        sys.exit(0)
sys.exit(1)
PY
}

verify_sha256() {
  local path="$1" expected="$2"
  local actual
  actual="$(shasum -a 256 "$path" | awk '{print tolower($1)}')"
  expected="$(printf '%s' "$expected" | tr '[:upper:]' '[:lower:]' | awk '{print $1}')"
  if [[ "$actual" != "$expected" ]]; then
    fail "SHA256 mismatch for $path"$'\n'"  expected $expected"$'\n'"  actual   $actual"
  fi
  echo "OK: SHA256 verified"
}

ollama_ok() {
  curl -fsS --max-time 2 "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1
}

echo "Bunny OS installer (macOS)"
echo "Repo: $REPO  Version: $VERSION"
if (( WHAT_IF )); then echo "(WhatIf — no download / install)"; fi

INSTALLER_PATH=""

if [[ -n "$LOCAL_DMG" ]]; then
  [[ -f "$LOCAL_DMG" ]] || fail "Local DMG not found: $LOCAL_DMG"
  INSTALLER_PATH="$(cd "$(dirname "$LOCAL_DMG")" && pwd)/$(basename "$LOCAL_DMG")"
  step "Using local installer $INSTALLER_PATH"
else
  step "Fetching release metadata"
  RELEASE_JSON="$(fetch_release)" || fail "Could not fetch release. Tag a release (v0.1.0) after CI builds, or pass --local-dmg."
  TAG="$(printf '%s' "$RELEASE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tag_name",""))')"
  echo "Release: $TAG"

  if ! DMG_LINE="$(printf '%s' "$RELEASE_JSON" | find_dmg)"; then
    fail "No .dmg asset on release $TAG. Push a tag so .github/workflows/release-macos.yml can publish one, or pass --local-dmg."
  fi
  DMG_URL="${DMG_LINE%%$'\t'*}"
  DMG_NAME="${DMG_LINE#*$'\t'}"

  TMP="${TMPDIR:-/tmp}/bunny-os-install"
  mkdir -p "$TMP"
  INSTALLER_PATH="$TMP/$DMG_NAME"

  if (( WHAT_IF )); then
    echo "[WhatIf] would download $DMG_URL → $INSTALLER_PATH"
  else
    step "Downloading $DMG_NAME"
    curl -fsSL -o "$INSTALLER_PATH" "$DMG_URL"
  fi

  if SUM_LINE="$(printf '%s' "$RELEASE_JSON" | find_checksum)" && (( ! WHAT_IF )); then
    SUM_URL="${SUM_LINE%%$'\t'*}"
    SUM_NAME="${SUM_LINE#*$'\t'}"
    SUM_PATH="$TMP/$SUM_NAME"
    step "Downloading checksums $SUM_NAME"
    curl -fsSL -o "$SUM_PATH" "$SUM_URL"
    HASH_LINE="$(grep -F "$DMG_NAME" "$SUM_PATH" | head -n1 || true)"
    if [[ -n "$HASH_LINE" ]]; then
      HASH="$(printf '%s' "$HASH_LINE" | awk '{print $1}')"
      verify_sha256 "$INSTALLER_PATH" "$HASH"
    else
      warn "Checksum file has no line for $DMG_NAME; skipping verify."
    fi
  elif (( ! WHAT_IF )); then
    warn "No checksum asset on this release; install continues unverified."
  fi
fi

step "Opening installer: $INSTALLER_PATH"
if (( WHAT_IF )); then
  echo "[WhatIf] open \"$INSTALLER_PATH\""
else
  open "$INSTALLER_PATH"
fi

step "Checking Ollama"
if ollama_ok; then
  echo "OK: Ollama is reachable on 127.0.0.1:11434"
else
  warn "Ollama is not running. Install from https://ollama.com and run 'ollama serve'."
fi

if (( ! SKIP_LAUNCH && ! WHAT_IF )); then
  for candidate in \
    "/Applications/Bunny OS.app" \
    "$HOME/Applications/Bunny OS.app"
  do
    if [[ -d "$candidate" ]]; then
      step "Launching $candidate"
      open "$candidate"
      break
    fi
  done
fi

echo "DONE — drag Bunny OS to Applications if prompted, then complete onboarding (mic permission + system scan)."
