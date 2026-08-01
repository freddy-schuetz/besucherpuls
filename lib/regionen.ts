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
  /** Uebergeordneter Verbund. Die drei bayerischen Gebiete teilen sich EINE
   *  Kachel auf der Startseite — sieben gleichrangige Kacheln waeren Brei. */
  dach?: "bayern";
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
    slug: "allgaeu",
    name: "Allgäu",
    land: "Bayern",
    dach: "bayern",
    aktivitaet: "Wandern, Wasserfälle, Bergbahnen",
    frage: "Wo ist heute noch Parkplatz?",
    versprechen:
      "Wanderparkplätze zwischen Pfronten, Oberstdorf und dem Hörnerdorf-Gebiet. Jeder meldet Kapazität und Belegung — und hat drei Jahre eigene Historie, an der sich ablesen lässt, wann es dort typischerweise voll wird.",
    ziel: "Parkplatz",
    zielPlural: "Parkplätze",
    gruppe: "allgaeu",
    mitte: [10.35, 47.5],
    zoom: 9.6,
    akzent: "#15803d",
    tonA: "#bfe6c4",
    tonB: "#e2ecb4",
    quelle: "BayernCloud Tourismus (CC0)",
    quelleUrl: "https://bayerncloud.digital/daten-nutzen/api/",
  },
  {
    slug: "bayerischer-wald",
    name: "Bayerischer Wald",
    land: "Bayern",
    dach: "bayern",
    aktivitaet: "Nationalpark & Arber",
    frage: "Wo startest du heute in den Nationalpark?",
    versprechen:
      "Die Zufahrten zum Nationalpark und zum Arber. Besucherlenkung im Schutzgebiet heisst: Wenn ein Einstieg überläuft, soll der Andrang nicht ins Gelände ausweichen, sondern auf einen anderen Einstieg.",
    ziel: "Parkplatz",
    zielPlural: "Parkplätze",
    gruppe: "bayerischer-wald",
    mitte: [13.25, 49.0],
    zoom: 9.6,
    akzent: "#166534",
    tonA: "#c3e5c7",
    tonB: "#d8e8c0",
    quelle: "BayernCloud Tourismus (CC0)",
    quelleUrl: "https://bayerncloud.digital/daten-nutzen/api/",
  },
  {
    slug: "berchtesgaden",
    name: "Berchtesgadener Land",
    land: "Bayern",
    dach: "bayern",
    aktivitaet: "Königssee, Kehlstein, Ramsau",
    frage: "Wo kommst du heute noch unter?",
    versprechen:
      "Kehlstein, Wimbachbrücke, Hirschbichl und der Thumsee — die Zugänge zum meistbesuchten Alpenraum Deutschlands. Neun weitere Parkplätze der Region sind zwar erfasst, aber nicht mit Zählern ausgerüstet; die stehen deshalb nicht auf der Karte.",
    ziel: "Parkplatz",
    zielPlural: "Parkplätze",
    gruppe: "berchtesgaden",
    mitte: [12.93, 47.65],
    zoom: 10.4,
    akzent: "#0f766e",
    tonA: "#b3e0dd",
    tonB: "#cfe4c6",
    quelle: "BayernCloud Tourismus (CC0)",
    quelleUrl: "https://bayerncloud.digital/daten-nutzen/api/",
  },
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

/** Was auf der Startseite als Kachel erscheint: die bayerischen Gebiete
 *  gebuendelt, alles andere einzeln. */
export interface Verbund {
  slug: string;
  name: string;
  land: string;
  aktivitaet: string;
  frage: string;
  akzent: string;
  tonA: string;
  tonB: string;
  gebiete: Region[];
}

export const VERBUND_BAYERN: Verbund = {
  slug: "bayern",
  name: "Bayern",
  land: "Allgäu · Bayerischer Wald · Berchtesgaden",
  aktivitaet: "Wanderparkplätze in drei Gebieten",
  frage: "Wo ist heute noch Parkplatz?",
  akzent: "#15803d",
  tonA: "#bfe6c4",
  tonB: "#e2ecb4",
  gebiete: REGIONEN.filter((r) => r.dach === "bayern"),
};

/** Reihenfolge der Startseite: Bayern zuerst, dann die Einzelregionen. */
export const EINZELREGIONEN = REGIONEN.filter((r) => r.dach !== "bayern");

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

/** Ab dieser Belegung darf ein Ziel überhaupt „voll" heissen. Darunter ist mehr
 *  als ein Drittel frei — und dann ist ein Ortswechsel kein Rat, sondern Spott. */
const VOLL_AB_PROZENT = 67;

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
  // Zürich: keine Kapazität, aber die Vierstufen-Anzeige der Stadt, umgerechnet
  // auf 12,5 / 37,5 / 62,5 / 87,5 %. Eigene Schwellen, weil eine von vier Stufen
  // etwas anderes bedeutet als ein Prozentwert aus Kapazität und Belegung.
  if (p.metrik === "personen" && p.auslastung != null) {
    if (p.auslastung < 25) return ausAmpel("gruen", "Viel Platz", "kapazitaet");
    if (p.auslastung < 75) return ausAmpel("gelb", "Gut besucht", "kapazitaet");
    return ausAmpel("rot", "Sehr voll", "kapazitaet");
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
    // Zwei Leitplanken. Beide entstanden aus Faellen, die auf der Seite standen:
    //
    // (a) "Viel Platz" bei 0 von 500 freien Plaetzen — historisch voellig normal,
    //     weil der Sensor seit Wochen dasselbe meldet. Fuer einen Gast trotzdem
    //     falsch. Ist es absolut voll, gilt das, egal was der Vergleich sagt.
    //
    // (b) "Voller als sonst" bei 210 von 340 freien Plaetzen. Stimmt statistisch,
    //     taugt aber nicht als Rat: Niemand muss woandershin fahren, wo zwei
    //     Drittel frei sind. Solange mehr als ein Drittel frei ist, heisst es
    //     hoechstens "gut besucht" — nie "voll".
    if (kap && kap.ampel === "rot") return kap;
    if (p.ampel === "rot" && (p.auslastung ?? 100) < VOLL_AB_PROZENT) {
      return ausAmpel("gelb", "Gut besucht, aber Platz", "vergleich");
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
    case "dock_belegung": {
      // Beide Zahlen. Fuer einen Gast ist zuerst interessant, ob er hier ein Rad
      // BEKOMMT — die Rueckgabeplaetze zaehlen erst auf dem Rueckweg.
      const raeder = Math.max(0, Math.round(p.wert));
      const frei = p.kapazitaet != null ? Math.max(0, p.kapazitaet - raeder) : null;
      const teil = raeder === 1 ? "1 Rad zum Mitnehmen" : `${raeder} Räder zum Mitnehmen`;
      return frei != null ? `${teil} · ${frei} Rückgabeplätze frei` : teil;
    }
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
