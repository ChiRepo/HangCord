import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installMockIpc } from "../fixtures/mock-ipc";

async function signIn(page: Page, email = "test@example.test", password = "TestPass123!") {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.beforeEach(async ({ page }) => {
  await installMockIpc(page, { authenticated: false });
  await page.goto("/");
});

test("logged-out user can sign in and sign out", async ({ page }, testInfo) => {
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  const violations = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations;
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("sign-in.png") });
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Night Owls" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("live-chat.png") });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("password failure stays generic", async ({ page }) => {
  await signIn(page, "missing@example.test", "wrong-password");
  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).not.toContainText(/account.*not found|email.*does not exist|wrong password/i);
});

test("Google link-required flow can be cancelled without signing in", async ({ page }) => {
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("heading", { name: "Link Google account" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Link Google account" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Email")).toBeVisible();
  const commands = await page.evaluate(() => window.__HANGCORD_TEST__.commands.map((entry) => entry.command));
  expect(commands).toContain("auth_cancel");
});
