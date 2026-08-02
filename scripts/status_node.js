// besucherpuls-status — baut aus Profil (Vergleichsbasis) und Puffer (Live + Verlauf)
// eine GeoJSON-FeatureCollection fuer die Karte.
//
// EINORDNUNG: Perzentilrang statt Quotient.
// Frueher wurde wert/median gerechnet. Bei Baedern ist der Median einer Nachtstunde
// 0 oder 0,5 — ein realer Tageswert ergab dann Quoten wie 93 200 %, und praktisch
// jeder Sensor stand auf Rot. Jetzt wird gefragt: an wie viel Prozent der
// vergleichbaren Tage war es LEERER als jetzt? Das Ergebnis liegt bauartbedingt
// zwischen 0 und 100 und ist gegen Nullmediane immun.
//
// VERGLEICHSBASIS: Das Profil fuehrt je Zelle (Wochentag x Stunde) eine Liste von
// TAGESWERTEN. Die Zahl der Eintraege ist die Zahl der beobachteten Tage. Weil
// eine einzelne Zelle erst nach Wochen genug Tage sammelt, gibt es eine Leiter:
// Wochentag+Stunde -> Werktag/Wochenende+Stunde -> Stunde. Was nicht traegt,
// wird als "im Aufbau" ausgewiesen statt geraten.

const SENSOREN = /*__SENSOREN__*/[];

// ZIELEBENE. Ein Gast denkt nicht in Parkplaetzen, sondern in Zielen: Nebelhorn,
// Thumsee, Sellajoch. Die Messpunkte sind ZUGAENGE zu diesen Zielen, nicht das
// Objekt selbst. Solange die Seite Parkplaetze zeigte und Parkplaetze vorschlug,
// war jede Empfehlung eine Zufallsinfo. Die Zuordnung steht geprueft in
// lib/ziele.json (erzeugt von scripts/ziele_bauen.py) — nicht zur Laufzeit geraten.
const ZIELE = /*__ZIELE__*/[];
const zielVonSensor = {};
for (const z of ZIELE) {
  for (const sid of z.zugaenge || []) zielVonSensor[sid] = z;
}

const AMPEL_GRUEN = 60;    // Perzentilrang darunter
const AMPEL_ROT = 85;      // darueber
const MIN_TAGE_ZELLE = 3;  // Wochentag+Stunde erst ab so vielen Tagen
const MIN_TAGE_POOL = 5;   // gepoolte Stufen erst ab so vielen Tagen
// Absolute Schwellen. Wo die Kapazitaet bekannt ist, sind sie das Primaere:
// "0 von 140 frei" ist voll, egal wie normal das fuer die Uhrzeit sein mag,
// und "57 von 175 frei" ist es nicht, egal wie ungewoehnlich.
const VOLL_AB = 92;        // ab hier: voll
const ENG_AB = 75;         // ab hier: wird eng
const FREI_BIS = 70;       // nur so leere Ziele taugen als Empfehlung
// Unterhalb dieser Belegung darf der historische Vergleich die Ampel NICHT
// faerben. Sonst entstehen Saetze wie "Gut besucht" bei 43 von 50 freien
// Plaetzen — und, seit auch gelb lenkt, Empfehlungen WEG von einem fast leeren
// Parkplatz. Details in statusVon().
const VERGLEICH_AB = 40;
// Ab hier wird ueberhaupt gelenkt. Die Ampel darf frueher gelb werden — "gut
// besucht" ist eine Information. Ein Ortswechsel ist es nicht: Bei 41 % Belegung
// stehen an der Mittagbahn 175 von 300 Plaetzen frei, und die Seite schickte
// Gaeste 6 km weg, weil der Perzentilrang hoch war. Unterhalb dieser Grenze
// bleibt es bei der Auskunft.
const LENKEN_AB = 60;
// So viel leerer muss eine Alternative mindestens sein, damit der Umweg lohnt.
// Ohne diese Grenze entstanden Empfehlungen wie "Weissbach 12 % -> Ried 16,7 %"
// (der Kandidat ist VOLLER) oder "Meilingen 1,1 % -> Berg Hansmarte 2,5 %"
// (von leer nach leer).
const MIN_ABSTAND = 15;
const MAX_SPARK = 12;      // Punkte je Sensor (Fenster ist 30 min, siehe deploy_status.py)

