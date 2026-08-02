import { BrandMark } from "@/components/brand-mark";
import Link from "next/link";

const links = [
  { href: "/#features", label: "Features" },
  { href: "/#install", label: "Install" },
  { href: "/privacy/", label: "Privacy" },
  { href: "/terms/", label: "Terms" },
  {
    href: "https://github.com/harsh4k/Bunny-OS/releases/latest",
    label: "Downloads",
    external: true,
  },
];

export function SiteHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-40 border-b border-white/5 bg-[#0e0f12]/55 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-6">
        <BrandMark size={36} priority />
        <nav className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 text-sm text-[#9aa1ad]">
          {links.map((link) =>
            link.external ? (
              <a
                key={link.label}
                href={link.href}
                className="transition-colors hover:text-[#eef0f4]"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.label}
                href={link.href}
                className="transition-colors hover:text-[#eef0f4]"
              >
                {link.label}
              </Link>
            ),
          )}
        </nav>
      </div>
    </header>
  );
}
