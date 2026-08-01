// besucherpuls-collect — holt alle Quellen und normalisiert sie auf eine Zeile je Sensor.
// Laeuft alle 5 Minuten, Ausgabe geht in die Data Table besucherpuls_puffer.
//
// Sieben Quellen, sieben Eigenheiten. Die Kommentare an den Faellen nennen jeweils
// die Falle, die dort schon einmal zugeschnappt ist.

const SENSOREN = /*__SENSOREN__*/[];

const LUZERN_API = 'https://portal.alfons.io/app/devicecounter/api/sensors?api_key=/*__LUZERN_KEY__*/';
const ZH_LIVE = 'https://data.stadt-zuerich.ch/dataset/ssd_spo_badi_aktuell/download/crowd-monitor.csv';
const ODH = 'https://mobility.api.opendatahub.com/v2';
const WIEN_WFS = 'https://data.wien.gv.at/daten/geo?service=WFS&request=GetFeature&version=1.1.0'
  + '&typeName=ogdwien:SCHWIMMBADOGD&srsName=EPSG:4326&outputFormat=json';
const KIEL_GBFS = 'https://stables.donkey.bike/api/public/gbfs/3.0/donkey_kielsmile';

const jetzt = Date.now();
const holen = (url) => this.helpers.httpRequest({
  url, method: 'GET', timeout: 25000, json: false,
  headers: { 'User-Agent': 'besucherpuls/0.1 (+https://friedemann-schuetz.de)' },
});
const alsJson = (t) => (typeof t === 'string' ? JSON.parse(t) : t);
const alterMin = (ms) => Math.round((jetzt - ms) / 60000);

const roh = { luzern: {}, zh_baeder: {}, st_parken: {}, st_rad: {}, gbfs: {}, wien_baeder: {}, kiel_gbfs: {} };
const fehler = [];

// ---------------------------------------------------------------- Luzern
try {
  const d = alsJson(await holen(LUZERN_API));
  for (const it of d.data || []) {
    // ISO_time ist UTC ohne Zeitzonen-Suffix, das zone-Feld sagt "UTC".
    const ms = Date.parse(String(it.ISO_time).replace(' ', 'T') + 'Z');
    roh.luzern[it.nodeid] = { wert: Number(it.counter), ts: ms };
  }
} catch (e) { fehler.push('luzern: ' + String(e.message || e).slice(0, 120)); }

// ---------------------------------------------------------------- Zuerich Baeder
try {
  const txt = String(await holen(ZH_LIVE));
  const zeilen = txt.trim().split(/\r?\n/);
  const kopf = zeilen[0].split(',');
  const iU = kopf.indexOf('uid'), iF = kopf.indexOf('currentfill'), iT = kopf.indexOf('retrievaltime');
  for (const z of zeilen.slice(1)) {
    const f = z.split(',');
    if (f.length <= Math.max(iU, iF, iT)) continue;
    const ms = Date.parse(f[iT].replace(' ', 'T'));
    roh.zh_baeder[f[iU]] = { wert: Number(f[iF]), ts: Number.isFinite(ms) ? ms : jetzt };
  }
} catch (e) { fehler.push('zh_baeder: ' + String(e.message || e).slice(0, 120)); }

// ---------------------------------------------------------------- Suedtirol Parken
try {
  const d = alsJson(await holen(ODH + '/flat,node/ParkingStation/free/latest?limit=-1&select=sname,mvalue,mvalidtime,scode'));
  for (const r of d.data || []) {
    if (!r.mvalidtime) continue;
    const ms = Date.parse(String(r.mvalidtime).replace(' ', 'T').replace('+0000', 'Z'));
    const eintrag = { wert: Number(r.mvalue), ts: ms };
    if (r.scode) roh.st_parken[r.scode] = eintrag;
    if (r.sname) roh.st_parken[r.sname] = eintrag;
  }
} catch (e) { fehler.push('st_parken: ' + String(e.message || e).slice(0, 120)); }

await new Promise((r) => setTimeout(r, 3000)); // ODH antwortet sonst mit 429

// ---------------------------------------------------------------- Suedtirol Rad
try {
  const d = alsJson(await holen(ODH + '/flat,node/BikeCounter/*/latest?limit=-1&select=sname,sorigin,mvalue,mvalidtime'));
  for (const r of d.data || []) {
    const n = r.sname || '';
    if (r.sorigin !== 'Ecocounter' || n.includes('(in)') || n.includes('(out)') || !r.mvalidtime) continue;
    if (roh.st_rad[n]) continue; // erster Datentyp gewinnt, der Feed enthaelt Dubletten
    const ms = Date.parse(String(r.mvalidtime).replace(' ', 'T').replace('+0000', 'Z'));
    roh.st_rad[n] = { wert: Number(r.mvalue), ts: ms };
  }
} catch (e) { fehler.push('st_rad: ' + String(e.message || e).slice(0, 120)); }

// ---------------------------------------------------------------- GBFS Regionalaggregate
for (const sys of ['nextbike_ch', 'nextbike_ur', 'nextbike_eq']) {
  try {
    const d = alsJson(await holen('https://gbfs.nextbike.net/maps/gbfs/v2/' + sys + '/en/station_status.json'));
    const st = (d.data && d.data.stations) || [];
    let raeder = 0, docks = 0;
    for (const s of st) {
      raeder += Number(s.num_bikes_available || 0);
      docks += Number(s.num_docks_available || 0);
    }
    roh.gbfs[sys] = { wert: raeder, docks, ts: Number(d.last_updated) * 1000 };
  } catch (e) { fehler.push(sys + ': ' + String(e.message || e).slice(0, 120)); }
}