// Frischeschwelle je Quelle — eine pauschale Grenze waere falsch: die Suedtiroler
// Radzaehler liefern regulaer mit rund einem Tag Verzug, GBFS im Minutentakt.
//
// ZUERICH stand erst auf 240 Minuten (der eingefrorene Schlusswert galt nach
// Betriebsende stundenlang als aktuell), dann auf 45. Beides war falsch:
// Gemessen laesst die Stadt zwischen zwei Veroeffentlichungen 94 Minuten
// 46 Sekunden verstreichen — mittags an einem sonnigen Sonntag, nicht nachts.
// Bei 45 Minuten stand Zuerich rund die HAELFTE jedes Zyklus auf grau, obwohl
// nichts kaputt war. 120 Minuten decken den gemessenen Rhythmus mit Reserve.
const VERALTET_MIN = {
  luzern: 180, zh_baeder: 120, st_parken: 60, st_rad: 2880,
  gbfs: 30, wien_baeder: 2880, kiel_gbfs: 30, bayern: 180,
};

// ---------------------------------------------------------------- Tabellen lesen
// NICHT ueber den Data-Table-Knoten. Der ist zum Lesen nachweislich kaputt: bei
// einer Tabelle mit 1141 Zeilen gab er 2500 Items aus — er wiederholt die erste
// Seite, bis das Limit erreicht ist. Folge waren immer dieselben AELTESTEN Zeilen,
// drei Tage alte Werte als "aktuell" und komplett fehlende neue Quellen. Weder
// sortBy noch Filter aendern daran etwas (alles gemessen, nicht vermutet).
// Deshalb hier direkt die oeffentliche API mit echtem Cursor-Blaettern.
const API = '/*__API_BASE__*/';
const API_KEY = '/*__API_KEY__*/';

async function tabelle(id, maxZeilen) {
  const raus = [];
  let cursor = null;
  for (let seite = 0; seite < 40; seite++) {
    let u = `${API}/data-tables/${id}/rows?limit=250`;   // 250 ist das Maximum der API
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
console.log(`gelesen: ${profilZeilen.length} Profilzeilen, ${pufferZeilen.length} Pufferzeilen`);

// ---------------------------------------------------------------- Profil lesen
const profil = {};
for (const p of profilZeilen) {
  if (!p || !p.sensor_id) continue;
  let r = null;
  try { r = JSON.parse(p.raster || '{}'); } catch (e) { r = null; }
  // v1 (Zelle = eine Zahl) traegt die neue Rechnung nicht. Lieber ehrlich
  // "im Aufbau" zeigen als eine Zahl ausgeben, die anders gemeint war.
  const dh = r && r.v === 2 && r.dh ? r.dh : null;
  profil[p.sensor_id] = {
    dh,
    basis_tage: Number(p.basis_tage) || 0,
    n: Number(p.n_gesamt) || 0,
  };
}

// ---------------------------------------------------------------- Puffer lesen
// NICHT auf die Sortierung des Data-Table-Knotens verlassen: dessen sortBy-Option
// wirkte bei grossem Limit nicht, der Knoten lieferte die AELTESTEN Zeilen. Ergebnis
// waren drei Tage alte Werte, die als aktuell durchgingen. Deshalb wird hier selbst
// sortiert — das kostet nichts und kann nicht still danebengehen.
const nachSensor = {};
for (const r of pufferZeilen) {
  if (!r || !r.sensor_id || !r.ts) continue;
  (nachSensor[r.sensor_id] = nachSensor[r.sensor_id] || []).push(r);
}
const aktuell = {};
const verlauf = {};
for (const [sid, zeilen] of Object.entries(nachSensor)) {
  zeilen.sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));   // neueste zuerst
  aktuell[sid] = zeilen[0];
  verlauf[sid] = zeilen;
}

const jetzt = new Date();
const lokal = new Date(jetzt.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }));
const stunde = lokal.getHours();
const dow = (lokal.getDay() + 6) % 7;   // Mo=0, wie Python weekday()
const istWochenende = dow >= 5;

// ---------------------------------------------------------------- Hilfsfunktionen
function poolen(dh, stunden, tage) {
  const raus = [];
  for (const d of tage) {
    for (const h of stunden) {
      const zelle = dh[d + '_' + h];
      if (Array.isArray(zelle)) raus.push(...zelle);
    }
  }
  return raus;
}

/** Anteil der Vergleichstage, an denen es LEERER war als jetzt (0-100).
 *  Gleichstaende zaehlen halb — sonst bekaeme ein Wert, der exakt dem
 *  haeufigsten entspricht, je nach Rundung 0 oder 100. */
function perzentilrang(werte, x) {
  let kleiner = 0, gleich = 0;
  for (const v of werte) {
    if (v < x) kleiner++;
    else if (v === x) gleich++;
  }
  return Math.round(((kleiner + gleich / 2) / werte.length) * 100);
}

