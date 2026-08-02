/** GitHub Pages serves this site under /Bunny-OS */
export const BASE_PATH =
  process.env.NEXT_PUBLIC_BASE_PATH ??
  (process.env.NODE_ENV === "production" ? "/Bunny-OS" : "");

/** Prefix a root-relative public asset for GitHub Pages. */
export function asset(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${normalized}`;
}
