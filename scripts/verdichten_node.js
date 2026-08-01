// besucherpuls-verdichten — schreibt den Ringpuffer in die Vergleichsbasis fort.
//
// Dieser Schritt fehlte bisher komplett. Der Sammler schrieb alle 5 Minuten in den
// Puffer, aber niemand ueberfuehrte das ins Profil — deshalb standen Sensoren ohne
// mitgelieferte Historie (Luzern, GBFS) nach Tagen immer noch auf basis_n = 0 und
// bekamen nie eine Einordnung.
//
// Laeuft stuendlich zur Minute 5 und verarbeitet die ZULETZT ABGESCHLOSSENE Stunde.
// Je Sensor und Stunde entsteht GENAU EIN Tageswert (der Median der ~12 Messungen).
// Das ist der Punkt: 12 Messungen desselben Nachmittags sind eine Beobachtung, nicht
// zwoelf — wer sie einzeln zaehlt, haelt einen einzigen Freitag fuer ein Freitagsprofil.

const MAX_TAGE = 12;      // so viele Vorkommen je Zelle werden behalten
const MAX_DATEN = 60;     // so viele Beobachtungstage werden mitgezaehlt
const TOT_MIN = 1440;     // Messwerte aelter als das beschreiben einen Ausfall

// Tabellen ueber die API lesen, NICHT ueber den Data-Table-Knoten: der wiederholt
// beim Lesen die erste Seite, bis das Limit erreicht ist (bei 1141 Zeilen lieferte
// er 2500 Items). Man bekaeme immer dieselben aeltesten Zeilen — und damit die
// falsche Stunde verdichtet.
const API = '/*__API_BASE__*/';
const API_KEY = '/*__API_KEY__*/';

async function tabelle(id, maxZeilen) {
  const raus = [];
  let cursor = null;
  for (let seite = 0; seite < 40; seite++) {
    let u = `${API}/data-tables/${id}/rows?limit=250`;
    if (cursor) u += '&cursor=' + encodeURIComponent(cursor);
    const a = await this.helpers.httpRequest({
      url: u, method: 'GET', json: true, timeout: 20000,
      headers: { 'X-N8N-API-KEY': API_KEY },
    });
    const zeilen = (a && a.data) || [];
    raus.push(...zeilen);
    cursor = a && a.nextCursor;
    if (!cursor || zeilen.length < 250 || raus.length >= maxZeilen) break;
  }
  return raus;
}

const profilZeilen = await tabelle.call(this, 'OPyMv8bkUvAwtMCc', 500);
const pufferZeilen = await tabelle.call(this, 'nVawEogJkPNKOCHp', 8000);

/** Wochentag (Mo=0), Stunde und Datum einer Zeit in Europe/Berlin. */
function ortszeit(ms) {
  const d = new Date(new Date(ms).toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
  return {
    dow: (d.getDay() + 6) % 7,
    stunde: d.getHours(),
    datum: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  };
}

function median(werte) {
  const s = [...werte].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

// Zielstunde = die zuletzt abgeschlossene. Bei Lauf um 21:05 ist das 20:00-20:59.
const jetzt = Date.now();
const zielMs = jetzt - 3600 * 1000;
const ziel = ortszeit(zielMs);
const zielKey = `${ziel.dow}_${ziel.stunde}`;

// Messwerte der Zielstunde je Sensor einsammeln
const werteJeSensor = {};
for (const r of pufferZeilen) {
  if (!r || !r.sensor_id || !r.ts) continue;
  const ms = Date.parse(r.ts);
  if (!Number.isFinite(ms)) continue;
  const o = ortszeit(ms);
  if (o.datum !== ziel.datum || o.stunde !== ziel.stunde) continue;
  // Ein 80 000 Minuten alter Quellwert beschreibt nicht diese Stunde, sondern
  // einen toten Sensor. Der darf die Vergleichsbasis nicht verwaessern.
  const alter = Number(r.alter_min);
  if (Number.isFinite(alter) && (alter < 0 || alter > TOT_MIN)) continue;
  const v = r.auslastung != null ? Number(r.auslastung) : Number(r.wert);
  if (!Number.isFinite(v)) continue;
  (werteJeSensor[r.sensor_id] = werteJeSensor[r.sensor_id] || []).push(v);
}

// Bestehendes Profil je Sensor
const profil = {};
for (const p of profilZeilen) {
  if (p && p.sensor_id) profil[p.sensor_id] = p;
}

const raus = [];
for (const [sid, werte] of Object.entries(werteJeSensor)) {
  if (!werte.length) continue;
  const tageswert = Math.round(median(werte) * 10) / 10;

  const alt = profil[sid];
  let raster = { v: 2, dh: {}, d: [], letzte: {} };
  if (alt && alt.raster) {
    try {
      const g = JSON.parse(alt.raster);
      // v1-Raster (Zelle = eine Zahl) laesst sich nicht fortschreiben — es traegt
      // keine Tagesstruktur. Lieber neu anfangen als Zahlen mischen, die
      // Verschiedenes bedeuten.
      if (g && g.v === 2 && g.dh) {
        raster = { v: 2, dh: g.dh, d: g.d || [], letzte: g.letzte || {} };
      }
    } catch (e) { /* defekt -> neu aufbauen */ }
  }

  const zelle = Array.isArray(raster.dh[zielKey]) ? raster.dh[zielKey] : [];
  if (raster.letzte[zielKey] === ziel.datum && zelle.length) {
    // Nachlauf desselben Tages (etwa nach einem Neustart): ersetzen statt anhaengen,
    // sonst zaehlt ein Tag doppelt und verzerrt den Perzentilrang.
    zelle[zelle.length - 1] = tageswert;
  } else {
    zelle.push(tageswert);
    while (zelle.length > MAX_TAGE) zelle.shift();
  }
  raster.dh[zielKey] = zelle;
  raster.letzte[zielKey] = ziel.datum;

  if (!raster.d.includes(ziel.datum)) {
    raster.d.push(ziel.datum);
    raster.d.sort();
    while (raster.d.length > MAX_DATEN) raster.d.shift();
  }
  raster.stand = ziel.datum;

  raus.push({
    json: {
      sensor_id: sid,
      raster: JSON.stringify(raster),
      n_gesamt: (Number(alt && alt.n_gesamt) || 0) + werte.length,
      basis_tage: raster.d.length,
      erste_beob: (alt && alt.erste_beob) || new Date(zielMs).toISOString(),
      letzte_beob: new Date(zielMs).toISOString(),
      quelle_hist: (alt && alt.quelle_hist) || 'sammler',
    },
  });
}

console.log(`Zielstunde ${ziel.datum} ${ziel.stunde}:00 (Zelle ${zielKey}) — `
  + `${raus.length} Sensoren fortgeschrieben, ${pufferZeilen.length} Pufferzeilen gelesen`);
return raus;
