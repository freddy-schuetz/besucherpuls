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
  | "kiel_gbfs";

/** Menge austauschbarer Ziele. Nur innerhalb einer Gruppe wird eine Alternative
 *  empfohlen — ein Parkhaus ersetzt kein Bad. */
export type Gruppe =
  | "groeden"
  | "zuerich-baeder"
  | "wien-baeder"
  | "kiel-foerde"
  | "luzern-altstadt"
  | "meran"
  | "suedtirol-rad";

export interface Alternative {
  id: string;
  name: string;
  quote: number;
  ampel: Ampel;
  km: number;
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

  /** Typischer Tagesverlauf, 24 Stundenwerte (null wo keine Beobachtung) */
  tagesgang: (number | null)[] | null;
  /** [ISO-Zeitstempel, Wert] — jüngste zuletzt */
  sparkline: [string, number][];
  /** Leerere Alternative derselben Gruppe, sofern es eine gibt */
  alternative: Alternative | null;
}

export interface StatusAntwort {
  type: "FeatureCollection";
  erzeugt: string;
  vergleichszelle: { wochentag: number; stunde: number };
  zusammenfassung: {
    sensoren: number;
    mit_ampel: number;
    veraltet: number;
    im_aufbau: number;
    geschlossen: number;
    mit_empfehlung: number;
  };
  features: {
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: SensorProps;
  }[];
}

export const AMPEL_FARBE: Record<Ampel, string> = {
  gruen: "#16a34a",
  gelb: "#ca8a04",
  rot: "#dc2626",
  geschlossen: "#64748b",
  aufbau: "#0284c7",
  veraltet: "#94a3b8",
  unbekannt: "#94a3b8",
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
};

/** Die drei Schaufenster: gleiche Daten, drei Arten des Ausweichens. */
export interface Schaufenster {
  slug: string;
  titel: string;
  frage: string;
  gruppen: Gruppe[];
  /** Auf welche Karte wird gezoomt */
  mitte: [number, number];
  zoom: number;
  erklaerung: string;
}

export const SCHAUFENSTER: Schaufenster[] = [
  {
    slug: "raum",
    titel: "Ausweichen im Raum",
    frage: "Der eine Wanderparkplatz ist voll — welcher nicht?",
    gruppen: ["groeden"],
    mitte: [11.77, 46.55],
    zoom: 11.2,
    erklaerung:
      "Sieben Parkplätze an den Dolomitenpässen von Gröden. Für einen Gast, " +
      "der wandern will, sind sie echte Alternativen zueinander: gleicher Zweck, " +
      "anderer Ort, wenige Fahrminuten dazwischen.",
  },
  {
    slug: "zeit",
    titel: "Ausweichen in der Zeit",
    frage: "Muss es jetzt sein — oder ist es in zwei Stunden angenehmer?",
    gruppen: ["zuerich-baeder"],
    mitte: [8.539, 47.369],
    zoom: 12.2,
    erklaerung:
      "Zehn Zürcher Bäder mit Zählsensoren an den Zugängen. Hier hilft kein " +
      "Ortswechsel, sondern ein Zeitwechsel — deshalb zeigt dieses Schaufenster " +
      "den typischen Tagesverlauf und wo im Tag man gerade steht.",
  },
  {
    slug: "ziel",
    titel: "Ausweichen im Ziel",
    frage: "Dein Bad ist voll — welches im Nachbarbezirk hat Platz?",
    gruppen: ["wien-baeder"],
    mitte: [16.372, 48.21],
    zoom: 10.6,
    erklaerung:
      "Die Stadt Wien veröffentlicht je Bad eine Auslastungsampel — aber keine " +
      "Alternative. Genau diese Lücke füllt dieses Schaufenster: 33 austauschbare " +
      "Ziele in einer Stadt, jedes mit eigenem Live-Wert.",
  },
];

/** „vor 14 Minuten", „vor 2 Tagen" */
export function alterText(min: number): string {
  if (!Number.isFinite(min) || min < 0) return "unbekannt";
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${Math.round(min)} Min.`;
  if (min < 2880) return `vor ${Math.round(min / 60)} Std.`;
  return `vor ${Math.round(min / 1440)} Tagen`;
}

/** Der Kernsatz: was der Perzentilrang für einen Gast bedeutet. */
export function einordnungText(p: SensorProps): string | null {
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
