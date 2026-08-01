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
  return getroffen >= 6 ? kurve : null;
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

  let quote = null, ampel = 'unbekannt', referenz = null, referenzArt = null, tage = 0;

  if (istVeraltet) {
    ampel = 'veraltet';
    veraltet++;
  } else if (!vgl) {
    ampel = 'aufbau';
    ohneBasis++;
  } else {
    referenzArt = vgl.art;
    tage = vgl.tage;
    const sortiert = [...vgl.werte].sort((x, y) => x - y);
    referenz = sortiert.length % 2
      ? sortiert[(sortiert.length - 1) / 2]
      : (sortiert[sortiert.length / 2 - 1] + sortiert[sortiert.length / 2]) / 2;

    if (sortiert[sortiert.length - 1] === 0) {
      // In dieser Stunde war an KEINEM Vergleichstag je etwas los. Das ist kein
      // "leer", das ist geschlossen — und es zu unterscheiden ist der Punkt.
      ampel = istWert > 0 ? 'gelb' : 'geschlossen';
      if (ampel === 'geschlossen') geschlossen++; else mitAmpel++;
      quote = istWert > 0 ? 100 : null;
    } else {
      quote = perzentilrang(vgl.werte, istWert);

      // WIE VOLL ES IST, schlaegt WIE UNGEWOEHNLICH VOLL ES IST.
      //
      // Vorher entschied allein der Perzentilrang. Das erzeugte zwei
      // Widersprueche, die beide auf der Seite standen:
      //   - Alpsee P1 mit 0 von 140 freien Plaetzen galt als normal (gruen),
      //     weil er um diese Zeit immer voll ist.
      //   - Freibad P4 mit 57 von 175 freien Plaetzen galt als voll (rot),
      //     weil das fuer diese Stunde ungewoehnlich viel war.
      // Ergebnis: Die Seite schickte Gaeste von P4 mit 57 freien Plaetzen zu
      // P1 mit null freien Plaetzen. Wo die Kapazitaet bekannt ist, entscheidet
      // deshalb zuerst sie; der Vergleich verfeinert nur noch dazwischen.
      const auslastung = a.auslastung != null ? Number(a.auslastung) : null;
      if (auslastung != null) {
        if (auslastung >= VOLL_AB) {
          ampel = 'rot';                       // wirklich voll
        } else if (auslastung >= ENG_AB) {
          ampel = 'gelb';                      // wird eng
        } else if (quote > AMPEL_ROT) {
          ampel = 'gelb';                      // ungewoehnlich viel los, aber Platz
          gedaempft++;
        } else {
          ampel = quote < AMPEL_GRUEN ? 'gruen' : 'gelb';
        }
      } else {
        // Ohne Kapazitaet bleibt nur der Vergleich — Luzern, Radzaehler.
        ampel = quote < AMPEL_GRUEN ? 'gruen' : quote > AMPEL_ROT ? 'rot' : 'gelb';
      }
      mitAmpel++;
    }
  }

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
      // Ohne dieses Feld fiel die Stufenleiter still auf 'sonstiges' zurueck —
      // die Empfehlungen sahen richtig aus, kamen aber nur aus der Notregel.
      ziel: s.ziel || null,
      quelle: s.quelle, quelle_url: s.quelle_url, hinweis: s.hinweis,
      einheit: s.einheit, metrik: s.metrik, kapazitaet: s.kapazitaet,
      wert: Number(a.wert),
      auslastung: a.auslastung != null ? Number(a.auslastung) : null,
      vergleichswert: referenz,
      vergleich_art: referenzArt,
      vergleich_tage: tage,
      quote, ampel,
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
// Der eigentliche Schritt von "ist voll" zu "geh dorthin": zu jedem stark
// ausgelasteten Punkt die leerste Alternative DERSELBEN Gruppe suchen. Ohne
// Gruppe keine Empfehlung — ein Parkhaus ersetzt kein Bad.
const nachGruppe = {};
for (const f of features) {
  const g = f.properties.gruppe;
  if (!g) continue;
  (nachGruppe[g] = nachGruppe[g] || []).push(f);
}

function entfernungKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10;
}

// Welche Zielarten duerfen einander ersetzen. Ein Wandereinstieg ersetzt einen
// anderen Wandereinstieg oder eine Talstation — aber niemals einen Bahnhof.
const TAUSCHBAR = {
  bergbahn: ['bergbahn', 'wandern'],
  wandern: ['wandern', 'bergbahn', 'nationalpark'],
  nationalpark: ['nationalpark', 'wandern'],
  wasser: ['wasser'],
  anreise: ['anreise'],
  ort: ['ort'],
  sonstiges: [],
};
// Wie weit ein Umweg je Zielart zumutbar ist. Fuer ein Ausflugsziel faehrt man
// eine Viertelstunde weiter; zu einem ERSATZ-BAHNHOF nicht. Ohne diese
// Unterscheidung schlug die Seite 14,4 km zum naechsten Bahnhof vor.
const MAX_KM = {
  bergbahn: 15, wandern: 15, nationalpark: 15, wasser: 12,
  anreise: 4, ort: 4, sonstiges: 3,
};
const MAX_KM_NAH = 3;      // ohne bekannte Zielart nur der direkte Nachbarort
const MIN_ABSTAND = 20;    // so viel leerer muss die Alternative wenigstens sein

