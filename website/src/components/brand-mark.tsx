import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  size?: number;
  className?: string;
  href?: string;
  priority?: boolean;
  showWordmark?: boolean;
};

export function BrandMark({
  size = 40,
  className,
  href = "/",
  priority = false,
  showWordmark = true,
}: BrandMarkProps) {
  const mark = (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <Image
        src="/bunny-os.jpg"
        alt="Bunny OS"
        width={size}
        height={size}
        priority={priority}
        className="rounded-xl border border-white/10 bg-black object-cover shadow-[0_0_0_1px_rgba(212,188,148,0.15)]"
      />
      {showWordmark ? (
        <span
          className="text-[15px] font-semibold tracking-tight text-[#eef0f4] sm:text-base"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
        >
          Bunny OS
        </span>
      ) : null}
    </span>
  );

  if (!href) return mark;
  return (
    <Link href={href} className="inline-flex no-underline" aria-label="Bunny OS home">
      {mark}
    </Link>
  );
}
