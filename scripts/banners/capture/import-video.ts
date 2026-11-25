// Turns a device screen recording into a clip, keeping only the listed time ranges so the
// pauses between scripted taps drop out.
// Usage: bun capture/import-video.ts <clip> <video.mp4> [--top-band <png>] <start-end> [start-end...]
// Example: bun capture/import-video.ts tickadoo-ios run.mp4 1.0-3.7 5.8-7.6 11.2-14.2 15.0-16.2 17.6-21.0
//
// --top-band covers the top of every frame with the given image (same width as the video),
// for example a clean status bar over a staging environment banner. The image is multiplied
// by the page brightness just below it, so it darkens with the page when a sheet dims it.
import { execFileSync } from "node:child_process";
import { closeSync, mkdirSync, mkdtempSync, openSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FPS, FRAMES_DIR, type Clip } from "../lib/recorder";

const WIDTH = 480;

const args = process.argv.slice(2);
const bandAt = args.indexOf("--top-band");
const band = bandAt >= 0 ? args.splice(bandAt, 2)[1] : undefined;
const [name, video, ...ranges] = args;
if (!name || !video || ranges.length === 0 || (bandAt >= 0 && !band)) {
  console.error("Usage: bun capture/import-video.ts <clip> <video.mp4> [--top-band <png>] <start-end> [start-end...]");
  process.exit(1);
}
const segments = ranges.map((range) => {
  const [start, end] = range.split("-").map(Number);
  if (!(start! >= 0 && end! > start!)) throw new Error(`Bad range ${range}`);
  return { start: start!, end: end! };
});

if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Clip name ${name} must be lowercase letters, digits and dashes`);
const dir = join(FRAMES_DIR, name);
const trims = segments.map((s, i) => `[0:v]trim=${s.start}:${s.end},setpts=PTS-STARTPTS[s${i}]`).join(";");
const inputs = segments.map((_, i) => `[s${i}]`).join("");
let filter = `${trims};${inputs}concat=n=${segments.length}:v=1,format=rgb24[v]`;
const inputArgs = ["-i", video];
if (band) {
  const [bandWidth, bandHeight] = imageSize(band);
  const [videoWidth] = imageSize(video);
  if (videoWidth !== bandWidth) throw new Error(`--top-band is ${bandWidth}px wide but the video is ${videoWidth}px`);
  inputArgs.push("-loop", "1", "-i", band);
  // A 6x6 patch at the left margin, 17px below the band (the page gutter under the covered
  // staging bar), sets the brightness. It is reduced to grey so it dims without tinting.
  filter +=
    `;[v]split[page][probe];[probe]crop=6:6:0:${bandHeight + 17},format=gray,scale=${bandWidth}:${bandHeight},format=gbrp[light]` +
    `;[1:v]format=gbrp[clean];[clean][light]blend=all_mode=multiply:shortest=1,format=rgb24[top]` +
    `;[page][top]overlay=0:0:shortest=1[v]`;
}
filter += `;[v]fps=${FPS},scale=${WIDTH}:-2[out]`;

// Frames go to a scratch directory, created after every check passes, and replace the clip
// only once the import is complete; the scratch directory is always removed. A lock file
// refuses a second import of the same clip while one is running.
mkdirSync(FRAMES_DIR, { recursive: true });
const lock = join(FRAMES_DIR, `.import-${name}.lock`);
try {
  closeSync(openSync(lock, "wx"));
} catch {
  throw new Error(`Another import of ${name} is running (remove ${lock} if it is stale)`);
}
const scratch = mkdtempSync(join(FRAMES_DIR, `.import-${name}-`));
let frames: number;
try {
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...inputArgs, "-filter_complex", filter, "-map", "[out]", "-q:v", "3", "-start_number", "0", join(scratch, "%04d.jpg")], {
    stdio: "inherit",
  });
  frames = readdirSync(scratch).filter((f) => f.endsWith(".jpg")).length;
  if (frames === 0) throw new Error("ffmpeg produced no frames");
  const [width, height] = imageSize(join(scratch, "0000.jpg"));
  const clip: Clip = { fps: FPS, frames, width, height };
  writeFileSync(join(scratch, "clip.json"), JSON.stringify(clip, null, 2));
  rmSync(dir, { recursive: true, force: true });
  renameSync(scratch, dir);
} finally {
  rmSync(scratch, { recursive: true, force: true });
  rmSync(lock, { force: true });
}
console.log(`${name}: ${frames} frames (${(frames / FPS).toFixed(1)}s)`);

function imageSize(file: string): [number, number] {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file]);
  const [width, height] = out.toString().trim().split(",").map(Number);
  return [width!, height!];
}
