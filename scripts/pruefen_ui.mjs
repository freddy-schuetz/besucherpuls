/**
 * Prueft die Oberflaeche — die Punkte 6 und 7 des Plans, die man am Datensatz
 * nicht sehen kann:
 *
 *   6 Kein Vorschlag ohne Frage: Auf einer frisch geladenen Gebietsseite steht
 *     keine Empfehlung. (Vorher stand dort "Alpsee P1 ist voll, bei P3 ist mehr
 *     Platz" — bevor irgendjemand gesagt hatte, was er vorhat.)
 *   7 Kategorie filtert die Karte: Nach Wahl einer Kategorie stimmt die Zahl der
 *     Kartenpunkte mit der Zahl der Listeneintraege ueberein. (Vorher filterte
 *     die Wahl nur die Liste, die Karte zeigte weiter alle Punkte.)
 *
 * Dazu Bildschirmfotos in Desktop- und Handybreite.
 *
 *   NODE_PATH=../dmo-demo/node_modules node scripts/pruefen_ui.mjs [basis-url]
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// Playwright liegt nur in frontends/dmo-demo/node_modules. NODE_PATH wirkt bei
// ESM nicht, und ein direkter Dateiimport liefert das CJS-Modul in einer Huelle
// ohne `chromium`. createRequire mit dem fremden package.json als Anker loest
// es so auf, wie das Paket es erwartet.
const { chromium } = createRequire(resolve("../dmo-demo/package.json"))("playwright");

const BASIS = process.argv[2] ?? "http://localhost:3311";
const AUS = "scripts/.ui";
mkdirSync(AUS, { recursive: true });

const befunde = [];
const browser = await chromium.launch();

async function seite(breite, hoehe) {
  const ctx = await browser.newContext({ viewport: { width: breite, height: hoehe } });
  const p = await ctx.newPage();
  return { ctx, p };
}

// ------------------------------------------------------------------ 6 + 7
{
  const { ctx, p } = await seite(1440, 1000);
  await p.goto(`${BASIS}/region/allgaeu`, { waitUntil: "networkidle" });
  await p.waitForSelector("text=Wohin willst du?", { timeout: 30_000 });
  await p.waitForFunction(() => document.querySelectorAll("[aria-pressed]").length > 5, null,
    { timeout: 30_000 });

  // --- 6: keine Empfehlung ohne Eingabe
  const koerper = await p.textContent("main");
  const verbotene = ["Heute besser dorthin", "Jetzt losfahren", "Lieber später", "Gleiches Ziel, anderer Zugang"];
  const gefunden = verbotene.filter((v) => koerper.includes(v));
  console.log(`6 KEIN VORSCHLAG OHNE FRAGE`);
  if (gefunden.length) {
    console.log(`  GEFUNDEN: ${gefunden.join(", ")}`);
    befunde.push(`Empfehlung steht ohne Nutzereingabe auf der Seite: ${gefunden.join(", ")}`);
  } else {
    console.log("  sauber — die Seite sagt erst etwas, wenn ein Ziel gewaehlt ist");
  }

  await p.screenshot({ path: `${AUS}/1-einstieg.png`, fullPage: false });

  // --- 7: Kategorie filtert die Karte
  console.log(`\n7 KATEGORIE FILTERT DIE KARTE`);
  const knoepfe = await p.$$('button[aria-pressed]');
  let getestet = 0;
  for (const k of knoepfe) {
    // Der Knopftext beginnt mit einem Sinnbild ("▲Bergbahn9"), deshalb kein
    // Anker am Zeilenanfang — und die Zahl am Ende ist die erwartete Menge.
    const text = (await k.textContent())?.trim() ?? "";
    const m = text.match(/(Bergbahn|Wandern|Nationalpark|Baden|Rad leihen|Klamm|Im Ort|Altstadt)\s*(\d+)$/);
    if (!m) continue;
    const erwartet = Number(m[2]);
    if (!erwartet) continue;

    await k.click();
    await p.waitForTimeout(500);
    const aufKarte = Number(await p.getAttribute("[data-ziele]", "data-ziele"));
    const inListe = Number(
      (await p.textContent("section:has([data-ziele]) p"))?.match(/(\d+)/)?.[1] ?? -1);
    const ok = aufKarte === erwartet && inListe === erwartet;
    console.log(`  ${ok ? "OK " : "FEHL"} ${text.replace(/\s+/g, " ")}: `
      + `Kachel ${erwartet}, Karte ${aufKarte}, Beschriftung ${inListe}`);
    if (!ok) befunde.push(`Kategorie "${text}": Karte ${aufKarte} != Liste ${erwartet}`);
    if (getestet === 0) await p.screenshot({ path: `${AUS}/2-kategorie.png` });
    await k.click();                       // wieder abwaehlen
    await p.waitForTimeout(300);
    getestet++;
    if (getestet >= 3) break;
  }
  if (!getestet) befunde.push("Keine Kategorie zum Testen gefunden");

  // --- Ziel waehlen: erscheint die Antwort?
  console.log(`\nZIEL WAEHLEN`);
  await p.click("h3");                     // erste Zielkachel
  await p.waitForTimeout(800);
  const nachher = await p.textContent("main");
  const hatAnsage = verbotene.some((v) => nachher.includes(v)) || nachher.includes("Gerade voll")
    || nachher.includes("Noch ohne Vergleich");
  console.log(`  ${hatAnsage ? "OK " : "FEHL"} Antwortkarte erscheint nach Auswahl`);
  if (!hatAnsage) befunde.push("Nach Auswahl eines Ziels erscheint keine Ansage");
  await p.screenshot({ path: `${AUS}/3-antwort.png` });
  await ctx.close();
}

// ------------------------------------------------- Empfehlung ist klickbar
// Eine Empfehlung, die man nicht antippen kann, ist eine Sackgasse: Der Gast
// liest einen Namen und muss ihn selbst wiederfinden. Getestet wird an einem
// Ziel, das GERADE eine Empfehlung traegt — welches das ist, sagt die API.
{
  const gebietSlug = {
    allgaeu: "allgaeu", "bayerischer-wald": "bayerischer-wald",
    berchtesgaden: "berchtesgaden", groeden: "groeden", "zuerich-baeder": "zuerich",
    "wien-baeder": "wien", "kiel-foerde": "kieler-foerde",
  };
  const daten = await (await fetch(`${BASIS}/api/status`)).json();
  const kandidat = (daten.ziele ?? []).find((z) => z.alternative && gebietSlug[z.gebiet]);
  console.log(`\nEMPFEHLUNG IST KLICKBAR`);
  if (!kandidat) {
    console.log("  gerade kein volles Ziel — nicht pruefbar (kein Befund)");
  } else {
    const { ctx, p } = await seite(1440, 1000);
    await p.goto(`${BASIS}/region/${gebietSlug[kandidat.gebiet]}`, { waitUntil: "networkidle" });
    await p.waitForSelector("text=Wohin willst du?", { timeout: 30_000 });
    await p.fill("input", kandidat.name.slice(0, 12));
    await p.waitForTimeout(400);
    await p.click(`ul li button:has-text("${kandidat.name.slice(0, 12)}")`);
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${AUS}/4-empfehlung.png` });

    const knopf = await p.$('button:has-text("Heute besser dorthin")');
    if (!knopf) {
      console.log(`  FEHL ${kandidat.name}: Empfehlungskasten ist kein Knopf`);
      befunde.push(`Empfehlung bei "${kandidat.name}" ist nicht klickbar`);
    } else {
      const vorher = await p.getAttribute("[data-ziel]", "data-ziel");
      await knopf.click();
      await p.waitForTimeout(900);
      const nachher = await p.getAttribute("[data-ziel]", "data-ziel");
      const ok = nachher === kandidat.alternative.id && nachher !== vorher;
      console.log(`  ${ok ? "OK " : "FEHL"} ${kandidat.name} (${vorher}) -> Klick zeigt `
        + `"${nachher}" (erwartet "${kandidat.alternative.id}")`);
      if (!ok) befunde.push(`Klick auf die Empfehlung fuehrt nicht zum empfohlenen Ziel`);
      await p.screenshot({ path: `${AUS}/5-nach-klick.png` });
    }
    await ctx.close();
  }
}

// ------------------------------------------------------------------ mobil
for (const [slug, name] of [["wien", "Wien"], ["groeden", "Groeden"], ["allgaeu", "Allgaeu"]]) {
  const { ctx, p } = await seite(390, 844);
  await p.goto(`${BASIS}/region/${slug}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  // Waagerechtes Scrollen ist auf dem Handy der haeufigste Layoutfehler
  const ueberlauf = await p.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`\nMOBIL ${name}: Ueberlauf ${ueberlauf} px ${ueberlauf > 1 ? "— FEHLER" : "— ok"}`);
  if (ueberlauf > 1) befunde.push(`${name} mobil: ${ueberlauf} px waagerechter Ueberlauf`);
  await p.screenshot({ path: `${AUS}/mobil-${slug}.png`, fullPage: false });
  await ctx.close();
}

await browser.close();
console.log("\n" + "=".repeat(58));
if (befunde.length) {
  console.log(`${befunde.length} BEFUNDE:`);
  for (const b of befunde) console.log(`  - ${b}`);
  process.exit(1);
}
console.log("Oberflaeche sauber. Bilder in scripts/.ui/");
