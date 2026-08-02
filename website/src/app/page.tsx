"use client";

import Link from "next/link";
import FloatingMenu from "@/components/ui/liquid-morph-floating-menu";
import { SwirlPlayground } from "@/components/ui/midjourney-ascii";
import ClippedFeatureTabs from "@/components/ui/clipped-video-tab";
import { SiteHeader } from "@/components/site-header";
import { BrandMark } from "@/components/brand-mark";
import { asset } from "@/lib/base-path";

const WIN =
  "https://github.com/harsh4k/Bunny-OS/releases/download/v0.2.1/Bunny.OS_0.2.1_x64_en-US.msi";
const MAC =
  "https://github.com/harsh4k/Bunny-OS/releases/download/v0.2.1/Bunny.OS_0.2.1_aarch64.dmg";

const btnPrimary =
  "inline-flex h-12 min-w-[180px] items-center justify-center rounded-xl bg-[#d4bc94] px-5 text-sm font-semibold text-[#0e0f12] transition hover:bg-[#e4d2b0]";
const btnGhost =
  "inline-flex h-12 min-w-[180px] items-center justify-center rounded-xl border border-[#2c3038] bg-transparent px-5 text-sm font-semibold text-[#eef0f4] transition hover:bg-[#15171c]";

export default function HomePage() {
  return (
    <div id="top" className="min-h-screen bg-[#0e0f12] text-[#eef0f4]">
      <SiteHeader />

      <section className="relative min-h-[100svh] overflow-hidden">
        <div className="absolute inset-0">
          <SwirlPlayground text="BUNNY OS" className="h-full w-full" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-[#0e0f12]/40 via-[#0e0f12]/65 to-[#0e0f12]" />

        <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-5xl flex-col justify-end px-6 pb-28 pt-28 sm:pb-36">
          <div className="mb-6 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset("/bunny-os.jpg")}
              alt="Bunny OS icon"
              width={88}
              height={88}
              fetchPriority="high"
              className="rounded-2xl border border-[#d4bc94]/25 bg-black shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
            />
            <p className="text-xs tracking-[0.18em] text-[#d4bc94] uppercase">
              Local · Private · Windows &amp; Mac
            </p>
          </div>

          <h1
            className="max-w-3xl text-5xl leading-[0.95] font-semibold tracking-tight text-[#eef0f4] sm:text-7xl"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
          >
            Bunny OS
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-[#9aa1ad] sm:text-xl">
            A voice helper for your computer. Hold F9, speak, and Bunny can open
            apps, search YouTube, or chat — all on your PC. No account. No Bunny
            cloud.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a className={btnPrimary} href={WIN}>
              Download for Windows
            </a>
            <a className={btnGhost} href={MAC}>
              Download for Mac
            </a>
          </div>
          <p className="mt-4 text-sm text-[#6b7280]">
            Read{" "}
            <Link
              href="/privacy/"
              className="text-[#d4bc94] underline-offset-2 hover:underline"
            >
              Privacy
            </Link>{" "}
            and{" "}
            <Link
              href="/terms/"
              className="text-[#d4bc94] underline-offset-2 hover:underline"
            >
              Terms
            </Link>{" "}
            before installing.
          </p>
        </div>
      </section>

      <ClippedFeatureTabs />

      <section id="install" className="bg-[#0e0f12] px-6 py-24">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={asset("/icon.png")}
              alt=""
              width={40}
              height={40}
              className="rounded-lg border border-white/10 bg-black"
            />
            <h2
              className="text-3xl font-semibold tracking-tight text-[#eef0f4] sm:text-4xl"
              style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
            >
              First time? Do this
            </h2>
          </div>
          <ol className="mt-6 space-y-4 text-lg text-[#9aa1ad]">
            <li>1. Download for Windows or Mac above.</li>
            <li>
              2. Open the file. On Windows, if you see a warning:{" "}
              <em>More info</em> → <em>Run anyway</em>.
            </li>
            <li>3. Follow the short setup (mic + optional chat helper).</li>
            <li>
              4. Hold <strong className="text-[#eef0f4]">F9</strong> and talk — or
              click the Bunny icon near the clock.
            </li>
          </ol>
          <div className="mt-10 flex flex-wrap gap-3">
            <a className={btnPrimary} href={WIN}>
              Windows MSI
            </a>
            <a className={btnGhost} href={MAC}>
              Mac DMG
            </a>
            <a
              className="inline-flex h-12 items-center justify-center px-3 text-sm font-medium text-[#d4bc94]"
              href="https://github.com/harsh4k/Bunny-OS/releases/latest"
            >
              All releases →
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#2c3038] px-6 py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
          <BrandMark size={32} href="/" />
          <p className="text-center text-sm text-[#6b7280] sm:text-right">
            Personal private beta ·{" "}
            <Link href="/privacy/" className="text-[#d4bc94]">
              Privacy
            </Link>{" "}
            ·{" "}
            <Link href="/terms/" className="text-[#d4bc94]">
              Terms
            </Link>{" "}
            ·{" "}
            <a
              href="https://github.com/harsh4k/Bunny-OS"
              className="text-[#d4bc94]"
            >
              GitHub
            </a>
          </p>
        </div>
      </footer>

      <FloatingMenu />
    </div>
  );
}