/** Vergleichsmenge fuer die aktuelle Stunde — mit absteigender Genauigkeit. */
function vergleichsmenge(dh) {
  if (!dh) return null;
  const genau = dh[dow + '_' + stunde];
  if (Array.isArray(genau) && genau.length >= MIN_TAGE_ZELLE) {
    return { werte: genau, art: 'wochentag_stunde', tage: genau.length };
  }
  const teil = istWochenende ? [5, 6] : [0, 1, 2, 3, 4];
  const wt = poolen(dh, [stunde], teil);
  if (wt.length >= MIN_TAGE_POOL) {
    return {
      werte: wt,
      art: istWochenende ? 'wochenende_stunde' : 'werktag_stunde',
      tage: wt.length,
    };
  }
  const alle = poolen(dh, [stunde], [0, 1, 2, 3, 4, 5, 6]);
  if (alle.length >= MIN_TAGE_POOL) {
    return { werte: alle, art: 'stunde', tage: alle.length };
  }
  return null;
}

/**
 * DIE EINZIGE STATUSBERECHNUNG.
 *
 * Vorher gab es zwei: diese hier und eine zweite im Frontend. Die Karte sah Wien
 * gruen, die Empfehlungslogik sah dieselben Baeder als "ohne Basis" — deshalb
 * konnten Wien und Groeden NIE eine Empfehlung bekommen. Jetzt entscheidet nur
 * noch diese Funktion; das Frontend liest ihr Ergebnis, und der Tagesverlauf
 * benutzt sie ein zweites Mal je Stunde.
 */
function statusVon({ istVeraltet, referenzArt, auslastung, quote, geschlossen }) {
  // Der Betreiber sagt selbst, dass zu ist — das schlaegt jede Rechnung.
  // Wien meldet Stufe 0 fuer geschlossene Baeder; die fielen frueher komplett
  // aus der Seite heraus, statt als "geschlossen" dazustehen.
  if (geschlossen) return { ampel: 'geschlossen', kurz: 'Heute geschlossen', art: 'keiner' };
  if (istVeraltet) return { ampel: 'veraltet', kurz: 'Keine aktuellen Daten', art: 'keiner' };
  // "Geschlossen" nur, wo Schliessen ueberhaupt ein Begriff ist — Baeder,
  // Bergbahnen. Ein Skiparkplatz, der im Sommer auf 0 steht, ist nicht
  // geschlossen, sondern leer; dafuer ist unten die Kapazitaetsregel zustaendig.
  if (referenzArt === 'geschlossen' && auslastung == null) {
    return { ampel: 'geschlossen', kurz: 'Geschlossen', art: 'keiner' };
  }

  // 1. Absolute Auslastung, wo sie bekannt ist. "0 von 140 frei" ist voll,
  //    egal wie normal das fuer die Uhrzeit sein mag.
  if (auslastung != null) {
    if (auslastung >= VOLL_AB) return { ampel: 'rot', kurz: 'Voll', art: 'kapazitaet' };
    if (auslastung >= ENG_AB) return { ampel: 'gelb', kurz: 'Wird eng', art: 'kapazitaet' };

    // 2. Der Vergleich darf verfeinern — aber erst, wenn absolut ueberhaupt
    //    etwas los ist. Weissbach Bahnhof stand auf "Gut besucht" bei 43 von 50
    //    FREIEN Plaetzen, weil der Perzentilrang 96 war; der Nachbarplatz mit
    //    51 % Belegung stand daneben auf "Viel Platz". Gleich voll, gegenteiliges
    //    Label — und der halbvolle Platz gruener als der zu 14 % belegte.
    //    Unterhalb dieser Grenze zaehlt deshalb nur die Kapazitaet.
    if (quote != null && auslastung >= VERGLEICH_AB) {
      if (quote > AMPEL_ROT) return { ampel: 'gelb', kurz: 'Gut besucht', art: 'vergleich' };
      if (quote < AMPEL_GRUEN) return { ampel: 'gruen', kurz: 'Viel Platz', art: 'vergleich' };
      return { ampel: 'gruen', kurz: 'Platz da', art: 'vergleich' };
    }
    return { ampel: 'gruen', kurz: 'Viel Platz', art: 'kapazitaet' };
  }

  // 3. Ohne Kapazitaet bleibt nur der Vergleich — Luzern, Radzaehler, Baeder
  //    ohne Bezugsgroesse. Dort ist er die einzige Grundlage, die es gibt.
  if (quote != null) {
    if (quote > AMPEL_ROT) return { ampel: 'rot', kurz: 'Voller als sonst', art: 'vergleich' };
    if (quote < AMPEL_GRUEN) return { ampel: 'gruen', kurz: 'Leerer als sonst', art: 'vergleich' };
    return { ampel: 'gelb', kurz: 'Wie üblich', art: 'vergleich' };
  }
  return { ampel: 'aufbau', kurz: 'Noch ohne Vergleich', art: 'keiner' };
}

