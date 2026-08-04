"use client";

/**
 * Marketing mock of the top-edge voice island (matches app presentation).
 * Flat-top hanging panel — not a floating capsule.
 */
export function IslandPreview({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-[#2c3038] bg-[#ebebef] ${className}`}
      aria-hidden="true"
    >
      {/* Expanded hanging island */}
      <div className="relative mx-auto flex h-[120px] w-full max-w-lg items-start justify-center pt-0 sm:h-[140px]">
        <div
          className="flex h-[42px] w-[min(100%,300px)] items-center gap-2.5 px-3.5 text-left shadow-[0_8px_24px_rgba(0,0,0,0.32)]"
          style={{
            background: "#0a0a0a",
            borderRadius: "0 0 12px 12px",
            border: "1px solid rgba(255,255,255,0.1)",
            borderTopColor: "transparent",
          }}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0a84ff]" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-medium tracking-tight text-white">
              Bunny
            </p>
            <p className="truncate text-[11px] text-white/60">Hold F9 to talk</p>
          </div>
          <span className="flex h-3 items-end gap-0.5" aria-hidden>
            {[40, 70, 50, 90, 55, 75].map((h, i) => (
              <i
                key={i}
                className="block w-0.5 rounded-full bg-white/70"
                style={{ height: `${h}%` }}
              />
            ))}
          </span>
        </div>
      </div>

      <div className="border-t border-black/5 bg-[#e4e4e8] px-5 py-3">
        <p className="text-center text-xs tracking-wide text-[#6b7280]">
          Idle state collapses to a thin top bar · expands when you speak
        </p>
        <div className="mx-auto mt-3 h-1 w-40 rounded-b-md bg-[#0a0a0a] shadow-sm" />
      </div>
    </div>
  );
}
