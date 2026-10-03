import { expect, test } from "@playwright/test";
import {
  createConfirmedUser,
  createOrderFor,
  deleteUser,
  getAuthEmailLink,
  mailpitAvailable,
  signIn,
  type TestUser,
} from "./support";

test.describe("authentication & authorization", () => {
  let alice: TestUser;
  let bob: TestUser;

  test.beforeAll(async () => {
    alice = await createConfirmedUser("alice");
    bob = await createConfirmedUser("bob");
  });

  test.afterAll(async () => {
    await deleteUser(alice);
    await deleteUser(bob);
  });

  test("protected pages redirect anonymous visitors to sign in", async ({ page }) => {
    await page.goto("/account/orders");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount%2Forders/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fadmin/);
  });

  test("sign up asks the user to confirm their email", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Full name").fill("New Shopper");
    await page.getByLabel("Email").fill(`signup-${Date.now()}@voltline.test`);
    await page.getByLabel("Password").fill("a-strong-password");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByTestId("signup-success")).toContainText("Check your inbox");
  });

  test("email confirmation link activates the account and signs the user in", async ({ page }) => {
    test.skip(!(await mailpitAvailable()), "Local Supabase inbox (Mailpit) not running");
    const email = `confirm-${Date.now()}@voltline.test`;
    await page.goto("/sign-up");
    await page.getByLabel("Full name").fill("Confirm Me");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("a-strong-password");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByTestId("signup-success")).toBeVisible();

    // Same browser (the PKCE verifier cookie lives here) opens the emailed link.
    await page.goto(await getAuthEmailLink(email));
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { name: "My account" })).toBeVisible();
    await expect(page.getByText(email).first()).toBeVisible();
  });

  test("password recovery lets the user choose a new password", async ({ page }) => {
    test.skip(!(await mailpitAvailable()), "Local Supabase inbox (Mailpit) not running");
    const user = await createConfirmedUser("recover");
    try {
      await page.goto("/forgot-password");
      await page.getByLabel("Email").fill(user.email);
      await page.getByRole("button", { name: "Send reset link" }).click();
      await expect(page.getByRole("status")).toContainText("If an account exists");

      await page.goto(await getAuthEmailLink(user.email));
      await expect(page).toHaveURL(/\/reset-password$/);
      const newPassword = `New-${crypto.randomUUID()}`;
      await page.getByLabel("New password", { exact: true }).fill(newPassword);
      await page.getByLabel("Confirm new password").fill(newPassword);
      await page.getByRole("button", { name: "Update password" }).click();
      await expect(page).toHaveURL(/\/account/);

      await page.context().clearCookies();
      await signIn(page, { ...user, password: newPassword });
    } finally {
      await deleteUser(user);
    }
  });

  test("sign up validates input", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Full name").fill("A");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  });

  test("invalid credentials show a generic error", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(alice.email);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Invalid email or password.");
  });

  test("forgot password does not reveal whether an account exists", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(`nobody-${Date.now()}@voltline.test`);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("If an account exists");
  });

  test("sign in, view account, session persists, sign out", async ({ page }) => {
    await signIn(page, alice);
    await expect(page.getByRole("heading", { name: "My account" })).toBeVisible();
    await expect(page.getByText(alice.email).first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "My account" })).toBeVisible();

    await page.getByRole("main").getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL("/");
    await page.goto("/account");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("open redirects through ?next are blocked", async ({ page }) => {
    await signIn(page, alice);
    await page.context().clearCookies();
    await page.goto("/sign-in?next=https://evil.example");
    await page.getByLabel("Email").fill(alice.email);
    await page.getByLabel("Password").fill(alice.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/localhost:\d+\/account$/);
  });

  test("a customer cannot open another customer's order (IDOR)", async ({ page }) => {
    const bobsOrder = await createOrderFor(bob, "glide-ergonomic-wireless-mouse");
    const alicesOrder = await createOrderFor(alice, "glide-ergonomic-wireless-mouse");
    await signIn(page, alice);

    const res = await page.goto(`/account/orders/${bobsOrder}`);
    expect(res?.status()).toBe(404);

    await page.goto("/account/orders");
    await expect(page.getByTestId("orders-list").getByRole("link")).toHaveCount(1);
    await page.goto(`/account/orders/${alicesOrder}`);
    await expect(page.getByRole("heading", { name: /Order VL-/ })).toBeVisible();
  });

  test("a customer cannot access the admin area", async ({ page }) => {
    await signIn(page, alice);
    await page.goto("/admin");
    await expect(page.getByText("Access denied")).toBeVisible();
    await page.goto("/admin/products");
    await expect(page.getByText("Access denied")).toBeVisible();
    await expect(page.getByTestId("admin-product-row")).toHaveCount(0);
  });
});
