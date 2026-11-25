// Records a Playwright page by taking viewport screenshots in a loop while the script runs,
// and writes the result as a fixed-rate clip: numbered JPEG frames plus clip.json. Each
// output tick reuses the newest screenshot taken at or before that time.
// The DevTools screencast is not used because it crops to the real window, not the viewport.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";

export const FPS = 15;
export const FRAMES_DIR = fileURLToPath(new URL("../.frames/", import.meta.url));

type Frame = { time: number; data: Buffer };

export type Clip = { fps: number; frames: number; width: number; height: number };

export async function record(page: Page, name: string, script: () => Promise<void>) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Recording needs a fixed viewport");
  const frames: Frame[] = [];
  let recording = true;
  const capture = (async () => {
    while (recording) {
      const time = Date.now();
      // A screenshot can fail mid-navigation; that tick reuses the previous frame.
      const data = await page.screenshot({ type: "jpeg", quality: 90 }).catch(() => null);
      if (data) frames.push({ time, data });
      else await new Promise((resolve) => setTimeout(resolve, 50));
    }
  })();
  const start = Date.now();
  try {
    await script();
  } finally {
    recording = false;
    await capture;
  }
  const end = Date.now();
  if (frames.length === 0) throw new Error(`No frames recorded for ${name}`);
  writeClip(name, frames, start, end, viewport);
}

function writeClip(
  name: string,
  frames: Frame[],
  start: number,
  end: number,
  viewport: { width: number; height: number },
) {
  const dir = join(FRAMES_DIR, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  frames.sort((a, b) => a.time - b.time);
  const total = Math.floor(((end - start) / 1000) * FPS);
  let cursor = 0;
  for (let i = 0; i < total; i++) {
    const t = start + (i * 1000) / FPS;
    while (cursor + 1 < frames.length && frames[cursor + 1]!.time <= t) cursor++;
    writeFileSync(join(dir, `${String(i).padStart(4, "0")}.jpg`), frames[cursor]!.data);
  }
  const clip: Clip = { fps: FPS, frames: total, ...viewport };
  writeFileSync(join(dir, "clip.json"), JSON.stringify(clip, null, 2));
  console.log(`${name}: ${total} frames (${((end - start) / 1000).toFixed(1)}s)`);
}

// Moves the mouse in visible steps so the recording shows a deliberate path to the target.
export async function glide(page: Page, x: number, y: number, steps = 20) {
  await page.mouse.move(x, y, { steps });
}

export const pause = (page: Page, ms: number) => page.waitForTimeout(ms);