/** Typischer Tagesverlauf: je Stunde der Median aller beobachteten Tage.
 *  Das ist der Inhalt fuer das Schaufenster "Ausweichen in der Zeit". */
function tagesgang(dh) {
  if (!dh) return null;
  const kurve = [];
  let getroffen = 0;
  for (let h = 0; h < 24; h++) {
    const teil = istWochenende ? [5, 6] : [0, 1, 2, 3, 4];
    let w = poolen(dh, [h], teil);
    if (w.length < 2) w = poolen(dh, [h], [0, 1, 2, 3, 4, 5, 6]);
    if (!w.length) { kurve.push(null); continue; }
    const s = [...w].sort((a, b) => a - b);
    const m = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    kurve.push(Math.round(m * 10) / 10);
    getroffen++;
  }
  if (getroffen < 6) return null;
  // Eine flache Linie ist kein Tagesverlauf. 23 der 55 bayerischen Reihen sind
  // Skiparkplaetze, die im Sommer durchgehend auf 0 stehen — ehrliche Nullen,
  // aber als "So laeuft ein typischer Tag hier" wertlos. Erst ab spuerbarem
  // Unterschied zwischen ruhigster und vollster Stunde wird die Kurve gezeigt.
  const echt = kurve.filter((v) => v != null);
  if (Math.max(...echt) - Math.min(...echt) < 5) return null;
  return kurve;
}

/**
 * Derselbe Status, aber fuer jede Stunde des typischen Tages.
 *
 * Der Gast waehlt oben "Heute Nachmittag" — dann muss die Ampel auch den
 * Nachmittag meinen. Bisher sortierte die Liste nach dem 15-Uhr-Wert, waehrend
 * Kachel, Karte und Ansage weiter den Jetzt-Zustand zeigten: Ein Ziel konnte
 * unter "Nachmittag" ganz oben stehen und rot leuchten.
 *
 * Es ist bewusst DIESELBE Funktion wie fuer den Jetzt-Wert. Eine zweite waere
 * eine zweite Wahrheit, und genau daran ist die Demo schon einmal gescheitert.
 *
 * Nur wo die Kurve Prozent bedeutet. Bei Zuerich, Luzern und den Radzaehlern
 * sind es Personen bzw. Raeder — eine absolute Schwelle waere dort erfunden,
 * deshalb bleibt es null und das Frontend sagt nur "typischerweise am vollsten".
 */
function tagesgangStatus(kurve, istProzent) {
  if (!Array.isArray(kurve) || !istProzent) return null;
  return kurve.map((v) => (v == null
    ? null
    : statusVon({ istVeraltet: false, referenzArt: null, auslastung: v, quote: null })));
}

// ---------------------------------------------------------------- Features bauen
const features = [];
let mitAmpel = 0, veraltet = 0, ohneBasis = 0, geschlossen = 0, gedaempft = 0;

