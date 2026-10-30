/**
 * Catches render errors so one broken panel doesn't blank the whole window.
 *
 * `scope="panel"` sits inside the dashboard: the sidebar and window bar keep
 * working, and changing `resetKey` (the active view) clears the error.
 * `scope="app"` is the last resort at the root.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import styles from "./ChatPanel.module.css";
import own from "./ErrorBoundary.module.css";

interface Props {
  children: ReactNode;
  scope: "panel" | "app";
  /** When this changes, a caught error is cleared (e.g. the user switched views). */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[bunny] ${this.props.scope} crashed`, error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props, prevState: State): void {
    // Only clear an error that was already on screen; an error caught in the
    // same update that changed resetKey belongs to the new view.
    if (prevState.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private retry = () => {
    if (this.props.scope === "app") {
      window.location.reload();
      return;
    }
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isPanel = this.props.scope === "panel";
    return (
      <div className={isPanel ? own.wrap : `${own.wrap} ${own.app}`}>
        <div className={styles.actionCard} role="alert" data-testid="error-fallback">
          <p className={styles.fieldLabel}>
            {isPanel ? "This panel stopped working" : "Bunny OS hit a problem"}
          </p>
          <p className={own.hint}>
            {isPanel
              ? "The rest of Bunny still works. Try again, or pick another panel."
              : "Reload to start the window again. Your settings and memory are safe."}
          </p>
          <p className={`${styles.errorMsg} ${own.detail}`}>{error.message || "Unknown error"}</p>
          <div className={styles.btnRow}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={this.retry}
            >
              {isPanel ? "Try again" : "Reload"}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
