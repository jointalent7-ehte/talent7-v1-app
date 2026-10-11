import { expect, test } from "@playwright/test";

const primaryDestinations = [
  { label: "Home", tab: "home", section: "home" },
  { label: "Challenges", tab: "challenges", section: "challenge-now" },
  { label: "Create", tab: "create", section: "create" },
  { label: "Live", tab: "live", section: "rooms" },
  { label: "Profile", tab: "profile", section: "account" }
] as const;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; pointer-events: none !important; }" });
  await expect(page.locator("main")).toBeVisible();
});

test("primary mobile navigation opens the matching workspace", async ({ page }) => {
  const app = page.locator("main");

  for (const destination of primaryDestinations) {
    const tab = page.getByRole("tab", { name: destination.label, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
    await expect(app).toHaveClass(new RegExp(`appTab-${destination.tab}`));
    await expect(app).toHaveClass(new RegExp(`appView-${destination.section}`));
    await expect(page.locator(`#${destination.section}`)).toBeVisible();
  }
});

test("center Create action keeps its emphasized mobile treatment", async ({ page }) => {
  const createTab = page.getByRole("tab", { name: "Create", exact: true });

  await expect
    .poll(() => createTab.evaluate((element) => getComputedStyle(element).backgroundImage))
    .toContain("linear-gradient");
  await expect
    .poll(() => createTab.evaluate((element) => Number.parseFloat(getComputedStyle(element).minHeight)))
    .toBeGreaterThanOrEqual(70);

  await createTab.click();
  await expect(createTab).toHaveAttribute("aria-selected", "true");
  await expect
    .poll(() => createTab.evaluate((element) => getComputedStyle(element).backgroundImage))
    .toContain("linear-gradient");
});

test("challenge room remains expanded through rerenders and direct links select Live", async ({ page }) => {
  await page.getByRole("tab", { name: "Live", exact: true }).click();
  const app = page.locator("main");
  const rooms = page.locator(".roomWorkspace");
  const firstRoom = rooms.first();

  await expect(firstRoom).toBeVisible();
  await firstRoom.locator(":scope > summary").click();
  await expect(firstRoom).toHaveAttribute("open", "");

  // Opening records a view and updates React state. The room must survive that rerender.
  await page.waitForTimeout(750);
  await expect(firstRoom).toHaveAttribute("open", "");

  if ((await rooms.count()) > 1) {
    const secondRoom = rooms.nth(1);
    await secondRoom.locator(":scope > summary").click();
    await expect(secondRoom).toHaveAttribute("open", "");
    await expect(firstRoom).not.toHaveAttribute("open", "");
  }

  const roomCardId = await page.locator(".roomCard").first().getAttribute("id");
  expect(roomCardId).toBeTruthy();
  await page.goto(`/#${roomCardId}`);
  await expect(app).toHaveClass(/appTab-live/);
  await expect(app).toHaveClass(/appView-rooms/);
  await expect(page.locator(`#${roomCardId}`)).toBeVisible();
});
