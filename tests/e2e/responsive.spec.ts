import { expect, test } from "@playwright/test";

test("mobile: menu, search and product grid work without horizontal scroll", async ({ page }) => {
  await page.goto("/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole("button", { name: "Open menu" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Search products").fill("ssd");
  await dialog.getByLabel("Search products").press("Enter");
  await expect(page).toHaveURL(/q=ssd/);
  await expect(page.getByTestId("product-card")).toHaveCount(1);
});
