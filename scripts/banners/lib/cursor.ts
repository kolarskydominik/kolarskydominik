// Headless Chrome paints no pointer, so recordings get a drawn arrow that follows the mouse
// and a ripple on each click.
import type { BrowserContext } from "playwright";

export async function showPointer(context: BrowserContext) {
  await context.addInitScript(() => {
    const install = () => {
      if (document.getElementById("__banner-pointer")) return;
      const style = document.createElement("style");
      style.textContent = `
        #__banner-pointer { position: fixed; left: 0; top: 0; margin: -3px 0 0 -4px; z-index: 2147483647;
          pointer-events: none; }
        .__banner-ripple { position: fixed; z-index: 2147483646; pointer-events: none; width: 16px; height: 16px;
          margin: -8px 0 0 -8px; border-radius: 50%; border: 2px solid rgba(0, 0, 0, 0.45);
          animation: __banner-ripple 450ms ease-out forwards; }
        @keyframes __banner-ripple { to { transform: scale(3.2); opacity: 0; } }`;
      document.head.append(style);
      const pointer = document.createElement("div");
      pointer.id = "__banner-pointer";
      pointer.innerHTML =
        '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2.5 19.5 12l-7 1.6L9 20.5z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
      document.body.append(pointer);
      window.addEventListener(
        "mousemove",
        (e) => {
          pointer.style.left = `${e.clientX}px`;
          pointer.style.top = `${e.clientY}px`;
        },
        true,
      );
      window.addEventListener(
        "mousedown",
        (e) => {
          const ripple = document.createElement("div");
          ripple.className = "__banner-ripple";
          ripple.style.left = `${e.clientX}px`;
          ripple.style.top = `${e.clientY}px`;
          document.body.append(ripple);
          setTimeout(() => ripple.remove(), 500);
        },
        true,
      );
    };
    if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", install);
    else install();
  });
}
