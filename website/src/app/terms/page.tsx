import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { SiteHeader } from "@/components/site-header";
import FloatingMenu from "@/components/ui/liquid-morph-floating-menu";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0e0f12] text-[#eef0f4]">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 pb-28 pt-28">
        <BrandMark size={48} showWordmark={false} href="/" className="mb-6" />
        <h1
          className="text-4xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
        >
          Terms of Use
        </h1>
        <p className="mt-3 text-sm text-[#9aa1ad]">
          Effective / last updated: 2 August 2026 · Governed by the laws of
          India · Personal private beta
        </p>
        <div className="mt-6 rounded-xl border border-[#9a7f56]/40 bg-[#2e2618] p-4 text-[#e4d2b0]">
          Not legal advice. Full markdown:{" "}
          <a
            className="underline"
            href="https://github.com/harsh4k/Bunny-OS/blob/main/docs/terms.md"
          >
            docs/terms.md
          </a>
          . Related:{" "}
          <Link href="/privacy/" className="underline">
            Privacy Policy
          </Link>
          .
        </div>

        <section className="mt-10 space-y-6 text-[#c5cad3]">
          <div>
            <h2 className="text-xl font-semibold text-[#d4bc94]">1. Agreement</h2>
            <p className="mt-2">
              By installing or using Bunny OS you accept these Terms and the
              Privacy Policy. You must be 18+ and able to contract under Indian
              law.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[#d4bc94]">
              2. Personal licence
            </h2>
            <p className="mt-2">
              Personal, non-commercial use on devices you control. Do not sell
              the app as a hosted service, bypass safety allowlists for
              malware/shell abuse, or break the law (including the IT Act,
              2000).
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[#d4bc94]">
              3. Beta — no warranty
            </h2>
            <p className="mt-2">
              Software is provided AS IS. Speech and AI answers can be wrong.
              Builds may be unsigned (SmartScreen / Gatekeeper warnings).
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[#d4bc94]">4. Liability</h2>
            <p className="mt-2">
              To the maximum extent allowed by Indian law, we are not liable for
              indirect losses or data loss. For this free personal beta, total
              liability is limited to INR 0, except where liability cannot
              legally be excluded.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[#d4bc94]">
              5. Governing law
            </h2>
            <p className="mt-2">
              Laws of India. Prefer resolving issues via{" "}
              <a
                className="text-[#d4bc94] underline"
                href="https://github.com/harsh4k/Bunny-OS/issues"
              >
                GitHub Issues
              </a>{" "}
              first.
            </p>
          </div>
        </section>

        <p className="mt-12 text-sm text-[#6b7280]">
          <Link href="/" className="text-[#d4bc94]">
            Install Bunny
          </Link>
        </p>
      </main>
      <FloatingMenu />
    </div>
  );
}
