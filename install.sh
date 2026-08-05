#!/usr/bin/env bash
# Bunny OS macOS bootstrap
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/harsh4k/Bunny-OS/main/install.sh | bash
#   BUNNY_VERSION=v0.3.4 ./install.sh
#   ./install.sh --local-dmg ./Bunny.OS_0.3.4_aarch64.dmg
#   ./install.sh --what-if
#
# Downloads the matching GitHub Release .dmg, REQUIRES SHA256SUMS.txt verify,
# copies Bunny OS.app into /Applications, clears quarantine, and launches.

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

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

need_cmd curl
need_cmd shasum
need_cmd hdiutil
need_cmd python3

api_headers=(-H "Accept: application/vnd.github+json" -H "User-Agent: BunnyOS-Install" -H "X-GitHub-Api-Version: 2022-11-28")
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  api_headers+=(-H "Authorization: Bearer $GITHUB_TOKEN")
fi

HOST_ARCH="$(uname -m)"
case "$HOST_ARCH" in
  arm64|aarch64) ARCH_HINTS='aarch64|arm64' ;;
  x86_64|amd64) ARCH_HINTS='x86_64|x64|amd64' ;;
  *) ARCH_HINTS='.' ;;
esac

fetch_release_json() {
  local tag url body
  if [[ "$VERSION" == "latest" ]]; then
    url="https://api.github.com/repos/$REPO/releases/latest"
    if body="$(curl -fsSL "${api_headers[@]}" "$url" 2>/dev/null)"; then
      printf '%s' "$body"
      return 0
    fi
    body="$(curl -fsSL "${api_headers[@]}" "https://api.github.com/repos/$REPO/releases?per_page=10")" \
      || fail "Could not list releases for $REPO"
    printf '%s' "$body" | python3 -c 'import json,sys; rs=json.load(sys.stdin); rs=[r for r in rs if not r.get("draft") and not r.get("prerelease")];
import sys as s; s.exit(1) if not rs else print(json.dumps(rs[0]))'
    return 0
  fi
  tag="$VERSION"
  [[ "$tag" == v* ]] || tag="v$tag"
  curl -fsSL "${api_headers[@]}" "https://api.github.com/repos/$REPO/releases/tags/$tag"
}

pick_dmg() {
  ARCH_HINTS="$ARCH_HINTS" python3 - <<'PY'
import json, os, re, sys
rel = json.load(sys.stdin)
assets = rel.get("assets") or []
hints = re.compile(os.environ["ARCH_HINTS"], re.I)
dmgs = [a for a in assets if (a.get("name") or "").lower().endswith(".dmg")]
if not dmgs:
    sys.exit(1)
preferred = [a for a in dmgs if hints.search(a.get("name") or "")]
universal = [a for a in dmgs if re.search(r"universal", a.get("name") or "", re.I)]
choice = preferred[0] if preferred else (universal[0] if universal else None)
if choice is None:
    sys.exit(1)
print(f"{choice['browser_download_url']}\t{choice['name']}")
PY
}

pick_checksum() {
  python3 - <<'PY'
import json, sys
rel = json.load(sys.stdin)
for a in rel.get("assets") or []:
    if (a.get("name") or "") == "SHA256SUMS.txt":
        print(f"{a['browser_download_url']}\t{a['name']}")
        sys.exit(0)
sys.exit(1)
PY
}

# GitHub rewrites spaces in asset names to dots ("Bunny OS_x.dmg" is served as
# "Bunny.OS_x.dmg"), so a checksum file written from on-disk names disagrees by
# exactly that character. Compare on a normalized key.
expected_hash_for() {
  local sums="$1" want="${2// /.}" line hash name
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*([0-9a-fA-F]{64})[[:space:]]+\*?(.+)$ ]] || continue
    hash="${BASH_REMATCH[1]}"
    name="${BASH_REMATCH[2]%$'\r'}"
    name="${name// /.}"
    if [[ "$name" == "$want" ]]; then printf '%s' "$hash"; return 0; fi
  done < "$sums"
  return 1
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

install_from_dmg() {
  local dmg="$1"
  local mount_dir
  step "Mounting DMG"
  mount_dir="$(mktemp -d "${TMPDIR:-/tmp}/bunny-dmg.XXXXXX")"
  if ! hdiutil attach -nobrowse -readonly -mountpoint "$mount_dir" "$dmg" >/dev/null; then
    rm -rf "$mount_dir"
    fail "Could not mount DMG"
  fi
  [[ -d "$mount_dir" ]] || { rm -rf "$mount_dir"; fail "Could not mount DMG"; }
  local app
  app="$(find "$mount_dir" -maxdepth 2 -name '*.app' -type d | head -n1 || true)"
  if [[ -z "$app" ]]; then
    hdiutil detach "$mount_dir" -quiet || true
    rm -rf "$mount_dir"
    fail "No .app found inside DMG"
  fi

  step "Installing $(basename "$app") → /Applications"
  if (( WHAT_IF )); then
    echo "[WhatIf] rm -rf '/Applications/$(basename "$app")' && cp -R '$app' /Applications/"
  else
    rm -rf "/Applications/$(basename "$app")"
    cp -R "$app" /Applications/
    # Unsigned / un-notarized builds need quarantine cleared for Gatekeeper.
    xattr -dr com.apple.quarantine "/Applications/$(basename "$app")" 2>/dev/null || true
  fi
  hdiutil detach "$mount_dir" -quiet || true
  rm -rf "$mount_dir"
}

