import { test, expect } from "@playwright/test";

test("onboarding scan shows sample apps", async ({ page }) => {
  await page.goto("/?e2e=onboarding");
  await expect(page.getByRole("dialog", { name: "Bunny OS onboarding" })).toBeVisible();
  await page.getByLabel("I am 18+").check();
  await page.getByLabel("Continue to system scan").click();
  await page.getByLabel("Run system scan").click();
  await expect(page.getByText("Notepad")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Calculator")).toBeVisible();
});
