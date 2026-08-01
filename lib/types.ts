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

export interface Alternative {
  id: string;
  name: string;
  quote: number;
  ampel: Ampel;
  km: number;
  /** Welche Stufe der Leiter gegriffen hat — bestimmt die Begründung im Text */
  stufe: "zugang" | "ziel";
}

/** Wofür ein Parkplatz da ist. Einmalig bestimmt in scripts/ziele_anreichern.py
 *  und in sensors.json eingefroren — zur Laufzeit wird nichts abgeleitet. */
export interface Ziel {
  art: "bergbahn" | "nationalpark" | "wasser" | "wandern" | "anreise" | "ort" | "sonstiges";
  /** Interner Schlüssel für Punkte, die dasselbe Ziel erschliessen */
  einstieg: string | null;
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

  /** Typischer Tagesverlauf, 24 Stundenwerte (null wo keine Beobachtung) */
  tagesgang: (number | null)[] | null;
  /** [ISO-Zeitstempel, Wert] — jüngste zuletzt */
  sparkline: [string, number][];
  /** Leerere Alternative derselben Gruppe, sofern es eine gibt */
  alternative: Alternative | null;
  /** Ruhigere Stunde aus dem typischen Tagesverlauf — Stufe 2 der Leiter */
  spaeter: { stunde: number; anteil: number } | null;
  ziel?: Ziel | null;
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
    gedaempft: number;
    mit_empfehlung: number;
    zeit_tipps: number;
  };
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
