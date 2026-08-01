#!/usr/bin/env bash
# Bunny OS macOS bootstrap (P4 scaffolding).
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/harsh4k/Bunny-OS/main/install.sh | bash
#
# Status: placeholder until the macOS Tauri bundle + frozen sidecar ship.
# Mirrors install.ps1 intent; exits with a clear message today.

set -euo pipefail

REPO="${BUNNY_REPO:-harsh4k/Bunny-OS}"
VERSION="${BUNNY_VERSION:-latest}"

echo "Bunny OS macOS installer"
echo "Repo: $REPO  Version: $VERSION"
echo ""
echo "macOS packaging is not ready yet (P4)."
echo "Windows: irm https://raw.githubusercontent.com/${REPO}/main/install.ps1 | iex"
echo ""
echo "When ready, this script will:"
echo "  1. Download the .dmg / .app from GitHub Releases"
echo "  2. Verify SHA256"
echo "  3. Open the app (TCC will prompt for Microphone)"
exit 2