ollama_ok() {
  curl -fsS --max-time 2 "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1
}

echo "Bunny OS installer (macOS · $HOST_ARCH)"
echo "Repo: $REPO  Version: $VERSION"
if (( WHAT_IF )); then echo "(WhatIf — no download / install)"; fi

INSTALLER_PATH=""

if [[ -n "$LOCAL_DMG" ]]; then
  [[ -f "$LOCAL_DMG" ]] || fail "Local DMG not found: $LOCAL_DMG"
  INSTALLER_PATH="$(cd "$(dirname "$LOCAL_DMG")" && pwd)/$(basename "$LOCAL_DMG")"
  step "Using local installer $INSTALLER_PATH"
else
  step "Fetching release metadata"
  RELEASE_JSON="$(fetch_release_json)" || fail "Could not fetch a published release. Pass --version TAG or --local-dmg PATH."
  TAG="$(printf '%s' "$RELEASE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tag_name") or "")')"
  [[ -n "$TAG" ]] || fail "No published release found on $REPO"
  echo "Release: $TAG"

  if ! DMG_LINE="$(printf '%s' "$RELEASE_JSON" | pick_dmg)"; then
    fail "No .dmg asset on release $TAG for arch $HOST_ARCH."
  fi
  DMG_URL="${DMG_LINE%%$'\t'*}"
  DMG_NAME="${DMG_LINE#*$'\t'}"

  if ! SUM_LINE="$(printf '%s' "$RELEASE_JSON" | pick_checksum)"; then
    fail "Release $TAG has no SHA256SUMS.txt — refusing to install unverified software."
  fi

  TMP="${TMPDIR:-/tmp}/bunny-os-install"
  mkdir -p "$TMP"
  INSTALLER_PATH="$TMP/$DMG_NAME"
  SUM_URL="${SUM_LINE%%$'\t'*}"
  SUM_NAME="${SUM_LINE#*$'\t'}"
  SUM_PATH="$TMP/$SUM_NAME"

  if (( WHAT_IF )); then
    echo "[WhatIf] would download $DMG_URL → $INSTALLER_PATH"
    echo "[WhatIf] would verify against $SUM_URL"
  else
    step "Downloading $DMG_NAME"
    # No -s: curl's meter shows %, size, speed and time left for the ~230 MB DMG.
    curl -fL --retry 3 --retry-delay 2 -o "$INSTALLER_PATH" "$DMG_URL"
    step "Downloading checksums $SUM_NAME"
    curl -fsSL --retry 3 -o "$SUM_PATH" "$SUM_URL"
    HASH="$(expected_hash_for "$SUM_PATH" "$DMG_NAME" || true)"
    [[ -n "$HASH" ]] || fail "Checksum file has no line for $DMG_NAME"
    verify_sha256 "$INSTALLER_PATH" "$HASH"
  fi
fi

if (( WHAT_IF )); then
  echo "[WhatIf] install_from_dmg \"$INSTALLER_PATH\""
else
  install_from_dmg "$INSTALLER_PATH"
fi

step "Checking Ollama"
if ollama_ok; then
  echo "OK: Ollama is reachable on 127.0.0.1:11434"
else
  warn "Ollama not running yet — Bunny will offer Install & start Ollama on first launch."
fi

APP_PATH="/Applications/Bunny OS.app"
if (( ! SKIP_LAUNCH && ! WHAT_IF )); then
  if [[ -d "$APP_PATH" ]]; then
    step "Launching $APP_PATH"
    open "$APP_PATH"
  elif [[ -d "$HOME/Applications/Bunny OS.app" ]]; then
    step "Launching $HOME/Applications/Bunny OS.app"
    open "$HOME/Applications/Bunny OS.app"
  else
    fail "Bunny OS.app not found in /Applications after install."
  fi
fi

echo "DONE — complete onboarding (Microphone + Accessibility for media keys)."
echo "Bunny can Install & start Ollama for you on first launch."
echo "UNSIGNED BETA: if macOS still blocks the app, right-click → Open."
echo "Uninstall: docs/uninstall.md"
