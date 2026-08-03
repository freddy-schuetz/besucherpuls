/**
 * Prueft, dass „Morgen frueh" im Frontend wirklich die Morgen-Kurve liest.
 *
 * WARUM MIT FIXTURE. Der Workflow liefert `tagesgang_morgen` nur, wenn der
 * Tagestyp morgen wechselt — also freitags und sonntags. An den uebrigen fuenf
 * Tagen kaeme dieser Test nie an der Abzweigung vorbei und meldete trotzdem
 * „gruen". Deshalb wird die Antwort von /api/status abgefangen und um eine
 * Morgen-Kurve ergaenzt, die sich EINDEUTIG von der Heute-Kurve unterscheidet.
 * Geprueft wird dann die echte Komponentenkette, nicht eine Nachbildung.
 *
 * Erwartung: unter „Heute Nachmittag" traegt die Kachel den Status der
 * Heute-Kurve, unter „Morgen frueh" den der Morgen-Kurve.
 *
 *   node scripts/pruefen_morgen.mjs [basis-url]
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const { chromium } = createRequire(resolve("../dmo-demo/package.json"))("playwright");
const BASIS = process.argv[2] ?? "http://localhost:3311";

const daten = JSON.parse(readFileSync("scripts/.status-schnappschuss.json", "utf-8"));

// Ein Ziel im Bayerischen Wald mit Kurve UND Prozent-Ampel — dort gibt es
// Kapazitaeten, also traegt tagesgang_status echte Stufen.
const opfer = daten.ziele.find(
  (z) => z.gebiet === "bayerischer-wald" && z.tagesgang && z.tagesgang_status,
);
if (!opfer) {
  console.error("Kein geeignetes Ziel im Schnappschuss — erst grafik_bauen.py laufen lassen.");
  process.exit(1);
}

// Heute um 15 Uhr moeglichst leer, morgen um 9 Uhr randvoll: zwei Stufen, die
// niemand verwechseln kann.
const HEUTE_H = 15, MORGEN_H = 9;
const kopie = JSON.parse(JSON.stringify(daten));
const ziel = kopie.ziele.find((z) => z.id === opfer.id);
ziel.tagesgang[HEUTE_H] = 5;
ziel.tagesgang_status[HEUTE_H] = { ampel: "gruen", kurz: "Viel Platz", art: "kapazitaet" };
ziel.tagesgang_morgen = ziel.tagesgang.slice();
ziel.tagesgang_morgen_status = ziel.tagesgang_status.slice();
ziel.tagesgang_morgen[MORGEN_H] = 98;
ziel.tagesgang_morgen_status[MORGEN_H] = { ampel: "rot", kurz: "Voll", art: "kapazitaet" };
// Die Heute-Kurve muss zur selben Stunde etwas ANDERES sagen, sonst beweist
// der Vergleich nichts.
ziel.tagesgang[MORGEN_H] = 5;
ziel.tagesgang_status[MORGEN_H] = { ampel: "gruen", kurz: "Viel Platz", art: "kapazitaet" };

const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
await p.route("**/api/status*", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(kopie) }));

await p.goto(`${BASIS}/region/bayerischer-wald`, { waitUntil: "networkidle" });
await p.waitForSelector("text=Wohin willst du?", { timeout: 30_000 });

/** Der Statustext auf der Kachel dieses Ziels. */
async function kachelStatus() {
  return p.evaluate((name) => {
    for (const h3 of document.querySelectorAll("h3")) {
      if (h3.textContent.trim() === name) {
        return h3.closest("button")?.innerText.replace(/\s+/g, " ") ?? null;
      }
    }
    return null;
  }, opfer.name);
}

async function waehle(text) {
  await p.click(`button:has-text("${text}")`);
  await p.waitForTimeout(400);
}

const befunde = [];
console.log(`Ziel: ${opfer.name}`);

// Geprueft wird der PROZENTWERT auf der Kachel, nicht das Statuswort: „Meist
// voll" steht dort kleingeschrieben, und an so einer Grossschreibung soll kein
// Testergebnis haengen. 5 gegen 98 ist unmissverstaendlich.
const HEUTE_TEXT = "typischerweise 5 %";
const MORGEN_TEXT = "typischerweise 98 %";

await waehle("Heute Nachmittag");
const nachmittag = await kachelStatus();
console.log(`  Heute Nachmittag -> ${nachmittag}`);
if (!nachmittag) befunde.push("Kachel unter „Heute Nachmittag\" nicht gefunden");
else if (!nachmittag.includes(HEUTE_TEXT) || nachmittag.includes(MORGEN_TEXT)) {
  befunde.push("„Heute Nachmittag\" zeigt nicht die Heute-Kurve");
}

await waehle("Morgen früh");
const morgen = await kachelStatus();
console.log(`  Morgen früh      -> ${morgen}`);
if (!morgen) befunde.push("Kachel unter „Morgen früh\" nicht gefunden");
else if (!morgen.includes(MORGEN_TEXT) || morgen.includes(HEUTE_TEXT)) {
  befunde.push(
    "„Morgen früh\" liest weiterhin die Heute-Kurve — der Tagestyp-Fix greift im Frontend nicht",
  );
}

await browser.close();
if (befunde.length) {
  console.error("\nFEHLGESCHLAGEN:");
  for (const b of befunde) console.error(`  - ${b}`);
  process.exit(1);
}
console.log("\nOK — die Zeitwahl liest die richtige Kurve.");
