export type Ampel =
  | "gruen"
  | "gelb"
  | "rot"
  | "geschlossen"
  | "aufbau"
  | "veraltet"
  | "unbekannt";

export type Quelle =
  | "luzern"
  | "zh_baeder"
  | "st_parken"
  | "st_rad"
  | "gbfs"
  | "wien_baeder"
  | "kiel_gbfs"
  | "bayern";

/** Menge austauschbarer Ziele. Nur innerhalb einer Gruppe wird eine Alternative
 *  empfohlen — ein Parkhaus ersetzt kein Bad. */
export type Gruppe =
  | "allgaeu"
  | "bayerischer-wald"
  | "berchtesgaden"
  | "groeden"
  | "zuerich-baeder"
  | "wien-baeder"
  | "kiel-foerde"
  | "luzern-altstadt"
  | "meran"
  | "suedtirol-rad";

/** Wofür ein Gast hinfährt. Gästesprache, nicht Datenmodell. */
export type Zielart =
  | "bergbahn"
  | "nationalpark"
  | "wandern"
  | "klamm"
  | "see"
  | "rad"
  | "stadt"
  | "ort"
  | "anreise"
  | "sonstiges";

/**
 * Der Status — berechnet an GENAU EINER Stelle, in scripts/status_node.js.
 *
 * Vorher gab es zwei Berechnungen: eine im Workflow, eine hier im Frontend
 * (`gastStatus`). Die Karte sah Wien grün, die Empfehlungslogik sah dieselben
 * Bäder als „ohne Basis" — deshalb konnten Wien und Gröden nie eine Empfehlung
 * bekommen. Dieses Objekt kommt fertig aus dem Workflow und wird hier nur noch
 * gelesen. Es gibt bewusst keine Funktion mehr, die daraus etwas ableitet.
 */
export interface Status {
  ampel: Ampel;
  kurz: string;
  /** Woher die Aussage stammt — steuert die Wortwahl drumherum */
  art: "vergleich" | "kapazitaet" | "keiner";
}

export interface Alternative {
  id: string;
  name: string;
  art: Zielart;
  ampel: Ampel;
  status: Status;
  auslastung: number | null;
  quote: number | null;
  frei_plaetze: number | null;
  kapazitaet: number | null;
  lat: number;
  lon: number;
  km: number;
  stufe: "ziel";
}

/** Ein Zugang zu einem Ziel — Parkplatz, Eingang, Station. */
export interface Zugang {
  id: string;
  name: string;
  ampel: Ampel;
  status: Status;
  auslastung: number | null;
  kapazitaet: number | null;
  lat: number;
  lon: number;
}

/**
 * Ein ZIEL — das Objekt, in dem ein Gast denkt: Nebelhorn, Thumsee, Sellajoch.
 * Die Messpunkte sind seine Zugänge. Erzeugt in scripts/ziele_bauen.py,
 * geprüft eingefroren in lib/ziele.json, zusammengeführt im Workflow.
 */
export interface ZielProps {
  id: string;
  name: string;
  gebiet: Gruppe;
  art: Zielart;
  /** Alle Kategorien, unter denen dieses Ziel zählt — ein Nationalpark-Einstieg
   *  ist AUCH Wandern. Zwei Ziele sind austauschbar, wenn sich diese Mengen
   *  überschneiden. */
  arten: Zielart[];
  /** Gemeinde. Wo die Kategorie „sonstiges" bleibt, steht auf der Kachel sonst
   *  ein Wort, das nichts sagt — der Ortsname ist echte Information. */
  ort: string;
  lat: number;
  lon: number;

  status: Status;
  ampel: Ampel;
  auslastung: number | null;
  quote: number | null;
  /** Rohwert des Hauptzugangs — nur für Quellen ohne Kapazität (Gäste, Stufe) */
  wert: number;

  /** Summen über alle brauchbaren Zugänge, wo Kapazität bekannt ist */
  kapazitaet: number | null;
  belegt: number | null;
  frei_plaetze: number | null;

  einheit: string;
  metrik: string;
  quelle: Quelle;
  quelle_url: string;
  hinweis: string;
  alter_min: number;
  quell_ts: string;
  basis_tage: number;
  vergleich_art: SensorProps["vergleich_art"];
  vergleich_tage: number;
  tagesgang: (number | null)[] | null;
  sparkline: [string, number][];

  /** Der Zugang, dessen Werte das Ziel repräsentieren (der mit dem meisten Platz) */
  haupt_zugang: string;
  zugaenge: Zugang[];

  /** Stufe 1 — gleiches Ziel, anderer Zugang */
  zugang_tipp: { von: string; nach: string; nach_id: string; km: number } | null;
  /** Stufe 2 — gleiches Ziel, andere Zeit */
  spaeter: { stunde: number; anteil: number } | null;
  /** Stufe 3 — vergleichbares Ziel in der Nähe */
  alternative: Alternative | null;
}

export interface SensorProps {
  id: string;
  name: string;
  ort: string;
  land: "CH" | "DE" | "AT" | "IT";
  gruppe: Gruppe | null;
  quelle: Quelle;
  quelle_url: string;
  hinweis: string;
  einheit: string;
  metrik: string;
  kapazitaet: number | null;
  /** Nur Wien: Bezirksnummer — die einzige Ortsangabe, die einem Gast dort hilft */
  bezirk?: string | number | null;

