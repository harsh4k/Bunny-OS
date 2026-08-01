import type { AuditEvent } from "~contracts/ipc";
import styles from "../ChatPanel.module.css";

export function ChatAuditList({ audits }: { audits: AuditEvent[] }) {
  if (audits.length === 0) return null;
  return (
    <section className={styles.auditSection} aria-label="Action audit log">
      <h3 className={styles.auditTitle}>Action History</h3>
      <ul className={styles.auditList}>
        {audits.slice(0, 8).map((ev) => (
          <AuditRow key={ev.id} event={ev} />
        ))}
      </ul>
    </section>
  );
}

function AuditRow({ event }: { event: AuditEvent }) {
  const ts = new Date(Number(event.timestamp)).toLocaleTimeString();
  return (
    <li
      className={`${styles.auditRow} ${
        event.outcome === "error" ? styles.auditError : styles.auditOk
      }`}
    >
      <span className={styles.auditKind}>{event.action_kind}</span>
      <span className={styles.auditLabel}>{event.target_label}</span>
      <span className={styles.auditTime}>{ts}</span>
      {event.error_msg && (
        <span className={styles.auditErrMsg}>{event.error_msg}</span>
      )}
    </li>
  );
}
