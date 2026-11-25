// tickadoo web: homepage search, show page, then picking seats on the live seatmap.
// Seats are only selected in the browser; nothing is added to the cart, so no inventory is held.
import type { Browser, Page } from "playwright";
import { showPointer } from "../lib/cursor";
import { glide, pause, record } from "../lib/recorder";

const ORIGIN = "https://www.tickadoo.com";

export async function captureTickadooWeb(browser: Browser) {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 750 },
    deviceScaleFactor: 2,
    locale: "en-GB",
    timezoneId: "Europe/London",
  });
  await showPointer(context);
  // Prices in GBP throughout, matching the London flow and the phone; the site reads this cookie.
  await context.addCookies([{ name: "tkd_currency", value: "GBP", domain: ".tickadoo.com", path: "/" }]);
  // Keep scripted sessions out of every analytics and ad pipeline: all third-party hosts
  // (tag manager, pixels) are blocked, as are tickadoo's own event and client-log endpoints.
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    const firstParty = url.hostname === "tickadoo.com" || url.hostname.endsWith(".tickadoo.com");
    const tracking = /^\/collect(\/|$)/.test(url.pathname) || url.pathname === "/api/log/client";
    return firstParty && !tracking ? route.continue() : route.fulfill({ status: 204 });
  });
  const page = await context.newPage();
  await page.goto(ORIGIN, { waitUntil: "networkidle" });
  // Dismissing the banner only hides it; the tags it would enable are blocked above.
  const consent = page.getByRole("button", { name: "Accept all" });
  if (await consent.isVisible()) await consent.click();
  await page.mouse.move(900, 600);
  await pause(page, 1500);

  await record(page, "tickadoo-web", async () => {
    await pause(page, 1600);
    const search = page.locator("main input").first();
    await glideTo(page, search);
    await search.click();
    await search.pressSequentially("Moulin", { delay: 110 });
    const suggestion = page.getByRole("option").filter({ hasText: "Rouge! The Musical" }).first();
    await suggestion.waitFor();
    await pause(page, 700);
    await glideTo(page, suggestion);
    await suggestion.click();
    await page.waitForURL(/moulin-rouge-the-musical-tickets$/);
    await page.waitForLoadState("networkidle");
    await pause(page, 1400);

    const book = page.getByRole("button", { name: "Book Tickets" }).first();
    await glideTo(page, book);
    await book.click();
    await page.waitForURL(/\/book\/london\//);
    await page.locator("circle[data-seat-id]").first().waitFor();
    await page.waitForLoadState("networkidle");
    await pause(page, 1200);

    // Selecting a seat zooms the map, so each pick reads positions afresh.
    for (let i = 0; i < 2; i++) {
      const seat = await pickSeat(page);
      await glide(page, seat.x, seat.y, 18);
      await pause(page, 200);
      await page.mouse.click(seat.x, seat.y);
      await page.locator(`circle[data-seat-id="${seat.id}"][aria-pressed="true"]`).waitFor({ timeout: 5_000 });
      await pause(page, 1100);
    }
    await pause(page, 2200);
  });
  await context.close();
}

async function glideTo(page: Page, locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Target is not visible");
  await glide(page, box.x + Math.min(box.width / 2, 140), box.y + box.height / 2);
  await pause(page, 150);
}

// An available seat next to the one already selected, or the first pair of free neighbours.
async function pickSeat(page: Page) {
  const seats = await page.$$eval("circle[data-seat-id]", (circles) =>
    circles.map((c) => {
      const r = c.getBoundingClientRect();
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      // Only a seat that is on screen and not covered by a panel can be clicked: the point
      // must land on the seatmap itself (its hit layer sits above the circles).
      const hit = document.elementFromPoint(x, y);
      const hittable = Boolean(hit && c.closest("svg")?.contains(hit));
      return {
        id: c.getAttribute("data-seat-id") ?? "",
        hittable,
        row: c.closest("[data-row-key]")?.getAttribute("data-row-key") ?? "",
        // Only sellable seats are toggle buttons; sold or blocked ones have no aria-pressed.
        state: c.getAttribute("aria-pressed"),
        x,
        y,
        size: r.width,
      };
    }),
  );
  const free = seats.filter((s) => s.state === "false" && s.hittable);
  const besides = (seat: (typeof seats)[number]) =>
    free.find((o) => o.row === seat.row && o.x > seat.x && o.x - seat.x < seat.size * 2.5);
  const selected = seats.find((s) => s.state === "true");
  const seat = selected ? besides(selected) : free.find((s) => besides(s));
  if (!seat) throw new Error("No neighbouring free seats on the map");
  return seat;
}
