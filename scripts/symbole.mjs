// Erzeugt die PNG-Symbole der App aus web/public/icon.svg (einmalig, Ergebnis ist eingecheckt).
// Braucht Playwright mit Chromium: node scripts/symbole.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");

const svg = readFileSync(new URL("../web/public/icon.svg", import.meta.url), "utf8");
const ziele = [["apple-touch-icon.png", 180, 1], ["icon-192.png", 192, 1], ["icon-512.png", 512, 1], ["icon-maskable-512.png", 512, 0.72]];
const browser = await chromium.launch();
for (const [name, kante, anteil] of ziele) {
    const seite = await browser.newPage({ viewport: { width: kante, height: kante } });
    // Maskierbar: Motiv kleiner, damit ein runder Ausschnitt nichts abschneidet.
    await seite.setContent(`<body style="margin:0;background:#12275e;display:grid;place-items:center;height:100vh"><div style="width:${anteil * 100}%;line-height:0">${svg}</div>`);
    writeFileSync(new URL(`../web/public/${name}`, import.meta.url), await seite.screenshot());
    await seite.close();
}
await browser.close();
