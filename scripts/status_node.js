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
const MAX_SPARK = 12;      // Punkte je Sensor (Fenster ist 30 min, siehe deploy_status.py)

// Frischeschwelle je Quelle — eine pauschale Grenze waere falsch: die Suedtiroler
// Radzaehler liefern regulaer mit rund einem Tag Verzug, GBFS im Minutentakt.
// Zuerich stand auf 240 Minuten — dadurch galt der eingefrorene Schlusswert
// nach Betriebsende noch stundenlang als aktuell (Seebad Utoquai zeigte um
// 0:10 noch 156 Gaeste, Zeitstempel 23:40). Der Feed aktualisiert im Betrieb
// etwa alle zehn Minuten; 45 Minuten trennen Betrieb und Stillstand sauber.
const VERALTET_MIN = {
  luzern: 180, zh_baeder: 45, st_parken: 60, st_rad: 2880,
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
  const auslastung = a.auslastung != null ? Number(a.auslastung) : null;

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

  // DIE EINZIGE STATUSBERECHNUNG.
  // Vorher gab es zwei: diese hier und eine zweite im Frontend. Die Karte sah
  // Wien gruen, die Empfehlungslogik sah dieselben Baeder als "ohne Basis" —
  // deshalb konnten Wien und Groeden NIE eine Empfehlung bekommen. Jetzt
  // entscheidet nur noch diese Funktion, das Frontend liest ihr Ergebnis.
  const st = (() => {
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
      // 2. Genug Platz — jetzt darf der Vergleich verfeinern, aber nicht ueberstimmen.
      if (quote != null) {
        if (quote > AMPEL_ROT) return { ampel: 'gelb', kurz: 'Gut besucht', art: 'vergleich' };
        if (quote < AMPEL_GRUEN) return { ampel: 'gruen', kurz: 'Viel Platz', art: 'vergleich' };
        return { ampel: 'gruen', kurz: 'Platz da', art: 'vergleich' };
      }
      return { ampel: 'gruen', kurz: 'Viel Platz', art: 'kapazitaet' };
    }

    // 3. Ohne Kapazitaet bleibt nur der Vergleich — Luzern, Radzaehler.
    if (quote != null) {
      if (quote > AMPEL_ROT) return { ampel: 'rot', kurz: 'Voller als sonst', art: 'vergleich' };
      if (quote < AMPEL_GRUEN) return { ampel: 'gruen', kurz: 'Leerer als sonst', art: 'vergleich' };
      return { ampel: 'gelb', kurz: 'Wie üblich', art: 'vergleich' };
    }
    return { ampel: 'aufbau', kurz: 'Noch ohne Vergleich', art: 'keiner' };
  })();

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
      auslastung: a.auslastung != null ? Number(a.auslastung) : null,
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
      tagesgang: p ? tagesgang(p.dh) : null,
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
};

/** Wie voll es hier ist, 0-100 — je kleiner, desto mehr Platz. Wo die Kapazitaet
 *  bekannt ist, zaehlt sie; sonst der Perzentilrang. */
function fuellung(p) {
  if (p.auslastung != null) return Number(p.auslastung);
  if (p.quote != null) return Number(p.quote);
  return null;
}

/** Hat hier ein Gast wirklich Platz? Die Antwort kommt aus der EINEN
 *  Statusfunktion — gruen heisst gruen. Eine eigene Schwelle stuende sonst
 *  neben ihr und koennte von ihr abdriften; genau das war der Fehler, den die
 *  Trennung Workflow/Frontend erzeugt hat. Wo die Kapazitaet bekannt ist,
 *  kommt eine strengere Bedingung dazu: gruen reicht bis 75 %, hinschicken
 *  wollen wir aber nur, wo wirklich noch Luft ist. */
function hatPlatz(p) {
  if (p.ampel !== 'gruen') return false;
  if (p.auslastung != null) return Number(p.auslastung) <= FREI_BIS;
  return true;
}

/** Die naechste besuchbare Stunde, in der es spuerbar ruhiger ist. */
function spaeterAls(kurve) {
  if (!Array.isArray(kurve)) return null;
  const jetztWert = kurve[stunde];
  const hoechst = Math.max(...kurve.filter((v) => v != null), 0);
  if (jetztWert == null || hoechst <= 0 || jetztWert < hoechst * 0.25) return null;
  let beste = null;
  for (let i = 1; i <= 6; i++) {
    const h = (stunde + i) % 24;
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
  const frei = brauchbar.filter((f) => hatPlatz(f.properties));

  ziele.push({
    id: z.id, name: z.name, gebiet: z.gebiet,
    art: z.art, arten: z.arten || [z.art],
    ort: z.ort || bp.ort || '',
    lat: z.lat, lon: z.lon,
    status: bp.status,
    ampel: bp.ampel,
    auslastung: bp.auslastung,
    quote: bp.quote,
    wert: bp.wert,
    kapazitaet, belegt,
    frei_plaetze: kapazitaet != null ? kapazitaet - belegt : null,
    einheit: bp.einheit, metrik: bp.metrik,
    quelle: bp.quelle, quelle_url: bp.quelle_url, hinweis: bp.hinweis,
    alter_min: bp.alter_min, quell_ts: bp.quell_ts,
    basis_tage: bp.basis_tage,
    vergleich_art: bp.vergleich_art, vergleich_tage: bp.vergleich_tage,
    tagesgang: bp.tagesgang,
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
  });
}

// ------------------------------------------------------- Lenken: die Stufenleiter
// Nur bei echter Fuelle lenken. Alles darunter ist Information, kein Rat.
let mitEmpfehlung = 0, zeitTipps = 0, zugangTipps = 0;
for (const z of ziele) if (z.zugang_tipp) zugangTipps++;

for (const z of ziele) {
  if (z.ampel !== 'rot') continue;

  // STUFE 2 — anderer Zeitpunkt. Kein Ortswechsel noetig, also vor dem Umleiten.
  z.spaeter = spaeterAls(z.tagesgang);
  if (z.spaeter) zeitTipps++;

  // STUFE 3 — vergleichbares Ziel. Zwei Ziele sind tauschbar, wenn sich ihre
  // Kategorien ueberschneiden: Ein Nationalpark-Einstieg zaehlt AUCH als Wandern,
  // ein Bahnhof niemals als Badesee. Das steckt in `arten`, nicht in einer
  // deutschen Stichwortliste — deshalb funktioniert es auch in Groeden.
  const kandidaten = ziele
    .filter((o) => o.id !== z.id
      && o.gebiet === z.gebiet
      && (o.arten || []).some((a) => (z.arten || []).includes(a))
      && hatPlatz(o))
    .map((o) => ({ z: o, km: entfernungKm([z.lon, z.lat], [o.lon, o.lat]) }))
    .filter((x) => x.km <= (MAX_KM[z.art] || 3));

  if (!kandidaten.length) continue;

  // Naehe schlaegt Leere: zehn Prozentpunkte leerer wiegen einen Kilometer auf.
  const guete = (x) => (fuellung(x.z) ?? 50) + x.km * 10;
  kandidaten.sort((x, y) => guete(x) - guete(y));
  const b = kandidaten[0];
  z.alternative = {
    id: b.z.id, name: b.z.name, art: b.z.art,
    ampel: b.z.ampel, status: b.z.status,
    auslastung: b.z.auslastung, quote: b.z.quote,
    frei_plaetze: b.z.frei_plaetze, kapazitaet: b.z.kapazitaet,
    lat: b.z.lat, lon: b.z.lon,
    km: b.km,
    stufe: 'ziel',
  };
  mitEmpfehlung++;
}

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
