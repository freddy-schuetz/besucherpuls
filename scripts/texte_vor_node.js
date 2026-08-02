// besucherpuls-status, Knoten "Texte vorbereiten"
//
// Sammelt die Empfehlungspaare, fuer die ein Begruendungstext gebraucht wird —
// und filtert alles weg, was ohne Modellaufruf beantwortbar ist.
//
// VIER SICHERUNGEN, ohne die das hier nicht ausgeliefert wuerde:
//
// 1. NUR ZIELE MIT FAKTEN. Ein Modell, dem man "Feuerwehrhaus" hinwirft,
//    erfindet eine Beschreibung. Wer weder Gebietsnamen noch Tour noch Badtyp
//    hat, bekommt den Regelsatz — und keinen KI-Text.
// 2. ZWISCHENSPEICHER. Die Seite pollt im Minutentakt. Ohne Cache waere das
//    ein Modellaufruf pro Aufruf; das Paar (Ziel -> Alternative) aendert sich
//    dagegen selten. Gespeichert wird in der Tabelle besucherpuls_texte.
// 3. OBERGRENZE je Lauf. Falls der Cache leer ist (erster Start, neue Saison),
//    sollen nicht 30 Aufrufe gleichzeitig losgehen.
// 4. Der Text begruendet, WARUM die Alternative passt — nicht, wie voll es ist.
//    Die Zahlen kommen aus der Regel und stehen ohnehin daneben.

const API = '/*__API_BASE__*/';
const API_KEY = '/*__API_KEY__*/';
const TEXTE_TABLE = 'm5wHwkjFrmk0vI7o';
const MAX_JE_LAUF = 6;         // so viele neue Texte hoechstens pro Aufruf
const HALTBAR_STUNDEN = 72;    // danach wird ein Text erneuert

const sammlung = $input.first().json;
const ziele = sammlung.ziele || [];

// --- Zwischenspeicher lesen
let cache = {};
try {
  const a = await this.helpers.httpRequest({
    url: `${API}/data-tables/${TEXTE_TABLE}/rows?limit=250`,
    method: 'GET', json: true, timeout: 15000,
    headers: { 'X-N8N-API-KEY': API_KEY },
  });
  for (const r of (a && a.data) || []) cache[r.schluessel] = r;
} catch (e) {
  console.log('Textcache nicht lesbar: ' + String(e.message || e).slice(0, 120));
}

/** Was wir dem Modell an BELEGTEN Fakten geben koennen. Leer heisst: kein Aufruf. */
function fakten(z) {
  const i = z.info || {};
  const t = i.tour || {};
  const teile = [];
  if (i.gebiet) teile.push(`Gebiet: ${i.gebiet}`);
  if (i.schutzgebiet) teile.push(`Schutzgebiet: ${i.schutzgebiet}`);
  if (i.badtyp) teile.push(`Art: ${i.badtyp}`);
  if (i.ausstattung && i.ausstattung.length) teile.push(`Ausstattung: ${i.ausstattung.join(', ')}`);
  if (i.lage && i.lage.length) teile.push(`Lage: ${i.lage.join(', ')}`);
  if (t.km) {
    const m = [`${t.km} km`];
    if (t.hm) m.push(`${t.hm} Hoehenmeter`);
    if (t.min) m.push(`${Math.round(t.min / 60)} Stunden`);
    if (t.schwierigkeit) m.push(t.schwierigkeit);
    teile.push(`Wanderung ab hier${t.name ? ` (${t.name})` : ''}: ${m.join(', ')}`);
  }
  return teile;
}

const jetzt = Date.now();
const auftraege = [];
const ausCache = {};

for (const z of ziele) {
  const a = z.alternative;
  if (!a) continue;
  const ziel = ziele.find((x) => x.id === a.id);
  if (!ziel) continue;

  const meine = fakten(z);
  const seine = fakten(ziel);
  // Ohne Fakten auf BEIDEN Seiten gibt es nichts zu begruenden, was nicht
  // ohnehin dasteht ("3,5 km entfernt, dort 555 Plaetze frei").
  if (!seine.length) continue;

  const schluessel = `${z.id}>${a.id}`;
  const c = cache[schluessel];
  if (c && c.text && c.stand && (jetzt - Date.parse(c.stand)) / 36e5 < HALTBAR_STUNDEN) {
    ausCache[schluessel] = c.text;
    continue;
  }
  if (auftraege.length >= MAX_JE_LAUF) continue;

  auftraege.push({
    json: {
      schluessel,
      von: z.name,
      nach: ziel.name,
      km: a.km,
      prompt:
        'Du schreibst fuer eine Tourismus-Website. Ein Gast wollte zu einem Ziel, '
        + 'das gerade voll ist, und bekommt eine Alternative vorgeschlagen. '
        + 'Schreibe EINEN Satz auf Deutsch (hoechstens 20 Woerter), warum die '
        + 'Alternative fuer ihn passt.\n\n'
        + 'STRENGE REGELN:\n'
        + '- Verwende AUSSCHLIESSLICH die unten genannten Fakten. Erfinde nichts.\n'
        + '- Keine Auslastungszahlen und keine Entfernungen — die stehen schon daneben.\n'
        + '- Keine Anrede, keine Ausrufezeichen, kein "Tipp:".\n'
        + '- Wenn die Fakten fuer einen sinnvollen Satz nicht reichen, antworte '
        + 'mit dem Wort LEER.\n\n'
        + `Ursprungsziel: ${z.name}\n`
        + (meine.length ? meine.map((f) => '  ' + f).join('\n') + '\n' : '')
        + `Vorgeschlagene Alternative: ${ziel.name}\n`
        + seine.map((f) => '  ' + f).join('\n'),
    },
  });
}

console.log(`Texte: ${Object.keys(ausCache).length} aus dem Speicher, ${auftraege.length} neu`);

// Der Sammlungsknoten dahinter braucht immer ein Item, auch wenn nichts zu tun
// ist — sonst bricht die Kette ab und der Webhook antwortet leer.
if (!auftraege.length) {
  return [{ json: { leerlauf: true, ausCache } }];
}
auftraege[0].json.ausCache = ausCache;
return auftraege;
