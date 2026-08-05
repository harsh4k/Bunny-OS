import { test, expect } from "@playwright/test";

test("apps panel loads catalog and shows dock", async ({ page }) => {
  await page.goto("/?e2e=apps");
  await expect(page.getByRole("dialog", { name: "Apps" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("navigation", { name: "Apps dock" })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByAltText(/Notepad/i)).toBeVisible();
});
