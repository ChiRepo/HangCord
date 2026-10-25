import { expect, test, type Page } from "@playwright/test";
import { BIT } from "@hangcord/protocol";
import { installMockIpc } from "../fixtures/mock-ipc";

async function showComposer(page: Page) {
  await page.getByRole("button", { name: "general", exact: true }).click();
}

test.beforeEach(async ({ page }, testInfo) => {
  const noSend = String(BIT.VIEW_ROOM | BIT.READ_HISTORY);
  const firstHangout = testInfo.title.startsWith("first Hangout form");
  await installMockIpc(page, {
    ...(testInfo.title.startsWith("room without SEND_MESSAGES") ? { permissions: { "cat-text": noSend, general: noSend } } : {}),
    ...(firstHangout ? { emptyHangouts: true } : {}),
  });
  await page.goto("/");
  if (!firstHangout) await expect(page.getByRole("heading", { name: "Night Owls" })).toBeVisible();
});

test("creates a Hangout through the mocked API", async ({ page }) => {
  await page.getByRole("button", { name: "Add a hangout" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Hangout name").fill("Weekend Crew");
  await dialog.getByRole("button", { name: "Create hangout" }).click();
  await expect(page.getByRole("heading", { name: "Weekend Crew" })).toBeVisible();
  const creates = await page.evaluate(() => window.__HANGCORD_TEST__.requests.filter((request) => request.method === "POST" && request.path === "/hangouts"));
  expect(creates).toHaveLength(1);
  expect(creates[0]!.body).toMatchObject({ name: "Weekend Crew" });
});

test("first Hangout form creates the user's first Hangout", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Your first hangout" })).toBeVisible();
  await page.getByLabel("Hangout name").fill("Weekend Crew");
  await page.getByRole("button", { name: "Create hangout" }).click();
  await expect(page.getByRole("heading", { name: "Weekend Crew" })).toBeVisible();
  const creates = await page.evaluate(() => window.__HANGCORD_TEST__.requests.filter((request) => request.method === "POST" && request.path === "/hangouts"));
  expect(creates).toHaveLength(1);
  expect(creates[0]!.body).toMatchObject({ name: "Weekend Crew" });
});

test("sends one message through the gateway and deduplicates repeated MESSAGE_CREATE", async ({ page }) => {
  await showComposer(page);
  const composer = page.getByRole("textbox", { name: /message/i });
  await composer.fill("hello from the test");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("hello from the test", { exact: true })).toBeVisible();
  const sent = await page.evaluate(() => window.__HANGCORD_TEST__.sentFrames.filter(({ frame }) => frame.op === "MESSAGE_CREATE"));
  expect(sent).toHaveLength(1);
  const frame = {
    op: "MESSAGE_CREATE",
    d: { message: { id: "dedupe-msg", roomId: "general", hangoutId: "night-owls", authorId: "peer-id", content: "one copy only", createdAt: 1_800_000_000_000, editedAt: null }, nonce: "dedupe_nonce_01" },
    s: 3,
  };
  await page.evaluate((f) => {
    const ctl = window.__HANGCORD_TEST__;
    for (const connectionId of ctl.connections) { ctl.emitGateway(connectionId, f); ctl.emitGateway(connectionId, f); }
  }, frame);
  await expect(page.getByText("one copy only", { exact: true })).toHaveCount(1);
});

test("retries a message with the same nonce after gateway disconnect", async ({ page }) => {
  test.setTimeout(20_000);
  await showComposer(page);
  await expect.poll(() => page.evaluate(() => window.__HANGCORD_TEST__.connections.length)).toBeGreaterThan(0);
  await page.evaluate(() => window.__HANGCORD_TEST__.failNext("POST", "/rooms/general/messages", 503, { error: "unavailable" }));
  await page.evaluate(() => window.__HANGCORD_TEST__.disconnectOnNextMessage());
  await page.getByRole("textbox", { name: /message/i }).fill("retry after reconnect");
  await page.getByRole("button", { name: "Send" }).click();
  const retry = page.getByRole("button", { name: "Retry message" });
  await expect(retry).toBeVisible({ timeout: 12_000 });
  await retry.click();
  const attempts = await page.evaluate(() => {
    const control = window.__HANGCORD_TEST__;
    const gatewayNonces = control.sentFrames
      .filter(({ frame }) => frame.op === "MESSAGE_CREATE")
      .map(({ frame }) => frame.d?.nonce)
      .filter((nonce): nonce is string => typeof nonce === "string");
    const apiNonces = control.requests
      .filter((request) => request.method === "POST" && request.path === "/rooms/general/messages")
      .map(({ body }) => body && typeof body === "object" && "nonce" in body ? body.nonce : undefined)
      .filter((nonce): nonce is string => typeof nonce === "string");
    return [...gatewayNonces, ...apiNonces];
  });
  expect(attempts.length).toBeGreaterThan(1);
  expect(new Set(attempts).size).toBe(1);
  await expect(retry).toBeHidden();
  await expect(page.getByText("retry after reconnect", { exact: true })).toHaveCount(1);
});

test("shows a forbidden response when a room history request is rejected", async ({ page }) => {
  await page.evaluate(() => window.__HANGCORD_TEST__.failNext("GET", "/rooms/news/messages", 403, { error: "forbidden" }));
  await page.getByRole("button", { name: "news", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__HANGCORD_TEST__.requests.some((request) => request.method === "GET" && request.path.startsWith("/rooms/news/messages")))).toBe(true);
  await expect(page.getByRole("alert")).toBeVisible();
});

test("room without SEND_MESSAGES never sends MESSAGE_CREATE", async ({ page }) => {
  await showComposer(page);
  const send = page.getByRole("button", { name: "Send" });
  await expect(send).toBeDisabled();
  const composer = page.getByRole("textbox", { name: /message/i });
  await expect(composer).toBeDisabled();
  const frames = await page.evaluate(() => window.__HANGCORD_TEST__.sentFrames.filter(({ frame }) => frame.op === "MESSAGE_CREATE"));
  expect(frames).toHaveLength(0);
});
