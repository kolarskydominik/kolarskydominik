// Empties the Svačinkuj demo parent's cart before the Simulator recording.
// Usage: bun capture/svacinkuj-reset-cart.ts (reads scripts/banners/.env)
import { chromium } from "playwright";
import { resetSvacinkujParentCart } from "./svacinkuj";

const browser = await chromium.launch({ channel: "chrome" });
try {
  await resetSvacinkujParentCart(browser);
} finally {
  await browser.close();
}