for (const s of SENSOREN) {
  const a = aktuell[s.id];
  if (!a) continue;

  const alterMin = Number(a.alter_min);
  const grenze = VERALTET_MIN[s.quelle] || 180;
  const istVeraltet = !Number.isFinite(alterMin) || alterMin < 0 || alterMin > grenze;

  const p = profil[s.id];
  const vgl = p ? vergleichsmenge(p.dh) : null;

  // Bei Parkplaetzen wird die Auslastung verglichen, sonst der Rohwert.
  const istWert = a.auslastung != null ? Number(a.auslastung) : Number(a.wert);

  let quote = null, referenz = null, referenzArt = null, tage = 0;
  // AUF 0-100 BEGRENZEN. Das Nationalparkzentrum Falkenstein meldete -0,5 % —
  // also 198 freie von 197 Plaetzen. Auf der Kachel stand "198 von 197 Plaetzen
  // frei", was offensichtlich Unsinn ist. Ein Geber, der mehr Freies meldet als
  // er hat, wird hier auf "leer" gekappt statt weitergereicht; erfunden wird
  // dabei nichts, denn leerer als leer gibt es nicht.
  const auslastung = a.auslastung != null
    ? Math.min(100, Math.max(0, Number(a.auslastung)))
    : null;

  if (vgl) {
    referenzArt = vgl.art;
    tage = vgl.tage;
    const sortiert = [...vgl.werte].sort((x, y) => x - y);
    referenz = sortiert.length % 2
      ? sortiert[(sortiert.length - 1) / 2]
      : (sortiert[sortiert.length / 2 - 1] + sortiert[sortiert.length / 2]) / 2;
    // Wo in dieser Stunde an KEINEM Vergleichstag je etwas los war, ist der
    // Perzentilrang bedeutungslos — das ist geschlossen, nicht leer.
    if (sortiert[sortiert.length - 1] > 0) quote = perzentilrang(vgl.werte, istWert);
    else if (istWert === 0) referenzArt = 'geschlossen';
  }

  // Wien: Stufe 0 heisst geschlossen (siehe collect_node.js).
  const meldetZu = s.metrik === 'ampelstufe' && Number(a.wert) === 0;
  const st = statusVon({ istVeraltet, referenzArt, auslastung, quote, geschlossen: meldetZu });
  const kurve = p ? tagesgang(p.dh) : null;

  const ampel = st.ampel;
  if (ampel === 'veraltet') veraltet++;
  else if (ampel === 'geschlossen') geschlossen++;
  else if (ampel === 'aufbau') ohneBasis++;
  else mitAmpel++;

  // Verlauf: aelteste zuerst, bei Bedarf gleichmaessig ausduennen
  let v = (verlauf[s.id] || []).slice(0, MAX_SPARK * 3).reverse();
  if (v.length > MAX_SPARK) {
    const schritt = v.length / MAX_SPARK;
    const d = [];
    for (let i = 0; i < MAX_SPARK; i++) d.push(v[Math.floor(i * schritt)]);
    v = d;
  }
  const sparkline = v.map((r) => [r.ts, r.auslastung != null ? Number(r.auslastung) : Number(r.wert)]);

  features.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
    properties: {
      id: s.id, name: s.name, ort: s.ort, land: s.land, gruppe: s.gruppe || null,
      // Zu welchem Ziel dieser Zugang gehoert. Frueher stand hier eine aus dem
      // Namen geratene Art — auf Deutsch, weshalb Groeden zu 100 % "sonstiges"
      // war und der Bayerische Wald keine Kategorie "Wandern" hatte.
      ziel: (() => {
        const z = zielVonSensor[s.id];
        return z ? { id: z.id, name: z.name, art: z.art, arten: z.arten || [z.art] } : null;
      })(),
      quelle: s.quelle, quelle_url: s.quelle_url, hinweis: s.hinweis,
      einheit: s.einheit, metrik: s.metrik, kapazitaet: s.kapazitaet,
      wert: Number(a.wert),
      // Die GEKAPPTE Auslastung — nicht der Rohwert. Sonst rechnet der Status
      // mit 0 % und die Kachel zeigt trotzdem "198 von 197 Plaetzen frei".
      auslastung,
      vergleichswert: referenz,
      vergleich_art: referenzArt,
      vergleich_tage: tage,
      quote, ampel,
      status: st,
      alter_min: alterMin,
      frische_grenze_min: grenze,
      quell_ts: a.quell_ts,
      basis_tage: p ? p.basis_tage : 0,
      basis_n: p ? p.n : 0,
      tagesgang: kurve,
      tagesgang_status: tagesgangStatus(kurve, auslastung != null),
      sparkline,
    },
  });
}

// ---------------------------------------------------------------- Empfehlung
function entfernungKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10;
}

// Wie weit ein Umweg je Zielart zumutbar ist. Fuer einen Berg faehrt man eine
// Viertelstunde weiter; zu einem ERSATZ-BAHNHOF nicht. Ohne diese Unterscheidung
// schlug die Seite 14,4 km zum naechsten Bahnhof vor.
const MAX_KM = {
  bergbahn: 15, wandern: 15, nationalpark: 15, klamm: 15,
  see: 12, rad: 5, ort: 4, stadt: 3, anreise: 4, sonstiges: 3,
  // Die Badtypen MUESSEN hier stehen. Seit sie eigene Kategorien sind, greift
  // sonst der Rueckfall auf 3 km — und Wien haette schlagartig fast keine
  // Empfehlungen mehr, weil die Baeder ueber die Stadt verteilt sind.
  hallenbad: 12, freibad: 12, sommerbad: 12, kombibad: 12,
  familienbad: 12, strandbad: 12, flussbad: 12, seebad: 12,
};

/** Wie voll es hier ist, 0-100 — je kleiner, desto mehr Platz. Wo die Kapazitaet
 *  bekannt ist, zaehlt sie; sonst der Perzentilrang. */
function fuellung(p) {
  if (p.auslastung != null) return Number(p.auslastung);
  if (p.quote != null) return Number(p.quote);
  return null;
}

