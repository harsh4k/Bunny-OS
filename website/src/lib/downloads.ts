/** Single source for public installer links (GitHub Releases). */
export const RELEASE_TAG = "v0.2.2";
export const RELEASE_VERSION = "0.2.2";

const BASE = `https://github.com/harsh4k/Bunny-OS/releases/download/${RELEASE_TAG}`;

export const WIN_MSI = `${BASE}/Bunny.OS_${RELEASE_VERSION}_x64_en-US.msi`;
export const MAC_DMG = `${BASE}/Bunny.OS_${RELEASE_VERSION}_aarch64.dmg`;
export const SHA256SUMS = `${BASE}/SHA256SUMS.txt`;
export const RELEASES_LATEST = "https://github.com/harsh4k/Bunny-OS/releases/latest";
export const RELEASE_PAGE = `https://github.com/harsh4k/Bunny-OS/releases/tag/${RELEASE_TAG}`;
