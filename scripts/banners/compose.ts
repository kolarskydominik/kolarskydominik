// Composes recorded clips into animated WebP banners for the profile README.
// Usage: bun compose.ts [banner...]  (no arguments builds every banner)
//
// Each banner is an HTML scene with device frames whose screens show clip frames. The scene
// is rendered once per output frame and the PNGs are encoded with img2webp.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BANNERS, HEIGHT, OUT_FPS, WIDTH, type Banner, type Slot } from "./banners.config";
import { FRAMES_DIR, type Clip } from "./lib/recorder";

const OUT_DIR = fileURLToPath(new URL("../../assets/banners/", import.meta.url));
const SCALE = 2;
const QUALITY = 72;
const ORIGIN = "http://banner.invalid";

const wanted = process.argv.slice(2);
const unknown = wanted.filter((name) => !BANNERS.some((banner) => banner.name === name));
if (unknown.length) throw new Error(`Unknown banner ${unknown.join(", ")}; expected ${BANNERS.map((b) => b.name).join(", ")}`);
const browser = await chromium.launch({ channel: "chrome" });
try {
  for (const banner of BANNERS) {
    if (wanted.length === 0 || wanted.includes(banner.name)) await compose(banner);
  }
} finally {
  await browser.close();
}

async function compose(banner: Banner) {
  const clips = banner.slots.map((slot) => loadClip(slot.clip));
  const seconds = Math.max(...clips.map((c) => c.frames / c.fps)) + banner.hold;
  const total = Math.round(seconds * OUT_FPS);
  const work = join(FRAMES_DIR, `_${banner.name}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  const page = await browser.newPage({
    viewport: { width: WIDTH / SCALE, height: HEIGHT / SCALE },
    deviceScaleFactor: SCALE,
  });
  // Frames are served from disk under a private origin; file:// URLs do not load in the scene.
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html", body: scene(banner) });
    return route.fulfill({ contentType: "image/jpeg", body: readFileSync(join(FRAMES_DIR, decodeURIComponent(path))) });
  });
  await page.goto(`${ORIGIN}/`);
  const files: string[] = [];
  for (let i = 0; i < total; i++) {
    const t = i / OUT_FPS;
    const sources = clips.map((clip, s) => {
      // Shorter clips hold their last frame until the banner loops.
      const index = Math.min(Math.floor(t * clip.fps), clip.frames - 1);
      return `${ORIGIN}/${banner.slots[s]!.clip}/${String(index).padStart(4, "0")}.jpg`;
    });
    await page.evaluate(async (srcs) => {
      const screens = [...document.querySelectorAll<HTMLImageElement>("img.screen")];
      await Promise.all(
        screens.map((img, n) => {
          if (img.src === srcs[n]) return;
          img.src = srcs[n]!;
          return img.decode();
        }),
      );
    }, sources);
    const file = join(work, `${String(i).padStart(4, "0")}.png`);
    await page.screenshot({ path: file, omitBackground: true });
    files.push(file);
  }
  await page.close();

  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, `${banner.name}.webp`);
  const delay = String(Math.round(1000 / OUT_FPS));
  execFileSync("img2webp", ["-loop", "0", "-mixed", "-q", String(QUALITY), "-m", "6", "-d", delay, ...files, "-o", out], {
    stdio: "inherit",
  });
  const kb = Math.round(readFileSync(out).length / 1024);
  console.log(`${banner.name}: ${total} frames, ${seconds.toFixed(1)}s, ${kb} KB -> ${out}`);
}

function loadClip(name: string): Clip {
  const meta = join(FRAMES_DIR, name, "clip.json");
  if (!existsSync(meta)) throw new Error(`Clip ${name} is missing; record it first`);
  return JSON.parse(readFileSync(meta, "utf8"));
}

function scene(banner: Banner) {
  const w = WIDTH / SCALE;
  const h = HEIGHT / SCALE;
  return `<!doctype html><html><head><style>
    * { box-sizing: border-box; margin: 0; }
    html, body { width: ${w}px; height: ${h}px; background: transparent; overflow: hidden; }
    .card { position: absolute; inset: 0; border-radius: 14px; overflow: hidden; background: ${banner.background}; }
    .slot { position: absolute; overflow: hidden; }
    .browser { border-radius: 10px; background: ${banner.chrome}; box-shadow: 0 18px 50px rgba(0,0,0,.28), 0 0 0 1px rgba(0,0,0,.08); }
    .browser .bar { height: 22px; display: flex; align-items: center; gap: 5px; padding: 0 10px; }
    .browser .bar i { width: 7px; height: 7px; border-radius: 50%; background: #ff5f57; }
    .browser .bar i:nth-child(2) { background: #febc2e; } .browser .bar i:nth-child(3) { background: #28c840; }
    .browser .bar b { margin-left: 12px; flex: 1; height: 12px; border-radius: 6px; max-width: 46%;
      background: ${banner.chromeField}; font: 500 7px/12px -apple-system, system-ui, sans-serif; color: ${banner.chromeText};
      text-align: center; }
    .browser img.screen { display: block; width: 100%; }
    .phone { border-radius: 30px; padding: 5px; background: #0d0d0f; box-shadow: 0 18px 50px rgba(0,0,0,.32), inset 0 0 0 1.5px #3a3a3e; }
    .phone img.screen { display: block; width: 100%; border-radius: 25px; }
  </style></head><body><div class="card">${banner.decor ?? ""}${banner.slots.map(slotHtml).join("")}</div></body></html>`;
}

function slotHtml(slot: Slot) {
  const box = `left:${slot.x}px;top:${slot.y}px;width:${slot.width}px;${slot.zIndex ? `z-index:${slot.zIndex};` : ""}`;
  if (slot.kind === "phone") return `<div class="slot phone" style="${box}"><img class="screen" alt=""></div>`;
  return `<div class="slot browser" style="${box}"><div class="bar"><i></i><i></i><i></i><b>${slot.url ?? ""}</b></div><img class="screen" alt=""></div>`;
}