/**
 * Hat hier ein Gast wirklich Platz?
 *
 * Frueher stand hier `ampel === 'gruen'`. Das klang nach "eine Wahrheit", war
 * aber der teuerste Fehler der Demo: Plan de Gralba in Groeden ist zu 12,3 %
 * belegt und hat 351 freie Plaetze — steht aber auf gelb, weil sein
 * Perzentilrang 86 statt 85 betraegt. Damit war GANZ Groeden dauerhaft
 * empfehlungstot, obwohl 2,6 km entfernt ein fast leerer Parkplatz liegt.
 *
 * Die Vergleichsregel darf die Kapazitaetsregel nicht ueberstimmen. Wo die
 * Kapazitaet bekannt ist, entscheidet sie hier allein.
 */
function hatPlatz(p) {
  if (p.ampel === 'veraltet' || p.ampel === 'geschlossen' || p.ampel === 'aufbau') return false;
  if (p.auslastung != null) return Number(p.auslastung) <= FREI_BIS;
  return p.quote != null && p.quote < 50;
}

/** Fuer den Zugangstipp genuegt weniger. Es geht nicht um einen Umweg, sondern
 *  um die andere Seite DESSELBEN Ziels: Wenn die Nebelhorn-Talstation zu 100 %
 *  voll ist und Oybele 19 von 215 Plaetzen frei hat, ist das die nuetzlichste
 *  Auskunft ueberhaupt — auch wenn 19 Plaetze fuer eine Umleitung ueber
 *  Kilometer zu wenig waeren. */
function nochWasFrei(p) {
  if (p.ampel === 'veraltet' || p.ampel === 'geschlossen') return false;
  if (p.auslastung != null) return Number(p.auslastung) < VOLL_AB;
  return p.ampel !== 'rot';
}

/** Die naechste besuchbare Stunde, in der es spuerbar ruhiger ist.
 *  `ab` ist der Bezugspunkt — normalerweise jetzt, aber das Frontend rechnet
 *  damit auch fuer eine gewaehlte Stunde neu. Deshalb nimmt die Funktion die
 *  Stunde als Parameter statt aus dem Modul-Zustand. */
function spaeterAls(kurve, ab) {
  if (!Array.isArray(kurve)) return null;
  const start = ab == null ? stunde : ab;
  const jetztWert = kurve[start];
  const hoechst = Math.max(...kurve.filter((v) => v != null), 0);
  if (jetztWert == null || hoechst <= 0 || jetztWert < hoechst * 0.25) return null;
  let beste = null;
  for (let i = 1; i <= 6; i++) {
    const h = (start + i) % 24;
    const v = kurve[h];
    if (v == null || h < 7 || h > 20) continue;
    if (v < jetztWert * 0.7 && (beste === null || v < kurve[beste])) beste = h;
  }
  return beste === null
    ? null
    : { stunde: beste, anteil: Math.round((1 - kurve[beste] / jetztWert) * 100) };
}

// ------------------------------------------------------------- Ziele bauen
const featureVon = {};
for (const f of features) featureVon[f.properties.id] = f;

