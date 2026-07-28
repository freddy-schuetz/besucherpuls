export type Ampel = "gruen" | "gelb" | "rot" | "aufbau" | "veraltet" | "unbekannt";

export type Quelle = "luzern" | "zh_baeder" | "st_parken" | "st_rad" | "gbfs";

export interface SensorProps {
  id: string;
  name: string;
  ort: string;
  land: "CH" | "DE" | "AT" | "IT";
  quelle: Quelle;
  quelle_url: string;
  hinweis: string;
  einheit: string;
  metrik: string;
  kapazitaet: number | null;

  /** Rohwert der Quelle — Personen, freie Plätze, Räder … */
  wert: number;
  /** Nur wo eine Bezugsgrösse existiert (Parkkapazität, Dock-Zahl): Prozent belegt */
  auslastung: number | null;

  /** Typischer Wert für diese Zelle aus der Historie */
  vergleichswert: number | null;
  vergleich_art: "wochentag_stunde" | "stunde" | null;
  /** Ist-Wert in Prozent des typischen Werts. 100 = wie immer. */
  quote: number | null;
  ampel: Ampel;

  alter_min: number;
  frische_grenze_min: number;
  quell_ts: string;

  basis_tage: number;
  basis_n: number;

  /** [ISO-Zeitstempel, Wert] — jüngste zuletzt */
  sparkline: [string, number][];
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
  aufbau: "#0284c7",
  veraltet: "#94a3b8",
  unbekannt: "#94a3b8",
};

export const AMPEL_TEXT: Record<Ampel, string> = {
  gruen: "ruhiger als üblich",
  gelb: "wie üblich",
  rot: "voller als üblich",
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
};

/** „vor 14 Minuten", „vor 2 Tagen" */
export function alterText(min: number): string {
  if (!Number.isFinite(min) || min < 0) return "unbekannt";
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${Math.round(min)} Min.`;
  if (min < 2880) return `vor ${Math.round(min / 60)} Std.`;
  return `vor ${Math.round(min / 1440)} Tagen`;
}
