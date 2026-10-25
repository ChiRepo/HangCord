import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installMockIpc } from "../fixtures/mock-ipc";

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 720;
const isTouch = (page: Page) => page.evaluate(() => matchMedia("(pointer: coarse)").matches);
const membersPanel = (page: Page) => page.getByRole("complementary", { name: "Members" });

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(0);
}

async function openMembers(page: Page) {
  if (await membersPanel(page).isVisible()) return; // always shown ≥ 1100px
  if (isPhone(page)) await page.getByRole("button", { name: "general" }).click();
  await page.getByRole("button", { name: "Members" }).click();
  await expect(membersPanel(page)).toBeVisible();
}

async function smallTargets(page: Page) {
  return page.locator("button:visible, input:visible, a:visible").evaluateAll((els) =>
    els
      .map((el) => ({ label: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName, type: el.getAttribute("type"), r: el.getBoundingClientRect() }))
      .filter(({ type }) => type !== "radio") // radios sit inside 48px-tall labels
      .filter(({ r }) => r.width > 0 && (r.height < 44 || r.width < 44))
      .map(({ label, r }) => `${label} ${Math.round(r.width)}x${Math.round(r.height)}`),
  );
}

test.beforeEach(async ({ page }) => {
  await installMockIpc(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Night Owls" })).toBeVisible();
});

test("beta notice is visible", async ({ page }) => {
  await expect(page.getByRole("note")).toContainText("in beta");
});

test("+ shows on every category you may add rooms to, and nowhere else", async ({ page }) => {
  for (const cat of ["Hang out", "Study", "Lounges"]) {
    await expect(page.getByRole("button", { name: `Add a room or lounge to ${cat}` })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Announcements" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a room or lounge to Announcements" })).toHaveCount(0);
});

test("+ adds a Lounge that follows the category guidelines (pre-selected from preference)", async ({ page }) => {
  await page.getByRole("button", { name: "Add a room or lounge to Study" }).click();
  const dialog = page.getByRole("dialog", { name: "Add to Study" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radio", { name: /Follow Study guidelines/ })).toBeChecked();
  await expect(dialog.getByRole("button", { name: "Create" })).toBeDisabled();
  await dialog.getByRole("radio", { name: /Lounge/ }).check();
  await dialog.getByLabel("Name").fill("Quiet Corner");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Quiet Corner" })).toBeVisible();
  await expect(page.getByText("Own guidelines", { exact: true })).toHaveCount(0);
});

test("+ with own guidelines marks the room; text names become dashes as you type", async ({ page }) => {
  await page.getByRole("button", { name: "Add a room or lounge to Hang out" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Own guidelines/ }).check();
  await dialog.getByLabel("Name").pressSequentially("Movie Night");
  await expect(dialog.getByLabel("Name")).toHaveValue("movie-night");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "movie-night" })).toBeVisible();
  await expect(page.getByText("Own guidelines", { exact: true })).toBeVisible();
});

test("a name with no letters is refused with the same rule as the server", async ({ page }) => {
  await page.getByRole("button", { name: "Add a room or lounge to Study" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Lounge/ }).check();
  await dialog.getByLabel("Name").fill("   ");
  await expect(dialog.getByRole("button", { name: "Create" })).toBeDisabled();
});

test("dialog: Escape closes, focus stays inside, and returns to the +", async ({ page }) => {
  const plus = page.getByRole("button", { name: "Add a room or lounge to Study" });
  await plus.click();
  const dialog = page.getByRole("dialog");
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((d) => d.contains(document.activeElement)), `focus escaped after ${i + 1} tabs`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(plus).toBeFocused();
});

test("self presence badge is a perfect online circle", async ({ page }) => {
  await openMembers(page);
  const badges = page.getByRole("img", { name: "Online" });
  const shapes = await badges.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), radius: getComputedStyle(el).borderRadius };
    }),
  );
  expect(shapes.length).toBe(1);
  for (const s of shapes) expect(s).toEqual({ w: 16, h: 16, radius: "50%" });
});

test("members overlay can always be closed (button, Escape, back)", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 1100, "members list is permanent on wide screens");
  await openMembers(page);
  await page.getByRole("button", { name: "Close members" }).click();
  await expect(membersPanel(page)).toBeHidden();
  await page.getByRole("button", { name: "Members" }).click();
  await page.keyboard.press("Escape");
  await expect(membersPanel(page)).toBeHidden();
  await page.getByRole("button", { name: "Members" }).click();
  await page.goBack();
  await expect(membersPanel(page)).toBeHidden();
  await expect(page.getByRole("heading", { name: "Night Owls" }).or(page.getByRole("heading", { level: 1 }).first())).toBeVisible();
});

test("no horizontal scroll on any layout", async ({ page }) => {
  await noHorizontalScroll(page);
  if (isPhone(page)) {
    await page.getByRole("button", { name: "general" }).click();
    await noHorizontalScroll(page);
  }
});

test("touch screens get ≥ 44px targets in every orientation", async ({ page }) => {
  test.skip(!(await isTouch(page)), "touch-only check");
  expect(await smallTargets(page), "touch targets under 44px").toEqual([]);
  await page.getByRole("button", { name: "Add a room or lounge to Study" }).click();
  expect(await smallTargets(page), "touch targets under 44px in the add dialog").toEqual([]);
});

test("phone: one pane at a time, system back goes one level, bottom tabs ≤ 5", async ({ page }) => {
  test.skip(!isPhone(page), "phone-only checks");
  const tabs = page.getByRole("navigation", { name: "Main" }).getByRole("button");
  expect(await tabs.count()).toBeLessThanOrEqual(5);
  await page.getByRole("button", { name: "late-night-study" }).click();
  await expect(page.getByRole("navigation", { name: "Hangouts" })).toBeHidden();
  await page.goBack(); // the phone's own back button / gesture
  await expect(page.getByRole("navigation", { name: "Hangouts" })).toBeVisible();
  expect(page.url()).not.toBe("about:blank");
  await page.getByRole("button", { name: "late-night-study" }).click();
  await page.getByRole("button", { name: "Back to rooms" }).click();
  await expect(page.getByRole("navigation", { name: "Hangouts" })).toBeVisible();
});

test("phone: add sheet stays inside the screen and back closes it", async ({ page }) => {
  test.skip(!isPhone(page), "phone-only checks");
  await page.getByRole("button", { name: "Add a room or lounge to Study" }).click();
  const box = await page.getByRole("dialog").boundingBox();
  const vp = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height + 1);
  await page.goBack();
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("no serious accessibility violations (axe) — main view and open dialog", async ({ page }) => {
  const scan = async () => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations
    .filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length}`);
  expect(await scan()).toEqual([]);
  await page.getByRole("button", { name: "Add a room or lounge to Study" }).click();
  expect(await scan()).toEqual([]);
});
