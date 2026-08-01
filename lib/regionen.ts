import type { Ampel, Gruppe, SensorProps } from "./types";

/**
 * Die Regionen in GASTSPRACHE.
 *
 * Vorher hiessen die Ansichten "Ausweichen im Raum / in der Zeit / im Ziel".
 * Das beschreibt den Mechanismus dahinter — kein Gast sucht danach, und keine
 * Destination wuerde es so auf ihre Seite stellen. Ein Gast fragt: "Wo krieg
 * ich heute noch einen Parkplatz?" Genau das steht jetzt da.
 */
export interface Region {
  slug: string;
  /** Wie die Destination heisst */
  name: string;
  land: string;
  /** Was man dort tut — steht als Kicker ueber dem Titel */
  aktivitaet: string;
  /** Die Frage des Gastes. Ist die Ueberschrift der Seite. */
  frage: string;
  /** Ein Satz, was die Seite konkret leistet */
  versprechen: string;
  /** Wie ein einzelner Messpunkt heisst: "Parkplatz", "Bad", "Station" */
  ziel: string;
  zielPlural: string;
  gruppe: Gruppe;
  mitte: [number, number];
  zoom: number;
  /** Akzentfarbe und die beiden Toene des Kopf-Farbfelds */
  akzent: string;
  tonA: string;
  tonB: string;
  quelle: string;
  quelleUrl: string;
}

export const REGIONEN: Region[] = [
  {
    slug: "groeden",
    name: "Gröden",
    land: "Südtirol",
    aktivitaet: "Wandern & Bergbahnen",
    frage: "Wo ist heute noch Parkplatz?",
    versprechen:
      "Die Wanderparkplätze an den Dolomitenpässen, live. Wenn einer voll ist, steht hier, welcher in wenigen Minuten Fahrt noch Platz hat.",
    ziel: "Parkplatz",
    zielPlural: "Parkplätze",
    gruppe: "groeden",
    mitte: [11.77, 46.55],
    zoom: 11.2,
    akzent: "#0f766e",
    tonA: "#a7e3d6",
    tonB: "#cfe8b8",
    quelle: "Open Data Hub Südtirol",
    quelleUrl: "https://mobility.api.opendatahub.com",
  },
  {
    slug: "zuerich",
    name: "Zürich",
    land: "Schweiz",
    aktivitaet: "Baden am See & an der Limmat",
    frage: "Wann ist es im Bad am schönsten?",
    versprechen:
      "Zürichs See-, Fluss- und Freibäder zählen ihre Gäste an den Zugängen. Neben dem Jetzt-Wert zeigt jede Karte den typischen Tagesverlauf — und damit die entspannteste Stunde.",
    ziel: "Bad",
    zielPlural: "Bäder",
    gruppe: "zuerich-baeder",
    mitte: [8.539, 47.369],
    zoom: 12.2,
    akzent: "#0369a1",
    tonA: "#b9dcf5",
    tonB: "#cfe3f0",
    quelle: "Stadt Zürich (CC0)",
    quelleUrl: "https://data.stadt-zuerich.ch/dataset/ssd_spo_badi_aktuell",
  },
  {
    slug: "wien",
    name: "Wien",
    land: "Österreich",
    aktivitaet: "Städtische Bäder",
    frage: "Welches Bad hat gerade Platz?",
    versprechen:
      "Die städtischen Bäder melden ihre Auslastung selbst. Ist deines voll, nennt diese Seite die nächsten mit Platz — das tut die Stadt bisher nicht.",
    ziel: "Bad",
    zielPlural: "Bäder",
    gruppe: "wien-baeder",
    mitte: [16.372, 48.21],
    zoom: 10.6,
    akzent: "#b45309",
    tonA: "#fbdcae",
    tonB: "#f6cfc4",
    quelle: "Stadt Wien",
    quelleUrl: "https://www.data.gv.at/katalog/dataset/stadt-wien_schwimmbderwien",
  },
  {
    slug: "kieler-foerde",
    name: "Kieler Förde",
    land: "Ostsee",
    aktivitaet: "Leihräder an der Küste",
    frage: "Wo kannst du dein Rad abgeben?",
    versprechen:
      "Die Stationen der SprottenFlotte zwischen Laboe, Schönberg und Eckernförde. Volle Station heisst: hier passt kein Rad mehr rein — die nächste freie steht daneben.",
    ziel: "Station",
    zielPlural: "Stationen",
    gruppe: "kiel-foerde",
    mitte: [10.21, 54.38],
    zoom: 10.2,
    akzent: "#0e7490",
    tonA: "#b6e3ea",
    tonB: "#c9dff0",
    quelle: "SprottenFlotte KielRegion (CC0)",
    quelleUrl: "https://stables.donkey.bike/api/public/gbfs/3.0/donkey_kielsmile/gbfs.json",
  },
];

