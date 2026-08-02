// besucherpuls-status, Knoten "Texte einsetzen"
//
// Setzt die Begruendungen in die Sammlung ein und schreibt neue in den
// Zwischenspeicher. Dieser Knoten ist der LETZTE der Kette — was er
// zurueckgibt, ist die Antwort des Webhooks.
//
// Er muss deshalb unter allen Umstaenden die vollstaendige Sammlung liefern.
// Wenn das Modell nicht antwortet, langsam ist oder Unsinn schreibt, faellt
// die Seite auf den Regelsatz zurueck — sichtbar wird davon nichts.

const API = '/*__API_BASE__*/';
const API_KEY = '/*__API_KEY__*/';
const TEXTE_TABLE = 'm5wHwkjFrmk0vI7o';

// Die Sammlung kommt vom Knoten davor — NICHT vom Eingang, denn dazwischen
// liegen die Modellaufrufe, deren Items etwas ganz anderes enthalten.
const sammlung = $('GeoJSON bauen').first().json;
const vor = $('Texte vorbereiten').all();

const texte = {};
// Was schon im Speicher lag
const ausCache = (vor[0] && vor[0].json && vor[0].json.ausCache) || {};
for (const [k, v] of Object.entries(ausCache)) texte[k] = v;

// Was das Modell gerade geliefert hat. Die Reihenfolge der Items bleibt
// erhalten, also passt Auftrag i zu Antwort i.
const antworten = $input.all();
const neu = [];
for (let i = 0; i < vor.length; i++) {
  const auftrag = vor[i] && vor[i].json;
  if (!auftrag || !auftrag.schluessel) continue;
  const a = antworten[i] && antworten[i].json;
  if (!a) continue;

  // Anthropic: content[0].text. Bei Fehler oder Zeitueberschreitung steht hier
  // etwas anderes — dann bleibt es beim Regelsatz.
  let text = '';
  try {
    text = (a.content && a.content[0] && a.content[0].text) || '';
  } catch (e) { text = ''; }
  text = String(text).trim().replace(/^["„]|["“]$/g, '');

  // Die Reissleine aus dem Prompt: Wenn die Fakten nicht reichen, sagt das
  // Modell LEER — und dann wird auch nichts angezeigt.
  if (!text || text.toUpperCase().startsWith('LEER') || text.length > 220) continue;

  texte[auftrag.schluessel] = text;
  neu.push({ schluessel: auftrag.schluessel, text, stand: new Date().toISOString() });
}

// --- Neue Texte in den Zwischenspeicher schreiben (fehlschlagen darf das)
if (neu.length) {
  try {
    await this.helpers.httpRequest({
      url: `${API}/data-tables/${TEXTE_TABLE}/rows`,
      method: 'POST', json: true, timeout: 15000,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
      body: { data: neu },
    });
  } catch (e) {
    console.log('Textcache nicht schreibbar: ' + String(e.message || e).slice(0, 120));
  }
}

// --- Einsetzen
let gesetzt = 0;
for (const z of sammlung.ziele || []) {
  const a = z.alternative;
  if (!a) continue;
  const t = texte[`${z.id}>${a.id}`];
  if (t) { a.begruendung = t; gesetzt++; }
}
sammlung.zusammenfassung.mit_begruendung = gesetzt;
console.log(`Begruendungen gesetzt: ${gesetzt} (davon ${neu.length} neu erzeugt)`);

return [{ json: sammlung }];