const ziele = [];
for (const z of ZIELE) {
  const zug = (z.zugaenge || []).map((id) => featureVon[id]).filter(Boolean);
  if (!zug.length) continue;

  const brauchbar = zug.filter(
    (f) => f.properties.ampel !== 'veraltet' && f.properties.ampel !== 'geschlossen');
  // Der Zugang mit dem meisten Platz bestimmt, wie es am Ziel aussieht: Wer
  // hinfaehrt, stellt sich dorthin, wo noch etwas frei ist — nicht auf den
  // vollsten Platz. Genau das war die Alpsee-Frage: P1 voll, P4 mit 57 frei.
  const sortiert = [...brauchbar].sort(
    (a, b) => (fuellung(a.properties) ?? 999) - (fuellung(b.properties) ?? 999));
  const bester = sortiert[0] || zug[0];
  const bp = bester.properties;

  let kapazitaet = null, belegt = null;
  for (const f of brauchbar) {
    const k = Number(f.properties.kapazitaet);
    if (!Number.isFinite(k) || k <= 0 || f.properties.auslastung == null) continue;
    kapazitaet = (kapazitaet || 0) + k;
    belegt = (belegt || 0) + Math.round((Number(f.properties.auslastung) / 100) * k);
  }

  const voll = zug.filter((f) => f.properties.ampel === 'rot');
  const frei = brauchbar.filter((f) => nochWasFrei(f.properties));

  ziele.push({
    id: z.id, name: z.name, gebiet: z.gebiet,
    art: z.art, arten: z.arten || [z.art],
    ort: z.ort || bp.ort || '',
    // Zusatzinfos aus scripts/anreichern.py — Gebietsname, Tour, Badtyp, Lage.
    // Zur Bauzeit erhoben und geprueft eingefroren; zur Laufzeit wird nichts
    // nachgeschlagen. Ein Ziel ohne Fakten bekommt hier ein leeres Objekt und
    // die Oberflaeche schweigt dazu, statt etwas zu behaupten.
    info: z.info || {},
    ortsziel: !!z.ortsziel,
    lat: z.lat, lon: z.lon,
    status: bp.status,
    ampel: bp.ampel,
    auslastung: bp.auslastung,
    quote: bp.quote,
    wert: bp.wert,
    kapazitaet, belegt,
    // Nie mehr frei als vorhanden und nie weniger als null — siehe oben.
    frei_plaetze: kapazitaet != null
      ? Math.min(kapazitaet, Math.max(0, kapazitaet - belegt))
      : null,
    einheit: bp.einheit, metrik: bp.metrik,
    quelle: bp.quelle, quelle_url: bp.quelle_url, hinweis: bp.hinweis,
    alter_min: bp.alter_min, quell_ts: bp.quell_ts,
    basis_tage: bp.basis_tage,
    vergleich_art: bp.vergleich_art, vergleich_tage: bp.vergleich_tage,
    tagesgang: bp.tagesgang,
    tagesgang_status: bp.tagesgang_status,
    sparkline: bp.sparkline,
    haupt_zugang: bp.id,
    zugaenge: zug.map((f) => ({
      id: f.properties.id, name: f.properties.name,
      ampel: f.properties.ampel, status: f.properties.status,
      auslastung: f.properties.auslastung, kapazitaet: f.properties.kapazitaet,
      lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0],
    })),
    // STUFE 1 — gleiches Ziel, anderer Zugang. Der beste Rat ueberhaupt, weil er
    // niemanden umleitet: Es ist derselbe Ort, nur die andere Seite.
    zugang_tipp: (voll.length && frei.length && zug.length > 1)
      ? {
          von: voll[0].properties.name,
          nach: frei[0].properties.name,
          nach_id: frei[0].properties.id,
          km: entfernungKm(voll[0].geometry.coordinates, frei[0].geometry.coordinates),
        }
      : null,
    spaeter: null,
    alternative: null,

    // ZWEI ABSICHTEN BEI LEIHRAEDERN.
    //
    // `auslastung` ist bei Kiel der Anteil belegter RUECKGABEPLAETZE: 100 %
    // heisst "hier laesst sich kein Rad abgeben". Fuer jemanden, der ein Rad
    // LEIHEN will, ist die Aussage genau umgekehrt — und sie fehlte. Live
    // standen sieben von dreissig Stationen auf gruen "Viel Platz" und hatten
    // NULL Raeder; die einzige Empfehlung, die Kiel erzeugte, fuehrte zu einer
    // davon. Wer leihen wollte, fuhr ins Leere.
    //
    // Beide Werte stecken in derselben Zahl (sie ergaenzen sich zu 100), es
    // braucht also weder eine neue Spalte noch einen zweiten Abruf.
    leihen: bp.metrik === 'dock_belegung' && bp.auslastung != null
      ? (() => {
          const fuellung_leihen = Math.round((100 - Number(bp.auslastung)) * 10) / 10;
          return {
            auslastung: fuellung_leihen,
            raeder: Math.round(Number(bp.wert)),
            status: statusVon({
              istVeraltet: bp.ampel === 'veraltet',
              referenzArt: null, auslastung: fuellung_leihen, quote: null,
            }),
            alternative: null,
          };
        })()
      : null,
  });
}

// ------------------------------------------------------- Lenken: die Stufenleiter
// AB WANN GELENKT WIRD. Frueher nur bei 'rot'. Das klang vorsichtig, war aber
// eine Nullaussage: Von 173 Zielen bekamen VIER eine Empfehlung. Nebelhorn mit
// 25 freien von 415 Plaetzen bekam keine, weil es bei 91,6 % lag und die
// Schwelle fuer rot bei 92 steht — zwei Stellplaetze von 415 trennten "kein
// Rat" von "voller Lenkung". Wer 'wird eng' sieht, will wissen, wohin sonst.
let mitEmpfehlung = 0, zeitTipps = 0, zugangTipps = 0;
for (const z of ziele) if (z.zugang_tipp) zugangTipps++;

/** Wie voll es fuer die gewaehlte ABSICHT ist. Fuer "zurueckgeben" ist das der
 *  gespeicherte Wert, fuer "leihen" sein Gegenstueck. */
function fuellungFuer(z, leihen) {
  if (leihen && z.leihen) return z.leihen.auslastung;
  return fuellung(z);
}

function ampelFuer(z, leihen) {
  if (leihen && z.leihen) return z.leihen.status.ampel;
  return z.ampel;
}