// ---------------------------------------------------------------- Wien Baeder
try {
  const d = alsJson(await holen(WIEN_WFS));
  for (const f of d.features || []) {
    const p = f.properties || {};
    const name = String(p.NAME || '').trim();
    const kat = Number(p.AUSLASTUNG_AMPEL_KATEGORIE_0);
    // -99 = das Bad meldet nichts, 0 = geschlossen. Beides ist kein Messwert.
    if (!name || !Number.isFinite(kat) || kat <= 0) continue;
    // TIMESTAMP_MODIFIED_FORMAT kommt als "01.08.2026 21:10" in Wiener Ortszeit.
    // Date.parse versteht das Format nicht — von Hand zerlegen, sonst wird jeder
    // Wert als "ungueltiges Datum" verworfen und Wien bliebe dauerhaft leer.
    let ms = jetzt;
    const m = String(p.TIMESTAMP_MODIFIED_FORMAT || '').match(/(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})/);
    if (m) {
      const kandidat = Date.parse(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00+02:00`);
      if (Number.isFinite(kandidat)) ms = kandidat;
    }
    roh.wien_baeder[name] = { wert: kat, ts: ms };
  }
} catch (e) { fehler.push('wien_baeder: ' + String(e.message || e).slice(0, 120)); }

// ---------------------------------------------------------------- Kieler Foerde
try {
  const d = alsJson(await holen(KIEL_GBFS + '/station_status.json'));
  const st = (d.data && d.data.stations) || [];
  // GBFS 3.0 liefert last_updated als RFC3339-String, 2.x als Unix-Sekunden.
  const oben = Date.parse(String(d.last_updated)) || Number(d.last_updated) * 1000;
  for (const s of st) {
    const id = String(s.station_id);
    // 3.0 heisst num_vehicles_available, 2.x num_bikes_available. Wer nur das
    // zweite liest, misst ueberall 0 und haelt das System faelschlich fuer tot.
    const raeder = Number(s.num_vehicles_available != null
      ? s.num_vehicles_available : s.num_bikes_available || 0);
    const docks = Number(s.num_docks_available || 0);
    // Frische kommt aus dem FEED-Zeitstempel, nicht aus last_reported der Station.
    // last_reported ist der Zeitpunkt der letzten AENDERUNG: an einer ruhigen
    // Station steht der abends schon mal sieben Stunden zurueck, obwohl der Wert
    // topaktuell ist. Wer das als Alter nimmt, faerbt die halbe Foerde grau.
    const eigen = s.last_reported
      ? (Date.parse(String(s.last_reported)) || Number(s.last_reported) * 1000)
      : null;
    roh.kiel_gbfs[id] = {
      wert: raeder, docks,
      ts: Number.isFinite(oben) && oben > 0 ? oben : eigen,
      still_seit: Number.isFinite(eigen) ? Math.round((jetzt - eigen) / 60000) : null,
    };
  }
} catch (e) { fehler.push('kiel_gbfs: ' + String(e.message || e).slice(0, 120)); }

// ---------------------------------------------------------------- normalisieren
const jetztIso = new Date(jetzt).toISOString();
const out = [];
for (const s of SENSOREN) {
  const treffer = roh[s.q] && roh[s.q][s.r];
  if (!treffer || !Number.isFinite(treffer.wert)) continue;

  let auslastung = null;
  if (s.m === 'frei_plaetze' && s.k) {
    auslastung = Math.round(((s.k - treffer.wert) / s.k) * 1000) / 10;      // Prozent belegt
  } else if (s.m === 'fuellgrad') {
    const gesamt = treffer.wert + (treffer.docks || 0);
    auslastung = gesamt ? Math.round((treffer.wert / gesamt) * 1000) / 10 : null;
  } else if (s.m === 'dock_belegung') {
    // Anteil belegter Rueckgabeplaetze. 100 % heisst: hier laesst sich kein Rad
    // abgeben — nicht, dass hier viele Menschen sind.
    const gesamt = treffer.wert + (treffer.docks || 0);
    auslastung = gesamt ? Math.round((treffer.wert / gesamt) * 1000) / 10 : null;
  } else if (s.m === 'ampelstufe') {
    // Stufe 1 (noch Platz) bis 5 (voll) auf 0-100 spreizen.
    auslastung = Math.round(((treffer.wert - 1) / 4) * 1000) / 10;
  }

  out.push({
    json: {
      sensor_id: s.i,
      ts: jetztIso,
      wert: treffer.wert,
      auslastung,
      quell_ts: Number.isFinite(treffer.ts) ? new Date(treffer.ts).toISOString() : jetztIso,
      alter_min: Number.isFinite(treffer.ts) ? alterMin(treffer.ts) : -1,
    },
  });
}

if (fehler.length) console.log('Quellfehler: ' + fehler.join(' | '));
console.log('Sensoren mit Wert: ' + out.length + ' von ' + SENSOREN.length);
return out;