export function regionFinden(slug: string): Region | undefined {
  return REGIONEN.find((r) => r.slug === slug);
}

/**
 * Der Status, den ein Gast sieht — zweistufig.
 *
 * Die historische Einordnung („voller als sonst") ist die wertvollere Aussage,
 * braucht aber Vergleichstage. Solange die fehlen, wäre „noch ohne Vergleich"
 * die einzige Auskunft — und das ist Unsinn, wenn die Quelle selbst schon sagt,
 * dass ein Bad voll ist oder nur noch drei von 340 Plätzen frei sind.
 *
 * Also: Vergleich, wenn vorhanden. Sonst die absolute Auslastung, sprachlich
 * klar getrennt („fast voll" statt „voller als sonst").
 */
export interface GastStatus {
  ampel: Ampel;
  kurz: string;
  farbe: string;
  feld: string;
  /** Woher die Aussage stammt — steuert die Wortwahl im Umfeld */
  art: "vergleich" | "kapazitaet" | "keiner";
}

function ausAmpel(a: Ampel, kurz: string, art: GastStatus["art"]): GastStatus {
  return { ampel: a, kurz, farbe: STATUS_GAST[a].farbe, feld: STATUS_GAST[a].feld, art };
}

/** Was die gemeldete Auslastung für sich genommen sagt — ohne jeden Vergleich. */
function ausKapazitaet(p: SensorProps): GastStatus | null {
  if (p.metrik === "ampelstufe") {
    const stufe = Math.round(p.wert);
    if (stufe <= 1) return ausAmpel("gruen", "Noch Platz", "kapazitaet");
    if (stufe <= 3) return ausAmpel("gelb", "Wird knapp", "kapazitaet");
    if (stufe === 4) return ausAmpel("gelb", "Fast voll", "kapazitaet");
    return ausAmpel("rot", "Derzeit voll", "kapazitaet");
  }
  if ((p.metrik === "frei_plaetze" || p.metrik === "dock_belegung") && p.auslastung != null) {
    if (p.auslastung < 70) return ausAmpel("gruen", "Viel Platz", "kapazitaet");
    if (p.auslastung < 90) return ausAmpel("gelb", "Wird knapp", "kapazitaet");
    return ausAmpel("rot", "Fast voll", "kapazitaet");
  }
  return null;
}

