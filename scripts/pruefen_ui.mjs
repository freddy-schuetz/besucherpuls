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
const gebietSlug2 = {
  allgaeu: "allgaeu", "bayerischer-wald": "bayerischer-wald",
  berchtesgaden: "berchtesgaden", groeden: "groeden", "zuerich-baeder": "zuerich",
  "wien-baeder": "wien", "kiel-foerde": "kieler-foerde",
};
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
  const verbotene = ["besser dorthin", "ruhiger ist es bei", "Jetzt losfahren",
                     "Lieber später", "Gleiches Ziel, anderer Zugang"];
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
    || nachher.includes("Noch ohne Vergleich") || nachher.includes("Was dich hier erwartet");
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

    // Die Ueberschrift traegt jetzt den Zustand des AUSGANGSZIELS ("Hier ist
    // voll — besser dorthin" bzw. "Wird eng — ruhiger ist es bei"), damit ein
    // gruener Kasten nicht ueber einem vollen Parkplatz steht.
    const knopf = await p.$(`button:has-text("${kandidat.alternative.name}")`);
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

// --------------------------------------------- Farbe des Empfehlungskastens
// Der Kasten war durchgehend gruen — auch ueber "0 von 10 Plaetzen frei, Voll".
// Ein grosses gruenes Feld liest sich dann als "hier ist alles in Ordnung".
{
  const daten = await (await fetch(`${BASIS}/api/status`)).json();
  // KEINE LEIHRAD-ZIELE. Deren `ampel` beschreibt die RUECKGABE ("kein Dock
  // frei"), die Oberflaeche startet aber im Modus "Rad ausleihen" — und dort
  // ist dieselbe Station mit fuenf Raedern gruen. Dann erscheint korrekt gar
  // kein Empfehlungskasten, und die Pruefung meldete einen Fehler, den es
  // nicht gibt. Fuer diesen Punkt taugen nur Ziele mit eindeutigem Zustand.
  const voll = (daten.ziele ?? []).find(
    (z) => z.alternative && z.ampel === "rot" && !z.leihen && gebietSlug2[z.gebiet]);
  console.log(`
FARBE DES EMPFEHLUNGSKASTENS`);
  if (!voll) {
    console.log("  gerade kein volles Ziel mit Empfehlung — nicht pruefbar");
  } else {
    const { ctx, p } = await seite(1440, 1000);
    await p.goto(`${BASIS}/region/${gebietSlug2[voll.gebiet]}`, { waitUntil: "networkidle" });
    await p.waitForSelector("text=Wohin willst du?", { timeout: 30_000 });
    await p.fill("input", voll.name.slice(0, 12));
    await p.waitForTimeout(500);
    await p.click(`ul li button:has-text("${voll.name.slice(0, 12)}")`);
    await p.waitForTimeout(900);
    // Geprueft wird die REGEL, nicht ein Zweig: Der Ratschlagkasten traegt die
    // Farbe des Ausgangsziels. Vorher suchte die Pruefung nur den Ortswechsel —
    // steht dort der Zeit-Tipp ("Lieber später", Stufe 2 der Leiter), fand sie
    // gar nichts und meldete "Kasten null". Genau so blieb monatelang
    // unbemerkt, dass der Zeit-Tipp ueber einem vollen Ziel bernsteinfarben
    // war. Jetzt zaehlt jeder Kasten, den die Kaskade liefern kann.
    const bg = await p.evaluate(() => {
      const treffer = /besser dorthin|ruhiger ist es bei|lieber später|anderer Zugang/i;
      const el = [...document.querySelectorAll("main div, main button")]
        .find((x) => treffer.test(x.textContent || "") && /rounded-2xl/.test(x.className));
      return el ? getComputedStyle(el).backgroundColor : null;
    });
    // var(--color-voll-weich) = #fdecec -> rgb(253, 236, 236)
    const istRot = bg && /^rgb\(25[0-5], 2[0-4]\d, 2[0-4]\d\)$/.test(bg);
    console.log(`  ${istRot ? "OK " : "FEHL"} ${voll.name}: Kasten ${bg}`);
    if (!istRot) befunde.push(`Empfehlungskasten bei vollem Ziel ist ${bg}, nicht rot`);
    await p.screenshot({ path: `${AUS}/6-kasten-farbe.png` });
    await ctx.close();
  }
}

// -------------------------------------------------- Vokabular passt zur Region
//
// Die Absicht „Rad ausleihen / Rad abgeben" ist regionsweit vorbelegt und steht
// deshalb auch dort auf „ausleihen", wo es gar keine Räder gibt. Ein Etikett,
// das nur diese Flagge abfragt und nicht das Ziel, schreibt dann „Rad gibt es
// hier: Nationalparkzentrum Lusen · 4,5 km" unter einen Parkplatz im
// Bayerischen Wald. Das ist keine Schönheitsfrage — es beschreibt eine Sache,
// die es dort nicht gibt.
{
  console.log(`\nVOKABULAR PASST ZUR REGION`);
  const radWorte = /Rad gibt es hier|Kein Rad hier|Räder zum Mitnehmen|Rad zum Mitnehmen|Rad ausleihen|Rad abgeben/;
  for (const slug of ["bayerischer-wald", "groeden", "wien", "zuerich", "allgaeu"]) {
    const { ctx, p } = await seite(1440, 1400);
    await p.goto(`${BASIS}/region/${slug}`, { waitUntil: "networkidle" });
    await p.waitForSelector("text=Wohin willst du?", { timeout: 30_000 });
    await p.waitForTimeout(1200);
    const text = (await p.textContent("main")) ?? "";
    const treffer = text.match(radWorte);
    console.log(`  ${treffer ? "FEHL" : "OK  "} ${slug}${treffer ? `: „${treffer[0]}"` : ""}`);
    if (treffer) {
      befunde.push(`${slug} zeigt Leihrad-Vokabular („${treffer[0]}"), obwohl es dort keine Räder gibt`);
      await p.screenshot({ path: `${AUS}/vokabular-${slug}.png`, fullPage: true });
    }
    await ctx.close();
  }
  // Gegenprobe: In Kiel MUSS das Vokabular vorkommen — sonst prüft der Test
  // nur, ob eine Zeichenkette zufällig nirgends steht.
  const { ctx, p } = await seite(1440, 1400);
  await p.goto(`${BASIS}/region/kieler-foerde`, { waitUntil: "networkidle" });
  await p.waitForSelector("text=Wohin willst du?", { timeout: 30_000 });
  await p.waitForTimeout(1200);
  const kiel = (await p.textContent("main")) ?? "";
  const hatRad = radWorte.test(kiel);
  console.log(`  ${hatRad ? "OK  " : "FEHL"} kieler-foerde: Rad-Vokabular ${hatRad ? "vorhanden" : "FEHLT"}`);
  if (!hatRad) befunde.push("Kiel zeigt kein Leihrad-Vokabular — die Gegenprobe greift nicht");
  await ctx.close();
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
