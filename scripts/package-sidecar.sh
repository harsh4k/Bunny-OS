#!/usr/bin/env bash
# Package Bunny OS Python sidecar with PyInstaller (macOS).
# Output (Tauri externalBin convention):
#   src-tauri/binaries/bunny-sidecar-<triple>
# where <triple> is aarch64-apple-darwin or x86_64-apple-darwin.
#
# Override Python with:  export BUNNY_PYTHON=/path/to/python3
# Override triple with:  export BUNNY_SIDECAR_TRIPLE=aarch64-apple-darwin

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

resolve_python() {
  if [[ -n "${BUNNY_PYTHON:-}" && -x "$BUNNY_PYTHON" ]]; then
    echo "$BUNNY_PYTHON"
    return
  fi
  for c in python3.12 python3.11 python3; do
    if command -v "$c" >/dev/null 2>&1; then
      command -v "$c"
      return
    fi
  done
  echo "Python 3.11+ not found. Install from python.org or set BUNNY_PYTHON." >&2
  exit 1
}

PYTHON="$(resolve_python)"
echo "==> Using Python: $PYTHON"
"$PYTHON" -c "import sys; assert sys.version_info >= (3, 11), sys.version"

ARCH="$(uname -m)"
if [[ -n "${BUNNY_SIDECAR_TRIPLE:-}" ]]; then
  TARGET_TRIPLE="$BUNNY_SIDECAR_TRIPLE"
elif [[ "$ARCH" == "arm64" ]]; then
  TARGET_TRIPLE="aarch64-apple-darwin"
else
  TARGET_TRIPLE="x86_64-apple-darwin"
fi

TARGET_DIR="$ROOT/src-tauri/binaries"
DEST_NAME="bunny-sidecar-$TARGET_TRIPLE"
DEST="$TARGET_DIR/$DEST_NAME"
DIST_DIR="$ROOT/dist/sidecar"
WORK_DIR="$ROOT/build/sidecar"
BUNDLE_REQS="$ROOT/sidecar/requirements-bundle.txt"

echo "==> Installing bundle dependencies (PyInstaller + voice runtime + PyObjC)"
"$PYTHON" -m pip install --upgrade pip
"$PYTHON" -m pip install -r "$BUNDLE_REQS"

WHISPER_DIR="$WORK_DIR/whisper_models"
if [[ "${BUNNY_PREFETCH_WHISPER:-}" == "1" ]]; then
  echo "==> Prefetching Whisper 'base' weights into $WHISPER_DIR (no first-run download)"
  mkdir -p "$WHISPER_DIR"
  "$PYTHON" -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8', download_root=r'$WHISPER_DIR'); print('whisper prefetch ok')"
fi

echo "==> Building onefile sidecar ($TARGET_TRIPLE)"
PYI_ARGS=(
  --noconfirm
  --clean
  --onefile
  --name bunny-sidecar
  --paths sidecar
  --distpath "$DIST_DIR"
  --workpath "$WORK_DIR"
  --specpath "$WORK_DIR"
  --collect-all faster_whisper
  --collect-all ctranslate2
  --collect-all sounddevice
  --collect-all openwakeword
  --collect-all onnxruntime
  --hidden-import local_actions
  --hidden-import voice_intents
  --hidden-import voice_worker
  --hidden-import media_keys
  --hidden-import youtube_resolve
  --hidden-import tts
  --hidden-import stt
  --hidden-import wake_word
  --hidden-import wake_phrase
  --hidden-import wake_oww
  --hidden-import paths
  --hidden-import platform_open
  --hidden-import AppKit
  --hidden-import Quartz
)
if [[ "${BUNNY_PREFETCH_WHISPER:-}" == "1" && -d "$WHISPER_DIR" ]]; then
  PYI_ARGS+=(--add-data "$WHISPER_DIR:whisper_models")
fi

"$PYTHON" -m PyInstaller "${PYI_ARGS[@]}" sidecar/main.py

BUILT="$DIST_DIR/bunny-sidecar"
if [[ ! -f "$BUILT" ]]; then
  echo "PyInstaller did not produce $BUILT" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"
cp -f "$BUILT" "$DEST"
chmod +x "$DEST"
echo "==> Sidecar bundled to $DEST"

PLAIN="$TARGET_DIR/bunny-sidecar"
cp -f "$BUILT" "$PLAIN"
chmod +x "$PLAIN"
echo "==> Also wrote $PLAIN"

shasum -a 256 "$DEST" | awk '{print $1}' > "$TARGET_DIR/$DEST_NAME.sha256"
echo "==> Checksum written to $TARGET_DIR/$DEST_NAME.sha256"

echo "==> Smoke: launch frozen binary until ready frame"
SMOKE_OUT="$WORK_DIR/smoke-stdout.bin"
SMOKE_ERR="$WORK_DIR/smoke-stderr.txt"
mkdir -p "$WORK_DIR"
: >"$SMOKE_OUT"
: >"$SMOKE_ERR"

"$DEST" >"$SMOKE_OUT" 2>"$SMOKE_ERR" &
PID=$!
GOT_READY=0
DEADLINE=$((SECONDS + 60))
while (( SECONDS < DEADLINE )); do
  if grep -q '"type"[[:space:]]*:[[:space:]]*"ready"' "$SMOKE_OUT" 2>/dev/null; then
    GOT_READY=1
    break
  fi
  if ! kill -0 "$PID" 2>/dev/null; then
    break
  fi
  sleep 0.2
done

if (( GOT_READY == 0 )); then
  echo "Frozen sidecar did not emit ready frame. stderr:" >&2
  cat "$SMOKE_ERR" >&2 || true
  kill -9 "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
  exit 1
fi

echo "OK: frozen sidecar ready"
kill -TERM "$PID" 2>/dev/null || true
wait "$PID" 2>/dev/null || true
echo "DONE"
