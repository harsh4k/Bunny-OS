/**
 * AdvisorResults — read-only display sub-components for AdvisorPanel.
 *
 * Contains: Results section, RecCard, HwRow, GPU note, and helpers.
 * Kept in a separate file so AdvisorPanel.tsx stays under 300 lines.
 */
import type {
  GetAdvisorResponse,
  AdvisorRecommendation,
  AdvisorConstraint,
  GpuInfo,
} from "~contracts/ipc";
import styles from "./AdvisorPanel.module.css";

// ── Results section ────────────────────────────────────────────────────────────

interface ResultsProps {
  data: GetAdvisorResponse;
  confirmPull: string | null;
  onRequestPull: (name: string) => void;
  onConfirmPull: (name: string) => void;
  onCancelPull: () => void;
  onRescan: () => void;
}

export function Results({
  data,
  confirmPull,
  onRequestPull,
  onConfirmPull,
  onCancelPull,
  onRescan,
}: ResultsProps) {
  const { hardware, ollama, advisor } = data;

  return (
    <>
      {/* Hardware summary */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Hardware</h3>
        <HwRow label="CPU" value={hardware.cpu} />
        <HwRow label="RAM" value={`${hardware.ram_gb} GB`} />
        <GpuDisplay gpu={hardware.gpu} gpuNote={hardware.gpu_note} />
        <HwRow label="Mic" value={hardware.mic_available ? "Available" : "Not detected"} />
        <HwRow
          label="Ollama"
          value={
            ollama.reachable
              ? `Ready — ${ollama.models.length} model(s) installed`
              : "Not running (start with: ollama serve)"
          }
        />
        {advisor.warning && (
          <p className={styles.warning} role="note">
            {advisor.warning}
          </p>
        )}
      </section>

      {/* Recommendations */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          Recommendations
          <span className={styles.constraintBadge} data-constraint={advisor.constraint}>
            {constraintLabel(advisor.constraint)}
          </span>
        </h3>

        {advisor.recommendations.length === 0 ? (
          <p className={styles.noRecs}>
            No models fit your current hardware. Upgrade RAM or add a GPU.
          </p>
        ) : (
          advisor.recommendations.map((rec) => (
            <RecCard
              key={rec.candidate_name}
              rec={rec}
              confirmPull={confirmPull}
              onRequestPull={onRequestPull}
              onConfirmPull={onConfirmPull}
              onCancelPull={onCancelPull}
            />
          ))
        )}
      </section>

      <button className={styles.btnRescan} onClick={onRescan}>
        Rescan
      </button>
    </>
  );
}

// ── GPU disclosure row ─────────────────────────────────────────────────────────

function GpuDisplay({ gpu, gpuNote }: { gpu: GpuInfo | null; gpuNote: string }) {
  return (
    <>
      <HwRow
        label="GPU"
        value={gpu ? `${gpu.name} (${gpu.vram_gb} GB VRAM)` : "Not detected via nvidia-smi"}
      />
      {gpuNote && (
        <p className={styles.gpuNote} role="note" data-testid="gpu-note">
          {gpuNote}
        </p>
      )}
    </>
  );
}

// ── Recommendation card ────────────────────────────────────────────────────────

interface RecCardProps {
  rec: AdvisorRecommendation;
  confirmPull: string | null;
  onRequestPull: (name: string) => void;
  onConfirmPull: (name: string) => void;
  onCancelPull: () => void;
}

function RecCard({
  rec,
  confirmPull,
  onRequestPull,
  onConfirmPull,
  onCancelPull,
}: RecCardProps) {
  const isPendingConfirm = confirmPull === rec.candidate_name;

  return (
    <div className={styles.recCard} data-tier={rec.tier}>
      <div className={styles.recHeader}>
        <span className={styles.tierBadge} data-tier={rec.tier}>
          {rec.tier.toUpperCase()}
        </span>
        <span className={styles.recName}>{rec.display_name}</span>
        {rec.available ? (
          <span className={styles.availBadge}>Installed</span>
        ) : isPendingConfirm ? (
          <span className={styles.confirmRow}>
            <button
              className={styles.btnConfirm}
              onClick={() => onConfirmPull(rec.candidate_name)}
              aria-label={`Confirm pull ${rec.display_name}`}
            >
              Confirm Pull
            </button>
            <button
              className={styles.btnCancel}
              onClick={onCancelPull}
              aria-label="Cancel pull"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            className={styles.btnPull}
            onClick={() => onRequestPull(rec.candidate_name)}
            aria-label={`Pull ${rec.display_name}`}
          >
            Pull
          </button>
        )}
      </div>
      <dl className={styles.recMeta}>
        <dt>Size</dt>
        <dd>{rec.size_gb} GB</dd>
        <dt>Context</dt>
        <dd>{rec.context_k}K tokens</dd>
        <dt>Why</dt>
        <dd className={styles.reason}>{rec.reason}</dd>
      </dl>
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function HwRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.hwRow}>
      <span className={styles.hwKey}>{label}</span>
      <span className={styles.hwVal}>{value}</span>
    </div>
  );
}

function constraintLabel(c: AdvisorConstraint): string {
  if (c === "cpu_only") return "CPU only";
  if (c === "vram_limited") return "Limited VRAM";
  return "GPU ready";
}
