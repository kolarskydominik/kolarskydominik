// Usage: bun capture/run.ts [clip...]  (no arguments records every browser clip)
import { chromium } from "playwright";
import { capturePreviewLoop } from "./previewloop";
import { captureSvacinkujAdmin } from "./svacinkuj";
import { captureTickadooWeb } from "./tickadoo-web";

const clips: Record<string, (b: import("playwright").Browser) => Promise<void>> = {
  "tickadoo-web": captureTickadooWeb,
  "svacinkuj-admin": captureSvacinkujAdmin,
  previewloop: capturePreviewLoop,
};
const wanted = process.argv.slice(2);
const unknown = wanted.filter((name) => !Object.hasOwn(clips, name));
if (unknown.length) throw new Error(`Unknown clip ${unknown.join(", ")}; expected ${Object.keys(clips).join(", ")}`);
const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const [name, capture] of Object.entries(clips)) {
    if (wanted.length === 0 || wanted.includes(name)) await capture(browser);
  }
} finally {
  await browser.close();
}
