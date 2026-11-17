import { test, expect } from "@playwright/test";

const VIEWS = ["Apps", "Models", "Voice", "Learning", "Updates", "Home"];

test("dashboard renders and every panel opens without crashing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/?ui=dashboard");
  await expect(page.getByRole("heading", { name: /Talk to your computer/i })).toBeVisible({
    timeout: 15_000,
  });

  for (const view of VIEWS) {
    const nav = page.getByRole("navigation").getByRole("button", { name: view, exact: true });
    await nav.click();
    await expect(nav).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("error-fallback")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("screen-context link confirm shows the full link", async ({ page }) => {
  await page.goto("/?ui=dashboard");
  await expect(page.getByRole("heading", { name: /Talk to your computer/i })).toBeVisible({
    timeout: 15_000,
  });

  await page.evaluate(() => {
    const chunk = JSON.stringify({
      browser_confirm_pending: true,
      pending_id: "p-e2e",
      summary: "Open a link to evil.example",
      detail: "https://evil.example/collect?d=secret",
      action_kind: "open_url",
    });
    (window as unknown as {
      __bunnyE2E: { emit: (event: string, payload: unknown) => void };
    }).__bunnyE2E.emit("app-event", {
      event: "sidecar-message",
      message: { type: "stream", id: "v1", chunk, finished: false },
    });
  });

  const dialog = page.getByRole("alertdialog", { name: "Open this link?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("https://evil.example/collect?d=secret")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeVisible();
});
