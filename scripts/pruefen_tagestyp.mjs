/**
 * Prueft, dass der Tagesgang wirklich am uebergebenen Tagestyp haengt.
 *
 * WARUM EIGENS. Der Fehler war: `tagesgang()` baute die Kurve fest nach dem
 * Tagestyp von HEUTE, waehrend „Morgen frueh" dieselbe Kurve las. Sichtbar wird
 * das nur freitags und sonntags — an fuenf von sieben Tagen sieht die Live-
 * Antwort korrekt aus, obwohl der Fehler drin ist. Ein Test, der nur die
 * Live-Antwort anschaut, haette den Fix an einem Montag „bestaetigt", ohne
 * irgendetwas zu pruefen.
 *
 * Deshalb wird die Funktion HIER AUS DER QUELLDATEI GELESEN und mit echten
 * Profildaten beidseitig aufgerufen. Keine Nachbildung: faellt der Parameter
 * je wieder weg, schlaegt der Test fehl.
 *
 *   node scripts/pruefen_tagestyp.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HIER = dirname(fileURLToPath(import.meta.url));
const WURZEL = resolve(HIER, "../../..");
const QUELLE = resolve(HIER, "status_node.js");
const PROFIL_TABELLE = "OPyMv8bkUvAwtMCc";

// --------------------------------------------------- Funktionen aus der Quelle
const code = readFileSync(QUELLE, "utf-8");

function funktion(name) {
  const start = code.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name}() nicht in status_node.js gefunden`);
  let tiefe = 0;
  for (let i = code.indexOf("{", start); i < code.length; i++) {
    if (code[i] === "{") tiefe++;
    else if (code[i] === "}" && --tiefe === 0) return code.slice(start, i + 1);
  }
  throw new Error(`${name}() nicht geschlossen`);
}

if (!/function tagesgang\(dh, wochenende\)/.test(code)) {
  console.error("FEHLER: tagesgang() nimmt den Tagestyp nicht mehr als Parameter.");
  process.exit(1);
}

// eslint-disable-next-line no-new-func
const tagesgang = new Function(
  `${funktion("poolen")}\n${funktion("tagesgang")}\nreturn tagesgang;`,
)();

// ------------------------------------------------------------ echte Profildaten
const mcp = JSON.parse(readFileSync(resolve(WURZEL, ".mcp.json"), "utf-8"));
const umgebung = Object.values(mcp.mcpServers).find((s) => s.env?.N8N_API_KEY)?.env;
const basis = umgebung.N8N_API_URL.replace(/\/$/, "") + "/api/v1";

const zeilen = [];
let cursor = null;
for (let seite = 0; seite < 10; seite++) {
  const u = `${basis}/data-tables/${PROFIL_TABELLE}/rows?limit=250`
    + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
  const a = await (await fetch(u, { headers: { "X-N8N-API-KEY": umgebung.N8N_API_KEY } })).json();
  zeilen.push(...(a.data || []));
  cursor = a.nextCursor;
  if (!cursor) break;
}

let geprueft = 0, unterschiedlich = 0;
const beispiele = [];
for (const z of zeilen) {
  let r = null;
  try { r = JSON.parse(z.raster || "{}"); } catch { continue; }
  if (!r || r.v !== 2 || !r.dh) continue;
  const werk = tagesgang(r.dh, false);
  const ende = tagesgang(r.dh, true);
  if (!werk || !ende) continue;
  geprueft++;
  if (JSON.stringify(werk) !== JSON.stringify(ende)) {
    unterschiedlich++;
    if (beispiele.length < 5) {
      beispiele.push([z.sensor_id, werk[9], ende[9]]);
    }
  }
}

console.log(`Profile mit beidseitiger Kurve: ${geprueft}`);
console.log(`davon Werktag != Wochenende:   ${unterschiedlich}`);
for (const [id, w, e] of beispiele) {
  console.log(`  ${String(id).slice(0, 34).padEnd(36)} 9 Uhr: Werktag ${w} · Wochenende ${e}`);
}

// Wenn KEIN einziges Profil die beiden Tagestypen unterscheidet, misst der Test
// nichts — dann ist der Fix unbelegt, egal wie gruen die Ausgabe aussieht.
if (geprueft === 0 || unterschiedlich === 0) {
  console.error("\nFEHLGESCHLAGEN: kein Profil trennt Werktag und Wochenende — nichts belegt.");
  process.exit(1);
}
console.log("\nOK — der Tagestyp wirkt auf die Kurve.");
