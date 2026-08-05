import { describe, expect, it } from "vitest";
import styles from "../components/notification/NotificationPill.module.css";

describe("NotificationPill CSS contract", () => {
  it("shell class exists for transparent pill", () => {
    expect(styles.shell).toBeTruthy();
    expect(styles.stage).toBeTruthy();
  });
});