export function gastStatus(p: SensorProps): GastStatus {
  if (p.ampel === "veraltet" || p.ampel === "geschlossen") {
    return ausAmpel(p.ampel, STATUS_GAST[p.ampel].kurz, "keiner");
  }

  const kap = ausKapazitaet(p);

  // Historischer Vergleich — die eigentliche Leistung, aber nicht um jeden Preis.
  if (p.quote != null && (p.ampel === "gruen" || p.ampel === "gelb" || p.ampel === "rot")) {
    // Eine relative Aussage darf einer absoluten nicht widersprechen. „Viel Platz"
    // bei 0 von 500 freien Plätzen ist für einen Gast falsch, auch wenn der Wert
    // historisch normal ist — genau so verhält sich ein steckengebliebener Sensor,
    // der immer dasselbe meldet. Wo beide sich widersprechen, gilt das Absolute.
    if (kap && kap.ampel === "rot" && p.ampel !== "rot") return kap;
    if (kap && kap.ampel === "gruen" && p.ampel === "rot" && (p.auslastung ?? 100) < 40) {
      return ausAmpel("gelb", "Voller als sonst, aber Platz", "vergleich");
    }
    return ausAmpel(p.ampel, STATUS_GAST[p.ampel].kurz, "vergleich");
  }

  // Ohne Vergleich trägt die gemeldete Auslastung ab der ersten Minute.
  if (kap) return kap;

  return ausAmpel("aufbau", STATUS_GAST.aufbau.kurz, "keiner");
}

/** Wie ein Status heisst, wenn ein Gast ihn liest. */
export const STATUS_GAST: Record<Ampel, { kurz: string; farbe: string; feld: string }> = {
  gruen: { kurz: "Viel Platz", farbe: "var(--color-frei)", feld: "var(--color-frei-weich)" },
  gelb: { kurz: "Normal viel los", farbe: "var(--color-mittel)", feld: "var(--color-mittel-weich)" },
  rot: { kurz: "Voller als sonst", farbe: "var(--color-voll)", feld: "var(--color-voll-weich)" },
  geschlossen: { kurz: "Geschlossen", farbe: "var(--color-still)", feld: "var(--color-still-weich)" },
  aufbau: { kurz: "Noch ohne Vergleich", farbe: "var(--color-still)", feld: "var(--color-still-weich)" },
  veraltet: { kurz: "Keine aktuellen Daten", farbe: "var(--color-still)", feld: "var(--color-still-weich)" },
  unbekannt: { kurz: "Unbekannt", farbe: "var(--color-still)", feld: "var(--color-still-weich)" },
};

/** Reihenfolge in Listen: erst was Platz hat, Stilles ans Ende. */
export const GAST_REIHENFOLGE: Ampel[] = [
  "gruen",
  "gelb",
  "rot",
  "aufbau",
  "geschlossen",
  "veraltet",
  "unbekannt",
];

/** Der Messwert in einem Satz, den ein Gast versteht. */
export function messwertText(p: SensorProps): string {
  switch (p.metrik) {
    case "frei_plaetze":
      return `${Math.max(0, Math.round(p.wert))} von ${p.kapazitaet} Plätzen frei`;
    case "ampelstufe":
      return ["", "noch Platz", "wird knapp", "wird knapp", "fast voll", "derzeit voll"][p.wert] ??
        "gemeldet";
    case "dock_belegung":
      return p.kapazitaet != null
        ? `${Math.max(0, p.kapazitaet - Math.round(p.wert))} von ${p.kapazitaet} Rückgabeplätzen frei`
        : `${Math.round(p.wert)} Räder da`;
    case "personen":
      return `${Math.round(p.wert)} Gäste gerade da`;
    default:
      return `${Math.round(p.wert)} ${p.einheit}`;
  }
}

/** Kurzform fuer die Kachel — eine Zahl und ein Wort. */
export function messwertKurz(p: SensorProps): { zahl: string; einheit: string } {
  switch (p.metrik) {
    case "frei_plaetze":
      return { zahl: String(Math.max(0, Math.round(p.wert))), einheit: "Plätze frei" };
    case "dock_belegung":
      return {
        zahl: String(p.kapazitaet != null ? Math.max(0, p.kapazitaet - Math.round(p.wert)) : Math.round(p.wert)),
        einheit: "Plätze frei",
      };
    case "ampelstufe":
      return { zahl: `${p.wert}/5`, einheit: "Auslastung" };
    case "personen":
      return { zahl: String(Math.round(p.wert)), einheit: "Gäste da" };
    default:
      return { zahl: String(Math.round(p.wert)), einheit: p.einheit };
  }
}
