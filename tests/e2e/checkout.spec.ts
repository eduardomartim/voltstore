import { expect, test } from "@playwright/test";
import { createConfirmedUser, deleteUser, signIn, stripeConfigured, type TestUser } from "./support";

test.describe("checkout", () => {
  let user: TestUser;

  test.beforeAll(async () => {
    user = await createConfirmedUser("checkout");
  });
  test.afterAll(async () => deleteUser(user));

  test("anonymous visitors are asked to sign in before checkout", async ({ page }) => {
    await page.goto("/products/glide-ergonomic-wireless-mouse");
    await page.getByRole("button", { name: "Add to cart" }).click();
    await page.goto("/cart");
    await page.getByRole("link", { name: "Sign in to check out" }).click();
    await expect(page).toHaveURL(/\/sign-in\?next=(%2F|\/)cart/);
  });

  test("signed-in customer can initiate checkout", async ({ page }) => {
    await signIn(page, user, "/cart");
    await page.goto("/products/glide-ergonomic-wireless-mouse");
    await page.getByRole("button", { name: "Add to cart" }).click();
    await page.goto("/cart");
    await page.getByRole("button", { name: "Checkout" }).click();

    if (stripeConfigured) {
      // Server created the order + Stripe Checkout Session and redirected.
      await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    } else {
      // Without Stripe keys the server refuses cleanly, before creating an order.
      await expect(page.getByRole("main").getByRole("alert")).toContainText("Payments are temporarily unavailable");
    }
  });

  test("success page never trusts the redirect alone", async ({ page }) => {
    await signIn(page, user);
    await page.goto("/checkout/success?session_id=cs_test_forgedsession1234567890");
    await expect(page.getByText("Order not found")).toBeVisible();
  });
});
