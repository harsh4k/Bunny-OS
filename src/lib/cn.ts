/** Tiny className joiner — no Tailwind/clsx required. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
