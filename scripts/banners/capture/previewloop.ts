// PreviewLoop: the production widget on its public demo store. Pin a comment on a button,
// circle a price in drawing mode, then open the collected feedback. The demo page stores
// feedback locally and never sends it to the API.
import type { Browser, Page } from "playwright";
import { showPointer } from "../lib/cursor";
import { glide, pause, record } from "../lib/recorder";

const DEMO = "https://previewloop.com/landing-widget.html";

export async function capturePreviewLoop(browser: Browser) {
  const context = await browser.newContext({
    viewport: { width: 1000, height: 560 },
    deviceScaleFactor: 2,
    locale: "en-GB",
  });
  await showPointer(context);
  const page = await context.newPage();
  await page.goto(DEMO, { waitUntil: "networkidle" });
  await page.mouse.move(700, 420);
  await pause(page, 800);

  await record(page, "previewloop", async () => {
    await pause(page, 1200);
    await click(page, page.getByRole("button", { name: "PreviewLoop feedback" }));
    await pause(page, 700);

    await click(page, page.getByRole("button", { name: /Add to bag/ }));
    const comment = page.getByRole("textbox", { name: "Feedback comment" });
    await comment.waitFor();
    await pause(page, 400);
    await comment.pressSequentially("Can this be our brand blue and a bit taller?", { delay: 45 });
    await pause(page, 400);
    await click(page, page.getByRole("button", { name: "Add feedback", exact: true }));
    await pause(page, 1200);

    await click(page, page.getByRole("button", { name: "Draw on the page" }));
    await pause(page, 500);
    const price = await textBox(page, "$249");
    await circle(page, price.x + price.width / 2, price.y + price.height / 2, price.width / 2 + 22, price.height / 2 + 12);
    await comment.waitFor();
    await pause(page, 400);
    await comment.pressSequentially("Show the launch discount here", { delay: 45 });
    await pause(page, 400);
    await click(page, page.getByRole("button", { name: "Add feedback", exact: true }));
    await pause(page, 1200);

    await click(page, page.getByRole("button", { name: /^Feedback list/ }));
    await pause(page, 3000);
  });
  await context.close();
}

async function click(page: Page, locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Click target is not visible");
  await glide(page, box.x + box.width / 2, box.y + box.height / 2, 22);
  await pause(page, 160);
  await locator.click();
}

// Draws a loose ellipse with the mouse, the way a reviewer circles something.
async function circle(page: Page, cx: number, cy: number, rx: number, ry: number) {
  const start = -Math.PI / 2;
  await glide(page, cx + rx * Math.cos(start), cy + ry * Math.sin(start));
  await page.mouse.down();
  for (let i = 1; i <= 48; i++) {
    const a = start + (i / 44) * Math.PI * 2;
    await page.mouse.move(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
    await pause(page, 12);
  }
  await page.mouse.up();
}

// The bounding box of the exact text, not of the element that wraps it with other content.
async function textBox(page: Page, text: string) {
  const box = await page.evaluate((needle) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(needle) ?? -1;
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + needle.length);
      const r = range.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }
    return null;
  }, text);
  if (!box) throw new Error(`Text ${text} is not on the page`);
  return box;
}