  /** Rohwert der Quelle — Personen, freie Plätze, Räder, Ampelstufe … */
  wert: number;
  /** Nur wo eine Bezugsgrösse existiert (Parkkapazität, Dock-Zahl): Prozent belegt */
  auslastung: number | null;

  /** Median der Vergleichstage — zur Anzeige, nicht mehr zur Berechnung */
  vergleichswert: number | null;
  vergleich_art:
    | "wochentag_stunde"
    | "werktag_stunde"
    | "wochenende_stunde"
    | "stunde"
    | null;
  /** Wie viele Vergleichstage in die Einordnung eingingen */
  vergleich_tage: number;
  /**
   * Perzentilrang 0–100: an wie viel Prozent der vergleichbaren Tage war es
   * LEERER als jetzt. Bewusst kein Quotient mehr — der wurde bei Nachtwerten
   * nahe null vierstellig und färbte alles rot.
   */
  quote: number | null;
  ampel: Ampel;

  alter_min: number;
  frische_grenze_min: number;
  quell_ts: string;

  basis_tage: number;
  basis_n: number;

  /** Fertig berechnet im Workflow — hier wird nur gelesen */
  status: Status;

  /** Typischer Tagesverlauf, 24 Stundenwerte (null wo keine Beobachtung).
   *  Null, wenn die Kurve flach ist — eine gerade Linie ist kein Tagesverlauf. */
  tagesgang: (number | null)[] | null;
  /** [ISO-Zeitstempel, Wert] — jüngste zuletzt */
  sparkline: [string, number][];
  /** Zu welchem Ziel dieser Zugang gehört */
  ziel?: { id: string; name: string; art: Zielart; arten: Zielart[] } | null;
}

export interface StatusAntwort {
  type: "FeatureCollection";
  erzeugt: string;
  vergleichszelle: { wochentag: number; stunde: number };
  zusammenfassung: {
    sensoren: number;
    ziele: number;
    mit_ampel: number;
    veraltet: number;
    im_aufbau: number;
    geschlossen: number;
    gedaempft: number;
    mit_empfehlung: number;
    zeit_tipps: number;
    zugang_tipps: number;
  };
  /** Die Ebene, in der ein Gast denkt */
  ziele: ZielProps[];
  /** Die Messpunkte darunter — für Karte und Herkunftsnachweis */
  features: {
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: SensorProps;
  }[];
}

/** Kartenfarben — identisch zu den Statusfarben aus globals.css, hier als
 *  Literale, weil MapLibre keine CSS-Variablen aufloest. */
export const AMPEL_FARBE: Record<Ampel, string> = {
  gruen: "#0f9d63",
  gelb: "#cf7a1d",
  rot: "#d43f4d",
  geschlossen: "#8d9b94",
  aufbau: "#b9c4be",
  veraltet: "#c3ccc7",
  unbekannt: "#c3ccc7",
};

export const AMPEL_TEXT: Record<Ampel, string> = {
  gruen: "leerer als üblich",
  gelb: "wie üblich",
  rot: "voller als üblich",
  geschlossen: "geschlossen",
  aufbau: "Vergleichsbasis wird aufgebaut",
  veraltet: "Sensor liefert nicht mehr",
  unbekannt: "unbekannt",
};

export const QUELLE_LABEL: Record<Quelle, string> = {
  luzern: "Stadt Luzern",
  zh_baeder: "Stadt Zürich",
  st_parken: "Open Data Hub Südtirol",
  st_rad: "Open Data Hub Südtirol",
  gbfs: "nextbike (GBFS)",
  wien_baeder: "Stadt Wien",
  kiel_gbfs: "SprottenFlotte KielRegion (GBFS)",
  bayern: "BayernCloud Tourismus (CC0)",
};

/** „vor 14 Minuten", „vor 2 Tagen" */
export function alterText(min: number): string {
  if (!Number.isFinite(min) || min < 0) return "unbekannt";
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${Math.round(min)} Min.`;
  if (min < 2880) return `vor ${Math.round(min / 60)} Std.`;
  return `vor ${Math.round(min / 1440)} Tagen`;
}

/** Der Kernsatz: was der Perzentilrang für einen Gast bedeutet. Gilt für
 *  Ziele wie für einzelne Zugänge — beide tragen dieselben drei Felder. */
export function einordnungText(
  p: Pick<SensorProps, "quote" | "ampel" | "vergleich_art">,
): string | null {
  if (p.quote == null || p.ampel === "aufbau" || p.ampel === "veraltet") return null;
  if (p.ampel === "geschlossen")
    return "Zu dieser Zeit war hier noch nie etwas los — vermutlich geschlossen.";
  const bezug =
    p.vergleich_art === "wochentag_stunde"
      ? "vergleichbaren Tage um diese Zeit"
      : p.vergleich_art === "werktag_stunde"
        ? "Werktage um diese Zeit"
        : p.vergleich_art === "wochenende_stunde"
          ? "Wochenendtage um diese Zeit"
          : "Tage um diese Zeit";
  if (p.quote >= 85) return `Voller als an ${p.quote} % der ${bezug}.`;
  if (p.quote <= 40) return `Leerer als an ${100 - p.quote} % der ${bezug}.`;
  return `Etwa so voll wie üblich — voller als an ${p.quote} % der ${bezug}.`;
}
