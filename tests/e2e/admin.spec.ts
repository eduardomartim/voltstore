import { expect, test } from "@playwright/test";
import {
  createAdminUser,
  createConfirmedUser,
  createOrderFor,
  deleteProduct,
  deleteUser,
  markOrderPaid,
  signIn,
  type TestUser,
} from "./support";

test.describe("admin", () => {
  let adminUser: TestUser;
  let customer: TestUser;
  const slug = `e2e-test-product-${Date.now()}`;

  test.beforeAll(async () => {
    adminUser = await createAdminUser();
    customer = await createConfirmedUser("customer");
  });

  test.afterAll(async () => {
    await deleteUser(customer);
    await deleteUser(adminUser);
    await deleteProduct(slug);
  });

  test("admin can create, deactivate and restock a product", async ({ page }) => {
    await signIn(page, adminUser, "/admin");
    await expect(page.getByRole("heading", { name: "Store management" })).toBeVisible();

    await page.goto("/admin/products/new");
    await page.getByLabel("Name").fill("E2E Test Product");
    await page.getByLabel("Slug").fill(slug);
    await page.getByLabel("Category").selectOption({ label: "Accessories" });
    await page.getByLabel("Price (R$)").fill("123,45");
    await page.getByLabel("Stock quantity").fill("7");
    await page.getByRole("button", { name: "Create product" }).click();
    await expect(page.getByText("Product saved.")).toBeVisible();

    await page.goto(`/products/${slug}`);
    await expect(page.getByTestId("product-price")).toContainText("123,45");

    await page.goto("/admin/products");
    // Next 16 may keep a hidden copy of a previously visited route in the DOM.
    const row = page.getByTestId("admin-product-row").filter({ hasText: slug, visible: true });
    await row.getByRole("switch").click();
    await expect(page.getByText("Product deactivated.").first()).toBeVisible();
    await page.goto(`/products/${slug}`);
    await expect(page.getByText("Page not found")).toBeVisible();

    await page.goto("/admin/products");
    await row.getByLabel("Stock quantity").fill("42");
    await row.getByRole("button", { name: "Save stock" }).click();
    await expect(page.getByText("Stock updated.").first()).toBeVisible();
  });

  test("admin validation rejects bad input", async ({ page }) => {
    await signIn(page, adminUser, "/admin");
    await page.goto("/admin/products/new");
    await page.getByLabel("Name").fill("X");
    await page.getByLabel("Price (R$)").fill("abc");
    await page.getByRole("button", { name: "Create product" }).click();
    await expect(page.getByText("Name is too short.")).toBeVisible();
    await expect(page.getByText("Enter a valid price, e.g. 899,90.")).toBeVisible();
  });

  test("admin can only fulfil paid orders and moves them through the lifecycle", async ({ page }) => {
    const pendingOrder = await createOrderFor(customer, "glide-ergonomic-wireless-mouse");
    const paidOrder = await createOrderFor(customer, "glide-ergonomic-wireless-mouse");
    await markOrderPaid(paidOrder);

    await signIn(page, adminUser, "/admin");
    await page.goto(`/admin/orders/${pendingOrder}`);
    // Pending orders can only be cancelled — never shipped.
    await expect(page.getByLabel("New status").locator("option")).toHaveText(["Cancelled"]);

    await page.goto(`/admin/orders/${paidOrder}`);
    await page.getByLabel("New status").selectOption("shipped");
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(page.getByText("Order status updated.")).toBeVisible();
    await expect(page.getByTestId("order-status").first()).toHaveText("Shipped");

    // The customer sees the new status on their own order page.
    await page.context().clearCookies();
    await signIn(page, customer);
    await page.goto(`/account/orders/${paidOrder}`);
    await expect(page.getByTestId("order-status")).toHaveText("Shipped");
  });
});