let mitEmpfehlung = 0, zeitTipps = 0;

for (const f of features) {
  const p = f.properties;
  p.alternative = null;
  p.spaeter = null;

  // Nur bei echter Fuelle lenken. Alles darunter ist Information, kein Rat.
  if (p.ampel !== 'rot') continue;

  // Eine Alternative muss TATSAECHLICH Platz haben. Vorher genuegte ein
  // niedrigerer Perzentilrang — dadurch wurde Alpsee P1 mit null freien
  // Plaetzen als Ziel vorgeschlagen, weil er "normal voll" war.
  const geschwister = (nachGruppe[p.gruppe] || [])
    .filter((x) => x.properties.id !== p.id)
    .map((x) => ({
      f: x,
      p: x.properties,
      km: entfernungKm(f.geometry.coordinates, x.geometry.coordinates),
    }))
    .filter((x) => {
      if (x.p.ampel === 'veraltet' || x.p.ampel === 'geschlossen') return false;
      const frei = x.p.auslastung != null ? Number(x.p.auslastung) : null;
      if (frei != null) return frei <= FREI_BIS;            // absolut noch Platz
      return x.p.quote != null && x.p.quote < 50;           // ohne Kapazitaet: deutlich leerer
    });

  const meineArt = (p.ziel && p.ziel.art) || 'sonstiges';
  const meinEinstieg = p.ziel && p.ziel.einstieg;

  // STUFE 1 — gleiches Ziel, anderer Zugang. Selten (nur 11 Einstiege haben
  // ueberhaupt mehrere Zugaenge), dafuer nie falsch: Es ist derselbe Ort.
  let treffer = meinEinstieg
    ? geschwister.filter((x) => x.p.ziel && x.p.ziel.einstieg === meinEinstieg)
    : [];
  let stufe = treffer.length ? 'zugang' : null;

  // STUFE 2 — anderer Zeitpunkt. Aus dem typischen Tagesverlauf: die naechste
  // besuchbare Stunde, in der es spuerbar ruhiger ist. Kein Ortswechsel noetig.
  if (!treffer.length && Array.isArray(p.tagesgang)) {
    const jetztWert = p.tagesgang[stunde];
    const hoechst = Math.max(...p.tagesgang.filter((v) => v != null), 0);
    if (jetztWert != null && hoechst > 0 && jetztWert >= hoechst * 0.25) {
      let beste = null;
      for (let i = 1; i <= 6; i++) {
        const h = (stunde + i) % 24;
        const v = p.tagesgang[h];
        if (v == null || h < 7 || h > 20) continue;
        if (v < jetztWert * 0.7 && (beste === null || v < p.tagesgang[beste])) beste = h;
      }
      if (beste !== null) {
        p.spaeter = {
          stunde: beste,
          anteil: Math.round((1 - p.tagesgang[beste] / jetztWert) * 100),
        };
        zeitTipps++;
      }
    }
  }

  // STUFE 3 — vergleichbares Ziel. Gleiche oder verwandte Zielart im Umkreis.
  // Wo die Zielart unbekannt ist, gilt nur der enge Umkreis — sonst waere es
  // wieder "irgendwas in der Naehe", und genau das schickte Gaeste vom Bahnhof
  // Oberstaufen 12,6 km zum Alpsee.
  if (!treffer.length) {
    const erlaubt = TAUSCHBAR[meineArt] || [];
    treffer = geschwister.filter((x) => {
      const art = (x.p.ziel && x.p.ziel.art) || 'sonstiges';
      if (meineArt === 'sonstiges' || art === 'sonstiges') return x.km <= MAX_KM_NAH;
      return erlaubt.includes(art) && x.km <= (MAX_KM[meineArt] || MAX_KM_NAH);
    });
    if (treffer.length) stufe = 'ziel';
  }

  if (!treffer.length) continue;

  // Naehe schlaegt Leere: zehn Prozentpunkte leerer wiegen einen Kilometer auf.
  // Sortiert wird nach der ABSOLUTEN Belegung, wo sie bekannt ist — der Gast
  // will freie Plaetze, keinen guenstigen Rang.
  const guete = (x) => (x.p.auslastung != null ? Number(x.p.auslastung) : (x.p.quote ?? 50));
  treffer.sort((x, y) => (guete(x) + x.km * 10) - (guete(y) + y.km * 10));
  const b = treffer[0];
  p.alternative = {
    id: b.p.id,
    name: b.p.name,
    quote: b.p.quote,
    ampel: b.p.ampel,
    km: b.km,
    stufe,
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
      mit_ampel: mitAmpel,
      veraltet,
      im_aufbau: ohneBasis,
      geschlossen,
      gedaempft,
      mit_empfehlung: mitEmpfehlung,
      zeit_tipps: zeitTipps,
    },
    features,
  },
}];