/** Die Stufenleiter, einmal je Absicht. */
function lenken(leihen) {
  for (const z of ziele) {
    // Der Leih-Durchgang betrifft nur Ziele, die ueberhaupt zwei Absichten
    // kennen — sonst gaebe es kein Feld, in das das Ergebnis gehoert.
    if (leihen && !z.leihen) continue;
    const meineAmpel = ampelFuer(z, leihen);
    const meine = fuellungFuer(z, leihen);
    if (meineAmpel !== 'rot' && !(meineAmpel === 'gelb' && (meine ?? 0) >= LENKEN_AB)) continue;

    // STUFE 2 — anderer Zeitpunkt. Kein Ortswechsel noetig, also vor dem
    // Umleiten. Nur im normalen Durchgang: Ein Leihrad-Bestand folgt keinem
    // Tagesverlauf, den man vorhersagen koennte.
    if (!leihen) {
      z.spaeter = spaeterAls(z.tagesgang);
      if (z.spaeter) zeitTipps++;
    }

    const kandidaten = ziele
      .filter((o) => {
        if (o.id === z.id || o.gebiet !== z.gebiet) return false;
        if (!(o.arten || []).some((a) => (z.arten || []).includes(a))) return false;
        if (o.ampel === 'veraltet' || o.ampel === 'geschlossen' || o.ampel === 'aufbau') return false;
        const seine = fuellungFuer(o, leihen);
        return seine != null && seine <= FREI_BIS;
      })
      .map((o) => ({ z: o, km: entfernungKm([z.lon, z.lat], [o.lon, o.lat]) }))
      .filter((x) => x.km <= (MAX_KM[z.art] || 3))
      .filter((x) => {
        const seine = fuellungFuer(x.z, leihen);
        return meine == null || seine == null || meine - seine >= MIN_ABSTAND;
      });
    if (!kandidaten.length) continue;

    // NAEHE SCHLAEGT LEERE — deutlich.
    //
    // Die Formel hiess "Fuellung + km x 10": zehn Prozentpunkte leerer wogen
    // einen Kilometer auf. Damit gewann bei der Passhoehe Mittelalpe die
    // Scheuen Alpe (2,8 km, voellig leer) gegen Obermaiselstein-Grasgehren
    // (0,7 km, knapp die Haelfte frei) — rechnerisch richtig, als Rat falsch.
    // Wer 335 freie Plaetze in 700 Metern haben kann, faehrt nicht 2,8 km.
    //
    // Jetzt entspricht ein Kilometer Umweg 50 Prozentpunkten. Damit entscheidet
    // die Entfernung, solange der Kandidat ueberhaupt genug Platz hat — und das
    // stellt `hatPlatz` schon sicher (hoechstens 70 % belegt).
    const guete = (x) => x.km + (fuellungFuer(x.z, leihen) ?? 50) / 50;
    kandidaten.sort((x, y) => guete(x) - guete(y));
    const b = kandidaten[0];
    const eintrag = {
      id: b.z.id, name: b.z.name, art: b.z.art,
      ampel: ampelFuer(b.z, leihen),
      status: leihen && b.z.leihen ? b.z.leihen.status : b.z.status,
      auslastung: fuellungFuer(b.z, leihen),
      quote: b.z.quote,
      raeder: leihen && b.z.leihen ? b.z.leihen.raeder : null,
      frei_plaetze: b.z.frei_plaetze, kapazitaet: b.z.kapazitaet,
      lat: b.z.lat, lon: b.z.lon, km: b.km, stufe: 'ziel',
    };
    if (leihen) z.leihen.alternative = eintrag;
    else { z.alternative = eintrag; mitEmpfehlung++; }
  }
}

// BEIDE Absichten ueber DIESELBE Funktion.
//
// Hier stand bis eben eine zweite Schleife mit derselben Logik und einer
// eigenen Gueteformel — `lenken(false)` wurde nie aufgerufen. Genau der
// Fehler, der die Demo schon einmal gekostet hat: zwei Wahrheiten
// nebeneinander, von denen nur eine gepflegt wird. Folge war, dass die
// verbesserte Gewichtung "Naehe vor Leere" wirkungslos blieb und die
// Passhoehe Mittelalpe weiter 2,8 km weit geschickt hat, obwohl 700 m
// entfernt 335 Plaetze frei waren.
lenken(true);
lenken(false);

return [{
  json: {
    type: 'FeatureCollection',
    erzeugt: jetzt.toISOString(),
    vergleichszelle: { wochentag: dow, stunde },
    zusammenfassung: {
      sensoren: features.length,
      ziele: ziele.length,
      mit_ampel: mitAmpel,
      veraltet,
      im_aufbau: ohneBasis,
      geschlossen,
      gedaempft,
      mit_empfehlung: mitEmpfehlung,
      zeit_tipps: zeitTipps,
      zugang_tipps: zugangTipps,
    },
    ziele,
    features,
  },
}];
