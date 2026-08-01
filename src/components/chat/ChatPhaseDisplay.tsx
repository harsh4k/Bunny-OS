/**
 * Phase-specific rendering for the ChatPanel output area.
 */
import type { AssistantAction } from "~contracts/ipc";
import type { ChatPhase } from "./chatTypes";
import styles from "../ChatPanel.module.css";

interface Props {
  phase: ChatPhase;
  onExecuteAction: (action: AssistantAction) => void;
  onRetry: () => void;
}

export function ChatPhaseDisplay({ phase, onExecuteAction, onRetry }: Props) {
  switch (phase.phase) {
    case "idle":
      return (
        <p className={styles.idleHint}>
          Type a message to chat with the local Ollama model.
        </p>
      );

    case "streaming":
      return (
        <div>
          {phase.text ? (
            <p className={styles.streamText}>{phase.text}</p>
          ) : (
            <div className={styles.loadingState} aria-label="Thinking">
              <div className={styles.spinner} aria-hidden="true" />
              <span>Thinking…</span>
            </div>
          )}
        </div>
      );

    case "awaiting_action":
      return (
        <div>
          {phase.streamed && <p className={styles.streamText}>{phase.streamed}</p>}
          <ActionCard action={phase.result.action} onExecute={onExecuteAction} />
        </div>
      );

    case "executing":
      return (
        <div className={styles.loadingState}>
          <div className={styles.spinner} aria-hidden="true" />
          <span>Executing {phase.action.action}…</span>
        </div>
      );

    case "done":
      return (
        <div>
          <p className={styles.streamText}>{phase.outcome}</p>
          <button className={styles.btnSecondary} onClick={onRetry}>
            New message
          </button>
        </div>
      );

    case "error":
      return (
        <div className={styles.errorState} role="alert">
          <p className={styles.errorMsg}>{phase.message}</p>
          <button className={styles.btnSecondary} onClick={onRetry}>
            Try again
          </button>
        </div>
      );
  }
}

function ActionCard({
  action,
  onExecute,
}: {
  action: AssistantAction;
  onExecute: (action: AssistantAction) => void;
}) {
  const description = describeAction(action);
  return (
    <div className={styles.actionCard} role="region" aria-label="Proposed action">
      <div className={styles.actionKind}>{action.action}</div>
      <p className={styles.actionDesc}>{description}</p>
      <button
        className={`${styles.btn} ${styles.btnExecute}`}
        onClick={() => onExecute(action)}
        aria-label={`Execute: ${description}`}
      >
        Execute
      </button>
    </div>
  );
}

function describeAction(action: AssistantAction): string {
  switch (action.action) {
    case "open_app":
      return `Open app: ${action.app_name}`;
    case "open_url":
      return `Open URL: ${action.url}`;
    case "youtube_search":
      return `YouTube search: ${action.query}`;
    case "youtube_play":
      return `Play on YouTube: ${action.query}`;
    case "spotify_open":
      return "Open Spotify";
    case "spotify_search":
      return `Spotify search: ${action.query}`;
    case "spotify_play":
      return `Spotify search: ${action.query}`;
    case "media_play":
      return "Play / pause media";
    case "media_next":
      return "Next track";
    case "media_prev":
      return "Previous track";
    case "show_system_summary":
      return "Show system summary";
  }
}
