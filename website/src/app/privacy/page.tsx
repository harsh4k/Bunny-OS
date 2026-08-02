import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { SiteHeader } from "@/components/site-header";
import FloatingMenu from "@/components/ui/liquid-morph-floating-menu";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0e0f12] text-[#eef0f4]">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-6 pb-28 pt-28">
        <BrandMark size={48} showWordmark={false} href="/" className="mb-6" />
        <h1
          className="text-4xl font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
        >
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-[#9aa1ad]">
          Effective / last updated: 2 August 2026 · India-focused · Personal
          private beta
        </p>
        <div className="mt-6 rounded-xl border border-[#9a7f56]/40 bg-[#2e2618] p-4 text-[#e4d2b0]">
          This is a product policy for Bunny OS, not legal advice. Full
          markdown source:{" "}
          <a
            className="underline"
            href="https://github.com/harsh4k/Bunny-OS/blob/main/docs/privacy.md"
          >
            docs/privacy.md
          </a>
          .
        </div>

        <section className="prose-invert mt-10 space-y-4 text-[#c5cad3]">
          <h2 className="text-xl font-semibold text-[#d4bc94]">Plain summary</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-[#eef0f4]">No Bunny cloud / telemetry</strong>
            </li>
            <li>Data stays on your device</li>
            <li>Mic is opt-in; raw audio is not saved</li>
            <li>Chat / speech run locally (Ollama + Whisper)</li>
            <li>Screen context is Off by default</li>
            <li>Not for users under 18</li>
          </ul>

          <h2 className="pt-4 text-xl font-semibold text-[#d4bc94]">
            Indian law context
          </h2>
          <p>
            Written with the Digital Personal Data Protection Act, 2023 (DPDP)
            and the Information Technology Act, 2000 in mind. You install Bunny
            yourself; processing stays on your PC.
          </p>

          <h2 className="pt-4 text-xl font-semibold text-[#d4bc94]">
            Your controls
          </h2>
          <p>
            Mute the mic, turn Memory / Screen off, delete facts, clear session,
            uninstall, wipe app data. Grievances via{" "}
            <a
              className="text-[#d4bc94] underline"
              href="https://github.com/harsh4k/Bunny-OS/issues"
            >
              GitHub Issues
            </a>
            .
          </p>
        </section>

        <p className="mt-12 text-sm text-[#6b7280]">
          <Link href="/terms/" className="text-[#d4bc94]">
            Terms of Use
          </Link>{" "}
          ·{" "}
          <Link href="/" className="text-[#d4bc94]">
            Install Bunny
          </Link>
        </p>
      </main>
      <FloatingMenu />
    </div>
  );
}
