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
  // Beschreibungstext. Der Unterschied ist wichtig: Was ueber das Ziel selbst
  // geschrieben steht, darf das Modell als dessen Eigenschaft nehmen — was ueber
  // die Nachbarschaft geschrieben steht, ausdruecklich nicht.
  if (i.poi && i.poi.text) {
    teile.push((i.poi.eigen ? 'Beschreibung: ' : `In der Naehe (${i.poi.name}): `) + i.poi.text);
  }
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

  // NUR SUBSTANZIELLE FAKTEN GEHEN ANS MODELL.
  //
  // Wo als einziger Fakt "Lage: strand" oder "Gebiet: Puez Gruppe" steht, kann
  // ein Modell nur ausschmuecken — gemessen kam dabei "Am Strand von
  // Kalifornien koennen Sie Kuestenluft und Meeresblick geniessen" heraus.
  // Solche Saetze schreibt die Regel unten besser, ehrlicher und kostenlos.
  // Ein Modellaufruf lohnt erst, wenn es einen Beschreibungstext oder eine
  // Tour gibt — also etwas, das man zusammenfassen KANN.
  const i2 = ziel.info || {};
  const substanziell = !!((i2.poi && i2.poi.text) || (i2.tour && i2.tour.km));
  if (!substanziell) continue;

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
      // WAS DEN GAST DORT ERWARTET — nicht, warum es BESSER ist.
      //
      // Erst stand hier "warum die Alternative fuer ihn passt". Das las das
      // Modell als Frage nach einem UNTERSCHIED und antwortete folgerichtig
      // mit LEER: "Die beiden Ziele haben identische Fakten fuer die
      // Wanderung und unterscheiden sich nur im Namen." Bei zwei Parkplaetzen
      // 700 Meter auseinander stimmt das sogar — nur interessiert es keinen
      // Gast. Er will wissen, was ihn dort erwartet, und das laesst sich auch
      // dann sagen, wenn es am Ausgangsort dasselbe waere.
      prompt:
        'Du schreibst fuer eine Tourismus-Website. Ein Gast wollte zu einem Ziel, '
        + 'das gerade voll ist, und bekommt eine Alternative vorgeschlagen. '
        + 'Schreibe EINEN Satz auf Deutsch (hoechstens 20 Woerter): Was erwartet '
        + 'ihn an der Alternative?\n\n'
        + 'STRENGE REGELN:\n'
        + '- Verwende AUSSCHLIESSLICH die unten genannten Fakten. Erfinde nichts.\n'
        // DAS HIER IST DIE WICHTIGSTE REGEL. Ohne sie fuellt das Modell mit
        // Weltwissen auf: Aus dem einzigen Fakt "Gebiet: Puez Gruppe" wurde
        // "In der Vallunga erwartet Sie ein idyllisches Tal mit beeindruckenden
        // Dolomiten-Felswaenden" — inhaltlich sogar richtig, aber eben NICHT
        // aus unseren Daten. Fuer eine Demo, die mit "alles belegt" wirbt, ist
        // das der teuerste Fehler ueberhaupt.
        + '- KEINE Eigenschaftswoerter, die nicht in den Fakten stehen. Nicht '
        + '"idyllisch", "malerisch", "historisch", "beeindruckend", "gemuetlich", '
        + 'wenn das dort nicht woertlich steht.\n'
        + '- Kein Wissen von aussen. Wenn du den Ort kennst, ignoriere das.\n'
        + '- Wenn als Fakt nur ein Gebietsname dasteht, nenne ihn schlicht '
        + '("Liegt in der Puez Gruppe.") — mehr nicht.\n'
        + '- Es geht NICHT um einen Vergleich. Auch wenn beide Orte dasselbe '
        + 'bieten, beschreibe einfach die Alternative.\n'
        + '- Was unter "In der Naehe" steht, gehoert NICHT zum Ziel selbst. '
        + 'Nenne es nur als Umgebung ("in der Naehe liegt ..."), niemals als '
        + 'dessen Eigenschaft.\n'
        + '- Keine Auslastungszahlen und keine Entfernungen — die stehen schon daneben.\n'
        + '- Keine Anrede, keine Ausrufezeichen, kein "Tipp:".\n'
        + '- Antworte NUR mit dem Satz, ohne Erklaerung dazu.\n'
        + '- Nur wenn unten ueberhaupt keine Fakten stehen, antworte mit LEER.\n\n'
        + `Die Alternative heisst: ${ziel.name}\n`
        + seine.map((f) => '  ' + f).join('\n')
        + (meine.length
            ? `\n\n(Zum Zusammenhang, NICHT beschreiben: Der Gast wollte urspruenglich zu ${z.name}.)`
            : ''),
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
