/**
 * Rendert scripts/.ui/besucherpuls-linkedin.svg nach PNG.
 *
 * Playwright statt einer SVG-Bibliothek, weil nur eine echte Browser-Engine die
 * eingebetteten variablen Schriften mit denselben Metriken setzt wie die Seite
 * selbst. Alles andere ergibt eine Grafik, die „fast" aussieht wie das Produkt.
 *
 *   node scripts/grafik_rendern.mjs
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";

const HIER = dirname(fileURLToPath(import.meta.url));
// Playwright liegt nur in dmo-demo — NODE_PATH greift bei ESM nicht.
const holen = createRequire(resolve(HIER, "../../dmo-demo/package.json"));
const { chromium } = holen("playwright");

const SVG = resolve(HIER, "../marketing/besucherpuls-linkedin.svg");
const PNG = resolve(HIER, "../marketing/besucherpuls-linkedin.png");
if (!existsSync(SVG)) {
  console.error("Erst `python scripts/grafik_bauen.py` laufen lassen.");
  process.exit(1);
}

const svg = readFileSync(SVG, "utf-8");
const [, b, h] = svg.match(/width="(\d+)" height="(\d+)"/);

const browser = await chromium.launch();
const seite = await browser.newPage({
  viewport: { width: Number(b), height: Number(h) },
  deviceScaleFactor: 2, // LinkedIn skaliert herunter, nie herauf
});
await seite.setContent(
  `<style>html,body{margin:0;padding:0}svg{display:block}</style>${svg}`,
);
// Die Schriften stecken als data:-URI im SVG; ohne dieses Warten rendert
// Chromium den ersten Frame noch mit der Ersatzschrift.
await seite.evaluate(() => document.fonts.ready);
await seite.screenshot({ path: PNG, type: "png" });
await browser.close();

const { size } = (await import("node:fs")).statSync(PNG);
console.log(`${PNG}  ${b * 2}×${h * 2}  ${(size / 1024).toFixed(0)} KB`);
