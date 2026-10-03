import { expect, test } from "@playwright/test";

test.describe("public store", () => {
  test("homepage loads with featured products", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Gear that disappears");
    await expect(page.getByTestId("product-card").first()).toBeVisible();
  });

  test("search and category filter narrow the catalog", async ({ page }) => {
    await page.goto("/products?q=headphones");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("headphones");
    const cards = page.getByTestId("product-card");
    await expect(cards.first()).toBeVisible();
    for (const text of await cards.allInnerTexts()) expect(text.toLowerCase()).toContain("headphones");

    await page.goto("/products?category=monitors");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Monitors");
    await expect(page.getByTestId("product-card")).toHaveCount(2);

    await page.goto("/products?q=zzzz-no-match");
    await expect(page.getByRole("heading", { name: "No products found" }).filter({ visible: true })).toBeVisible();
  });

  test("product detail shows price and stock; out-of-stock cannot be added", async ({ page }) => {
    await page.goto("/products/arc75-wireless-mechanical-keyboard");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Arc75 Wireless Mechanical Keyboard");
    await expect(page.getByTestId("product-price")).toContainText("899,00");
    await expect(page.getByRole("main").getByText("In stock").first()).toBeVisible();

    await page.goto("/products/prism-rgb-gaming-mouse");
    await expect(page.getByRole("button", { name: "Out of stock" })).toBeDisabled();
  });

  test("unknown product shows a not-found page", async ({ page }) => {
    await page.goto("/products/does-not-exist");
    await expect(page.getByText("Page not found")).toBeVisible();
  });

  test("cart: add, change quantity, remove, totals", async ({ page }) => {
    await page.goto("/products/glide-ergonomic-wireless-mouse");
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByTestId("cart-count")).toHaveText("1");

    await page.goto("/products/nexus-8-in-1-usb-c-hub");
    await page.getByRole("button", { name: "Increase quantity" }).click();
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByTestId("cart-count")).toHaveText("3");

    await page.goto("/cart");
    await expect(page.getByTestId("cart-line")).toHaveCount(2);
    // 199,00 + 2 × 329,00 = 857,00
    await expect(page.getByTestId("cart-total")).toContainText("857,00");

    await page.getByRole("button", { name: "Increase quantity" }).first().click();
    await expect(page.getByTestId("cart-total")).toContainText("1.056,00");

    await page.getByRole("button", { name: "Remove" }).first().click();
    await expect(page.getByTestId("cart-line")).toHaveCount(1);
    await expect(page.getByTestId("cart-total")).toContainText("658,00");

    await page.getByRole("button", { name: "Clear cart" }).click();
    await expect(page.getByText("Your cart is empty")).toBeVisible();
  });

  test("tampered cart storage cannot change prices", async ({ page }) => {
    await page.goto("/");
    await page.goto("/products/glide-ergonomic-wireless-mouse");
    await page.getByRole("button", { name: "Add to cart" }).click();
    await page.evaluate(() => {
      const cart = JSON.parse(localStorage.getItem("voltline.cart.v1") ?? "[]");
      cart[0].priceCents = 1;
      cart[0].quantity = 999;
      localStorage.setItem("voltline.cart.v1", JSON.stringify(cart));
    });
    await page.goto("/cart");
    // Quantity is clamped to the per-item limit and the price comes from the server.
    await expect(page.getByTestId("quantity-value").first()).toHaveText("10");
    await expect(page.getByTestId("cart-total")).toContainText("1.990,00");
  });
});
