import type { Ampel, Gruppe, SensorProps, Status, ZielProps, Zielart } from "./types";

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
    frage: "Wo ist heute noch ein Parkplatz frei?",
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
    aktivitaet: "Kehlstein, Wimbachtal, Thumsee",
    frage: "Wo bekommst du heute noch einen Parkplatz?",
    // Der Königssee stand hier, obwohl er nicht im Datensatz ist: Schönau
    // bewirtschaftet über eine eigene Park-App ohne offene Schnittstelle. Ein
    // Versprechen, das die Seite nicht halten kann, ist schlimmer als eine
    // kleinere Auswahl — deshalb steht jetzt da, was wirklich gemessen wird.
    versprechen:
      "Kehlstein, Wimbachbrücke, Hirschbichl und der Thumsee — Zugänge zum meistbesuchten Alpenraum Deutschlands, jeder mit Kapazität und Belegung. Der Königssee fehlt bewusst: Schönau bewirtschaftet über eine eigene App, die keine offenen Daten herausgibt.",
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
    frage: "Wo ist heute noch ein Parkplatz frei?",
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
    frage: "In welchem Bad ist gerade Platz?",
    versprechen:
      "Zürichs See-, Fluss- und Freibäder zählen ihre Gäste an den Zugängen — als einzige Region hier steht eine echte Besucherzahl auf der Karte. Die Stadt veröffentlicht schubweise, etwa alle anderthalb Stunden; wie alt ein Wert ist, steht dabei.",
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
    // EHRLICH BLEIBEN. Wien liefert AUSLASTUNG_AMPEL_KATEGORIE_0 bis _3 — heute
    // plus drei Folgetage — und 32 von 33 Bädern tragen für alle vier Tage
    // denselben Wert. Das ist eine Einschätzung für den Tag, keine Zählung, auch
    // wenn der Zeitstempel stündlich erneuert wird. Wer das erst im Detailfeld
    // erfährt, hat die Seite vorher schon als Live-Anzeige gelesen.
    versprechen:
      "Die Stadt Wien schätzt je Bad eine Ampelstufe für den Tag — keine Live-Zählung, Besucherzahlen veröffentlicht sie nicht. Was diese Seite daraus macht: Hallenbad, Sommerbad, Kombibad und Familienbad werden unterscheidbar, und ist deines voll, steht hier das nächste mit Platz.",
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
    frage: "Wo bekommst du gerade ein Rad — und wo kannst du eines abgeben?",
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
  frage: "Wo ist heute noch ein Parkplatz frei?",
  akzent: "#15803d",
  tonA: "#bfe6c4",
  tonB: "#e2ecb4",
  gebiete: REGIONEN.filter((r) => r.dach === "bayern"),
};

/** Reihenfolge der Startseite: Bayern zuerst, dann die Einzelregionen. */
export const EINZELREGIONEN = REGIONEN.filter((r) => r.dach !== "bayern");

/**
 * Farben zur Ampel. MEHR NICHT.
 *
 * Hier stand bis zuletzt `gastStatus()` — eine zweite, eigenständige
 * Statusberechnung neben der im Workflow. Die Folgen waren keine Schönheits-
 * fehler: Die Landkarte färbte nach dem einen Ergebnis, die Kacheln nach dem
 * anderen, und die Empfehlungslogik im Workflow sah Wiens Bäder als „ohne
 * Basis" — weshalb Wien und Gröden nie eine Empfehlung bekommen konnten.
 *
 * Der Status wird jetzt an genau einer Stelle berechnet (scripts/status_node.js)
 * und kommt als `status`-Objekt mit. Dieses Modul darf ihn einfärben und
 * sortieren — ableiten darf es nichts mehr.
 */
export const STATUS_FARBE: Record<Ampel, { farbe: string; feld: string }> = {
  gruen: { farbe: "var(--color-frei)", feld: "var(--color-frei-weich)" },
  gelb: { farbe: "var(--color-mittel)", feld: "var(--color-mittel-weich)" },
  rot: { farbe: "var(--color-voll)", feld: "var(--color-voll-weich)" },
  geschlossen: { farbe: "var(--color-still)", feld: "var(--color-still-weich)" },
  aufbau: { farbe: "var(--color-still)", feld: "var(--color-still-weich)" },
  veraltet: { farbe: "var(--color-still)", feld: "var(--color-still-weich)" },
  unbekannt: { farbe: "var(--color-still)", feld: "var(--color-still-weich)" },
};

/**
 * Der Status, der für die gewählte Zeit gilt.
 *
 * `stunde === null` heisst jetzt — dann ist es der Live-Status. Sonst kommt er
 * aus `tagesgang_status`, das der Workflow mit DERSELBEN Funktion je Stunde
 * berechnet. Hier wird nichts abgeleitet; das war der Fehler, der Wien und
 * Gröden monatelang stumm gemacht hat.
 *
 * Null bedeutet: Für diese Stunde gibt es keine belastbare Aussage — entweder
 * fehlt der Verlauf, oder die Quelle liefert keine Prozentwerte (Zürich zählt
 * Personen, die Radzähler Räder).
 */
