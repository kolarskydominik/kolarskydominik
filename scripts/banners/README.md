# Profile banners

Animated WebP banners for the profile README, recorded from the real products.
The output goes to `assets/banners/<name>.webp` at 1600x720.

## How it works

1. **Capture** records each flow into a clip of numbered JPEG frames at 15 fps under `.frames/<clip>/`.
   Browser flows run in Playwright against the live sites (Svačinkuj uses its staging environment) and are recorded as viewport screenshots in a loop.
   Headless Chrome paints no pointer, so the recorder draws one.
2. **Compose** renders each banner scene from `banners.config.ts` at 12 fps, placing the clips inside browser and phone frames, and encodes the result with `img2webp`.

Clips shorter than their banner hold the last frame until the loop restarts.

## Requirements

- Bun, Google Chrome, `ffmpeg` and `img2webp` (from `brew install webp`).
- For Svačinkuj, a `.env` copied from `.env.example` with the staging host, the demo accounts and their test OTP code.
  Bun loads it automatically, and sessions are cached in `.secrets/`; both are ignored by Git.

## Regenerate

Run everything from `scripts/banners`.
The phone clips come from the Simulator (below), so on a fresh checkout import them before composing.

```bash
bun install
bun run capture   # all browser clips, or name some: bun run capture previewloop
# import the Simulator clips: see "Simulator clips"
bun run compose   # all banners, or name some: bun run compose tickadoo
```

Before capturing Svačinkuj, reseed staging with `scripts/staging-demo-data.ts` from the app repository.
The banners then show only generated demo recipients and orders, never real ones.

### Simulator clips

Both phones are iOS Simulator recordings, so they are not scripted here.
Before recording, freeze the status bar with `xcrun simctl status_bar <device> override --time 9:41 --dataNetwork wifi --wifiBars 3 --cellularBars 4 --batteryState charged --batteryLevel 100`.
Record the whole run, then import it while keeping only the moments that show something.

**tickadoo**: set the Simulator location to central London (51.5079, -0.1283), grant location access, relaunch the app, then tap Map, Filters, Tomorrow, Theatre and Show results.

```bash
bun capture/import-video.ts tickadoo-ios run.mp4 1.0-3.7 5.8-7.6 11.2-14.2 15.0-16.2 17.6-21.0
```

**Svačinkuj**: add the staging app to the Home Screen from Safari and sign in to the web app as the demo parent.
Run `bun capture/svacinkuj-reset-cart.ts` so the cart starts empty, then add two photographed baguettes, open the cart, accept the terms and order, ending on the Comgate form.
Staging shows an environment bar below the status bar, so the import covers it with the clean status bar in `assets/ios-status-bar.png`.
That image fits iPhone 17 Pro recordings (1206 px wide); the import refuses other widths.

```bash
bun capture/import-video.ts svacinkuj-parent run.mp4 --top-band assets/ios-status-bar.png <ranges...>
```

## Notes

- tickadoo seats are only selected on the seatmap, never added to the cart, and analytics beacons are blocked during recording.
- The PreviewLoop demo store keeps feedback in the page and sends nothing to the API.
- Svačinkuj orders created on staging stay unpaid; the clip ends on the Comgate checkout form.
  Reseeding staging clears them.
