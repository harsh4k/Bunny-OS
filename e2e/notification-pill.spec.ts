import { test, expect } from "@playwright/test";

test("notification pill shell has no opaque background", async ({ page }) => {
  await page.goto("/?ui=island");
  const shell = page.locator('[class*="shell"]').first();
  await expect(shell).toBeVisible({ timeout: 15_000 });
  const bg = await shell.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe("rgba(0, 0, 0, 0)");
});

test("island stage is transparent", async ({ page }) => {
  await page.goto("/?ui=island");
  const stage = page.locator('[class*="stage"]').first();
  await expect(stage).toBeVisible({ timeout: 15_000 });
  const bg = await stage.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe("rgba(0, 0, 0, 0)");
});
