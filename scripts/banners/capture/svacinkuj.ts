// Svačinkuj on staging: the kitchen's production list, then its distribution list, on desktop.
// It starts on the report rather than the dashboard, which lists customer emails.
// The parent side is a Simulator recording of the installed web app (see README).
// The staging host, demo accounts and their test OTP code come from the environment
// (scripts/banners/.env, see .env.example), so none of them are published here.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Browser, BrowserContext, BrowserContextOptions, Page } from "playwright";
import { showPointer } from "../lib/cursor";
import { glide, pause, record } from "../lib/recorder";

const STATE_DIR = fileURLToPath(new URL("../.secrets/", import.meta.url));

// Read when a Svačinkuj clip runs, so other clips do not need these variables.
function env(name: "SVACINKUJ_ORIGIN" | "SVACINKUJ_PARENT_EMAIL" | "SVACINKUJ_ADMIN_EMAIL" | "SVACINKUJ_TEST_OTP") {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in scripts/banners/.env (see .env.example)`);
  return value;
}

const PHONE: BrowserContextOptions = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "cs-CZ",
  timezoneId: "Europe/Prague",
};
const DESKTOP: BrowserContextOptions = {
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  locale: "cs-CZ",
  timezoneId: "Europe/Prague",
};

// The parent flow is recorded in the iOS Simulator as an installed web app (see README).
// This empties the demo parent's server-side cart first, so the recording starts clean.
export async function resetSvacinkujParentCart(browser: Browser) {
  const context = await signedIn(browser, env("SVACINKUJ_PARENT_EMAIL"), PHONE);
  const page = await context.newPage();
  await emptyCart(page);
  await context.close();
}

export async function captureSvacinkujAdmin(browser: Browser) {
  const context = await signedIn(browser, env("SVACINKUJ_ADMIN_EMAIL"), DESKTOP);
  await showPointer(context);
  const page = await context.newPage();
  await page.goto(`${env("SVACINKUJ_ORIGIN")}/admin/reports/production`, { waitUntil: "networkidle" });
  await page.mouse.move(700, 500);
  await pause(page, 800);

  await record(page, "svacinkuj-admin", async () => {
    await pause(page, 2400);
    await smoothScroll(page, 360);
    await pause(page, 1600);
    await click(page, page.locator("[role=tab], button").filter({ hasText: /^Výdejní seznam$/ }).first());
    await page.waitForLoadState("networkidle");
    await pause(page, 1400);
    await smoothScroll(page, 300);
    await pause(page, 1600);
    // Then the next delivery day's production, so the desktop keeps pace with the phone clip.
    await smoothScroll(page, -700);
    await pause(page, 600);
    await click(page, page.getByRole("button", { name: "Další den" }));
    await page.waitForLoadState("networkidle");
    await pause(page, 1600);
    await click(page, page.locator("[role=tab], button").filter({ hasText: /^Výroba$/ }).first());
    await page.waitForLoadState("networkidle");
    await pause(page, 1600);
    await smoothScroll(page, 360);
    await pause(page, 2400);
  });
  await context.close();
}

async function signedIn(browser: Browser, email: string, options: BrowserContextOptions): Promise<BrowserContext> {
  mkdirSync(STATE_DIR, { recursive: true });
  // One cached session per staging host and account.
  const key = createHash("sha256").update(`${env("SVACINKUJ_ORIGIN")} ${email}`).digest("hex").slice(0, 16);
  const state = `${STATE_DIR}svacinkuj-${key}.json`;
  if (existsSync(state)) {
    const context = await browser.newContext({ ...options, storageState: state });
    if (await isSignedIn(context)) return prepare(context);
    await context.close();
  }
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await page.goto(`${env("SVACINKUJ_ORIGIN")}/login`, { waitUntil: "networkidle" });
  await page.locator("input[type=email]").fill(email);
  await page.keyboard.press("Enter");
  await page.getByRole("heading", { name: "Ověřte svůj e-mail" }).waitFor();
  await page.locator("input").first().click();
  await page.keyboard.type(env("SVACINKUJ_TEST_OTP"), { delay: 40 });
  // A complete code usually submits itself; press Verify only if it is still waiting.
  const verify = page.getByRole("button", { name: "Ověřit kód" });
  if (await verify.isEnabled({ timeout: 1_000 }).catch(() => false)) await verify.click({ timeout: 1_000 }).catch(() => {});
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await context.storageState({ path: state });
  await page.close();
  return prepare(context);
}

async function isSignedIn(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto(env("SVACINKUJ_ORIGIN"), { waitUntil: "domcontentloaded" });
  const ok = !new URL(page.url()).pathname.startsWith("/login");
  await page.close();
  return ok;
}

// Recordings leave out the staging environment bar and skip product analytics.
async function prepare(context: BrowserContext) {
  await context.route("https://t.svacinkuj.cz/**", (route) => route.fulfill({ status: 204 }));
  // Hydration replaces injected style tags, so the bar itself is hidden whenever it renders.
  await context.addInitScript(() => {
    const hide = () =>
      document.querySelectorAll<HTMLElement>("[data-staging-banner]").forEach((el) => {
        el.style.setProperty("display", "none", "important");
      });
    new MutationObserver(hide).observe(document, { childList: true, subtree: true });
  });
  return context;
}

async function emptyCart(page: Page) {
  await page.goto(`${env("SVACINKUJ_ORIGIN")}/checkout`, { waitUntil: "networkidle" });
  const trigger = page.getByRole("button", { name: "Vyprázdnit košík" }).first();
  if (!(await trigger.count()) || (await trigger.isDisabled())) return;
  await trigger.click();
  await page.getByText("Vyprázdnit košík?").waitFor();
  // The confirmation repeats the trigger's label on its own button, rendered after it.
  await page.getByRole("button", { name: "Vyprázdnit košík", exact: true }).last().click();
  await page.getByText("Vyprázdnit košík?").waitFor({ state: "hidden" });
}

async function click(page: Page, locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Click target is not visible");
  await glide(page, box.x + Math.min(box.width / 2, 80), box.y + box.height / 2);
  await pause(page, 150);
  await locator.click();
}

async function smoothScroll(page: Page, distance: number) {
  const step = Math.sign(distance) * 30;
  for (let moved = 0; moved < Math.abs(distance); moved += 30) {
    await page.mouse.wheel(0, step);
    await pause(page, 16);
  }
}