export function statusFuerZeit(
  z: ZielProps,
  stunde: number | null,
  leihen = false,
): Status | null {
  if (stunde == null) return leihen && z.leihen ? z.leihen.status : z.status;
  return z.tagesgang_status?.[stunde] ?? null;
}

/** „Viel Platz" → „viel Platz". Nur der erste Buchstabe, sonst wird aus
 *  „Viel Platz" ein „viel platz" und aus „Wird eng" ein „wird eng" — beim
 *  zweiten stimmt es zufällig, beim ersten nicht. */
export function kleinAnfang(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

/** Wie voll es für die gewählte Absicht ist — spiegelt fuellungFuer() im Workflow. */
export function fuellungFuer(z: ZielProps, leihen: boolean): number | null {
  if (leihen && z.leihen) return z.leihen.auslastung;
  return z.auslastung ?? z.quote ?? null;
}

/** Die Empfehlung für die gewählte Absicht. */
export function alternativeFuer(z: ZielProps, leihen: boolean) {
  return leihen && z.leihen ? z.leihen.alternative : z.alternative;
}

/** Der Messwert-Satz für die gewählte Absicht — bei Rädern zählt etwas anderes,
 *  je nachdem ob man eines holen oder abgeben will. */
export function messwertAbsicht(z: ZielProps, leihen: boolean): string {
  if (!z.leihen) return messwertZiel(z);
  const raeder = z.leihen.raeder;
  const frei = z.kapazitaet != null ? Math.max(0, z.kapazitaet - raeder) : null;
  if (leihen) {
    return raeder === 0
      ? "Gerade kein Rad hier"
      : `${raeder} ${raeder === 1 ? "Rad" : "Räder"} zum Mitnehmen`;
  }
  return frei === 0
    ? "Kein Platz zum Abgeben"
    : `${frei} ${frei === 1 ? "Rückgabeplatz" : "Rückgabeplätze"} frei`;
}

/**
 * Die nächste besuchbare Stunde, in der es spürbar ruhiger ist.
 *
 * Spiegelt `spaeterAls()` aus scripts/status_node.js — bewusst dieselbe
 * Arithmetik auf derselben gelieferten Kurve, damit die Aussage auch für eine
 * GEWÄHLTE Stunde entsteht und nicht nur für die Serverstunde. Es ist kein
 * zweiter Statusrechner: Hier werden nur Kurvenwerte verglichen, keine Ampel
 * vergeben.
 */
export function ruhigerAb(
  kurve: (number | null)[] | null,
  ab: number,
): { stunde: number; anteil: number } | null {
  if (!kurve) return null;
  const start = kurve[ab];
  const hoechst = Math.max(...kurve.filter((v): v is number => v != null), 0);
  if (start == null || hoechst <= 0 || start < hoechst * 0.25) return null;
  let beste: number | null = null;
  for (let i = 1; i <= 6; i++) {
    const h = (ab + i) % 24;
    const v = kurve[h];
    if (v == null || h < 7 || h > 20) continue;
    if (v < start * 0.7 && (beste === null || v < (kurve[beste] ?? Infinity))) beste = h;
  }
  return beste === null
    ? null
    : { stunde: beste, anteil: Math.round((1 - (kurve[beste] ?? 0) / start) * 100) };
}

/** Wie die Kategorien heissen, wenn ein Gast sie liest. */
export const ART_TEXT: Record<Zielart, string> = {
  bergbahn: "Bergbahn",
  nationalpark: "Nationalpark",
  wandern: "Wandern",
  klamm: "Klamm & Wasserfall",
  see: "Baden",
  rad: "Rad leihen",
  stadt: "Altstadt",
  ort: "Im Ort",
  anreise: "Bahn & Bus",
  sonstiges: "Sonstiges",
  hallenbad: "Hallenbad",
  freibad: "Freibad",
  sommerbad: "Sommerbad",
  kombibad: "Kombibad",
  familienbad: "Familienbad",
  strandbad: "Strandbad",
  flussbad: "Flussbad",
  seebad: "Seebad",
};

/**
 * Sinnbild je Kategorie als SVG-Pfad (16×16).
 *
 * Vorher standen hier Unicode-Zeichen (▲ ⛰ ◡ ⎇). Die rendert jede Schrift
 * anders: „Wandern" und „Bergbahn" sahen im Ergebnis identisch aus, und ⎇ fiel
 * je nach System ganz aus. Gezeichnete Pfade sehen überall gleich aus.
 */
export const ART_PFAD: Record<Zielart, string> = {
  // Gipfel mit Seil darüber
  bergbahn: "M1.5 13.5 6 6l3 4.2L11 7l3.5 6.5zM2 3.2 14 5.6M4.6 4.1v1.8M11.4 6.4v1.8",
  // Baum
  nationalpark: "M8 2 4.6 7.4h6.8zM8 5.6 4 12h8zM8 12v2.4",
  // Zwei Gipfel
  wandern: "M1 13.5 5.6 5l3.1 5.4M7 13.5l3.4-6 4.6 6z",
  // Fallendes Wasser zwischen Felsen
  klamm: "M4 2v11M12 2v11M8 3.5c1.6 1.7 1.6 3.4 0 5.1s-1.6 3.4 0 5.1",
  // Welle
  see: "M1.5 6.5c2.2-2 4.3-2 6.5 0s4.3 2 6.5 0M1.5 11c2.2-2 4.3-2 6.5 0s4.3 2 6.5 0",
  // Fahrrad
  rad: "M4 12.5a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2M12 12.5a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2M4 9.9 7 4.6h3M6.6 9.9h5",
  // Brücke über Wasser
  stadt: "M1.5 9.5c2-3 4-4.5 6.5-4.5s4.5 1.5 6.5 4.5M4.5 9.5v4M11.5 9.5v4M1.5 13.5h13",
  // Häuser
  ort: "M1.5 14V7l3.6-2.8L8.7 7v7zM8.7 14V9.2l3-2.2 3 2.2V14",
  // Gleis mit Bahnsteig
  anreise: "M4 2h8v8.2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 6.6h8M6.2 14.4l1.2-1.9M9.8 14.4l-1.2-1.9",
  // Punkt
  sonstiges: "M8 5.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8",

  // Badtypen. Alle tragen dieselbe Wellenlinie unten — das macht auf einen
  // Blick sichtbar, dass es Varianten desselben sind; darüber steht, was sie
  // unterscheidet: Dach, Sonne, beides, Familie, Ufer.
  hallenbad: "M2 7 8 3l6 4M3.5 6.5V12M12.5 6.5V12M1.5 13.5c2-1.6 3.5-1.6 5.5 0s3.5 1.6 5.5 0",
  freibad: "M8 2.5v1.6M3.9 4.2l1.1 1.1M12.1 4.2l-1.1 1.1M8 5.4a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8M1.5 13.5c2-1.6 3.5-1.6 5.5 0s3.5 1.6 5.5 0",
  sommerbad: "M8 2.5v1.6M3.9 4.2l1.1 1.1M12.1 4.2l-1.1 1.1M8 5.4a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8M1.5 13.5c2-1.6 3.5-1.6 5.5 0s3.5 1.6 5.5 0",
  kombibad: "M1.5 6.5 5 3.5l3.5 3M2.8 6v5M12 3.2v1.4M10.4 5.2l.9.9M13.6 5.2l-.9.9M12 6.4a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8M1.5 13.5c2-1.6 3.5-1.6 5.5 0s3.5 1.6 5.5 0",
  familienbad: "M5.2 3.4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3M11 5a1.2 1.2 0 1 1 0 2.4A1.2 1.2 0 0 1 11 5M3.4 10.5V7.9a1.8 1.8 0 0 1 3.6 0v2.6M9.5 10.5V8.6a1.5 1.5 0 0 1 3 0v1.9M1.5 13.5c2-1.6 3.5-1.6 5.5 0s3.5 1.6 5.5 0",
  strandbad: "M8 2.5c2.6 0 4.8 1.6 5.6 3.8H2.4C3.2 4.1 5.4 2.5 8 2.5M8 6.3v4.4M1.5 13.5c2-1.6 3.5-1.6 5.5 0s3.5 1.6 5.5 0",
  flussbad: "M4 1.8v12.4M12 1.8v12.4M6.5 4c1.6 1.4 1.6 2.8 0 4.2s-1.6 2.8 0 4.2M9.5 4c1.6 1.4 1.6 2.8 0 4.2s-1.6 2.8 0 4.2",
  seebad: "M1.5 8.5h13M1.5 11.5c2-1.6 3.5-1.6 5.5 0s3.5 1.6 5.5 0M10.5 3v3M9 4.5h3",
};

/** Der Messwert eines ZIELS in einem Satz. Bei mehreren Zugängen wird summiert —
 *  wer zum Alpsee fährt, will wissen, ob er dort irgendwo parken kann, nicht
 *  wie es an P1 aussieht. */
export function messwertZiel(z: ZielProps): string {
  const n = z.zugaenge.length;
  const wo = n > 1 ? ` auf ${n} Parkplätzen` : "";
  if (z.frei_plaetze != null && z.kapazitaet != null) {
    return `${Math.max(0, z.frei_plaetze)} von ${z.kapazitaet} Plätzen frei${wo}`;
  }
  return messwertText({
    metrik: z.metrik,
    wert: z.wert,
    kapazitaet: z.kapazitaet,
    einheit: z.einheit,
  });
}

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
export function messwertText(
  p: Pick<SensorProps, "metrik" | "wert" | "kapazitaet" | "einheit">,
): string {
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
export function messwertKurz(
  p: Pick<SensorProps, "metrik" | "wert" | "kapazitaet" | "einheit">,
): { zahl: string; einheit: string } {
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
