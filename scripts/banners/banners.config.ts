// Banner layouts. Sizes are CSS pixels of an 800x360 scene rendered at 2x (1600x720 WebP).
export const WIDTH = 1600;
export const HEIGHT = 720;
export const OUT_FPS = 12;

export type Slot = {
  clip: string;
  kind: "browser" | "phone";
  x: number;
  y: number;
  width: number;
  url?: string;
  zIndex?: number;
};

export type Banner = {
  name: string;
  background: string;
  chrome: string;
  chromeField: string;
  chromeText: string;
  decor?: string;
  // Seconds the final frame stays up before the loop restarts.
  hold: number;
  slots: Slot[];
};

const glow = (color: string, x: string, y: string, size = "60%") =>
  `<div style="position:absolute;inset:0;background:radial-gradient(circle at ${x} ${y}, ${color}, transparent ${size})"></div>`;

export const BANNERS: Banner[] = [
  {
    name: "tickadoo",
    background: "#07090d",
    chrome: "#1b1e24",
    chromeField: "#2a2e36",
    chromeText: "#9aa3ad",
    decor: glow("rgba(25, 211, 166, .28)", "18%", "0%") + glow("rgba(124, 77, 255, .22)", "95%", "100%"),
    hold: 1.2,
    slots: [
      { clip: "tickadoo-web", kind: "browser", x: 59, y: 13, width: 500, url: "tickadoo.com" },
      { clip: "tickadoo-ios", kind: "phone", x: 583, y: 15, width: 158 },
    ],
  },
  {
    name: "svacinkuj",
    background: "#fff6ef",
    chrome: "#ffffff",
    chromeField: "#f1ece8",
    chromeText: "#8a817a",
    decor: glow("rgba(255, 90, 31, .30)", "100%", "0%") + glow("rgba(255, 170, 60, .22)", "0%", "100%"),
    hold: 1.2,
    slots: [
      { clip: "svacinkuj-admin", kind: "browser", x: 59, y: 13, width: 500, url: "app.svacinkuj.cz/admin" },
      { clip: "svacinkuj-parent", kind: "phone", x: 583, y: 15, width: 158 },
    ],
  },
  {
    name: "previewloop",
    background: "#f4f7ff",
    chrome: "#ffffff",
    chromeField: "#eef1f7",
    chromeText: "#7d8594",
    decor: glow("rgba(37, 99, 235, .26)", "0%", "0%") + glow("rgba(37, 99, 235, .18)", "100%", "100%"),
    hold: 1.2,
    slots: [{ clip: "previewloop", kind: "browser", x: 120, y: 12, width: 560, url: "hush-preview.example.com" }],
  },
];
