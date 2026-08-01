"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Detail from "@/components/Detail";
import {
  AMPEL_FARBE,
  AMPEL_TEXT,
  SCHAUFENSTER,
  alterText,
  type Ampel,
  type Schaufenster,
  type SensorProps,
  type StatusAntwort,
} from "@/lib/types";

const LiveMap = dynamic(() => import("@/components/LiveMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-500">
      Karte lädt …
    </div>
  ),
});

const REFRESH_MS = 60_000;
const REIHENFOLGE: Ampel[] = [
  "rot",
  "gelb",
  "gruen",
  "geschlossen",
  "aufbau",
  "veraltet",
  "unbekannt",
];

/** Gemeinsame Ansicht fuer Startseite und Schaufenster. Ohne `fenster` zeigt sie
 *  alle Sensoren, mit `fenster` nur dessen Gruppen — die Daten kommen in beiden
 *  Faellen aus derselben Antwort, es wird nur gefiltert. */
export default function Ansicht({ fenster }: { fenster?: Schaufenster }) {
  const [daten, setDaten] = useState<StatusAntwort | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const laeuft = useRef(false);

  const holen = useCallback(async () => {
    if (laeuft.current) return; // kein Nachlade-Sturm, wenn eine Anfrage haengt
    laeuft.current = true;
    try {
      const r = await fetch("/api/status", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.fehler ?? `HTTP ${r.status}`);
      setDaten(j as StatusAntwort);
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      laeuft.current = false;
      setLaedt(false);
    }
  }, []);

  useEffect(() => {
    holen();
    const t = setInterval(() => {
      // Im Hintergrund-Tab nicht pollen — spart Aufrufe und vermeidet den
      // Nachlade-Stau beim Zurueckwechseln.
      if (document.visibilityState === "visible") holen();
    }, REFRESH_MS);
    const beiSichtbar = () => {
      if (document.visibilityState === "visible") holen();
    };
    document.addEventListener("visibilitychange", beiSichtbar);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", beiSichtbar);
    };
  }, [holen]);

  const gefiltert = useMemo(() => {
    if (!daten) return null;
    if (!fenster) return daten;
    const features = daten.features.filter(
      (f) => f.properties.gruppe && fenster.gruppen.includes(f.properties.gruppe),
    );
    const z = (a: Ampel) => features.filter((f) => f.properties.ampel === a).length;
    return {
      ...daten,
      features,
      zusammenfassung: {
        sensoren: features.length,
        mit_ampel: features.filter(
          (f) => f.properties.quote != null && f.properties.ampel !== "aufbau",
        ).length,
        veraltet: z("veraltet"),
        im_aufbau: z("aufbau"),
        geschlossen: z("geschlossen"),
        mit_empfehlung: features.filter((f) => f.properties.alternative).length,
      },
    } satisfies StatusAntwort;
  }, [daten, fenster]);

  const liste = useMemo(() => {
    if (!gefiltert) return [];
    return [...gefiltert.features]
      .map((f) => f.properties)
      .sort((a, b) => {
        const ra = REIHENFOLGE.indexOf(a.ampel);
        const rb = REIHENFOLGE.indexOf(b.ampel);
        if (ra !== rb) return ra - rb;
        return (b.quote ?? -1) - (a.quote ?? -1);
      });
  }, [gefiltert]);

  const gewaehltProps: SensorProps | null = useMemo(
    () => liste.find((p) => p.id === gewaehlt) ?? null,
    [liste, gewaehlt],
  );

  // Der auffaelligste Fall mit einer echten Alternative — das ist die Schlagzeile
  const aufmacher = useMemo(
    () => liste.find((p) => p.ampel === "rot" && p.alternative) ?? null,
    [liste],
  );

  const z = gefiltert?.zusammenfassung;

  return (
    <main className="flex min-h-dvh flex-col bg-slate-50 lg:h-dvh">
      <header className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <div className="min-w-0">
            <div className="flex items-baseline gap-3">
              <Link
                href="/"
                className="text-xl font-semibold tracking-tight text-slate-900 hover:text-sky-700"
              >
                Besucherpuls
              </Link>
              {fenster && (
                <span className="truncate text-sm text-slate-500">{fenster.titel}</span>
              )}
            </div>
            <p className="mt-0.5 max-w-3xl text-sm text-slate-600">
              {fenster
                ? fenster.frage
                : "Wie voll ist es gerade — und ist das viel? Sieben offene Live-Zählquellen aus vier Ländern, jede gegen ihren eigenen Normalwert."}
            </p>
          </div>
          <p className="text-xs text-slate-500">
            {gefiltert ? (
              <>
                Stand{" "}
                {new Date(gefiltert.erzeugt).toLocaleTimeString("de-CH", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · {z?.sensoren} Messpunkte · {z?.mit_ampel} eingeordnet
                {z?.mit_empfehlung ? ` · ${z.mit_empfehlung} mit Ausweichvorschlag` : null}
              </>
            ) : laedt ? (
              "lädt …"
            ) : null}
          </p>
        </div>

        <nav className="mt-2.5 flex flex-wrap gap-1.5">
          <Link
            href="/"
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              fenster
                ? "bg-slate-100 text-slate-600 hover:bg-slate-200"
                : "bg-slate-900 text-white"
            }`}
          >
            Alle Messpunkte
          </Link>
          {SCHAUFENSTER.map((s) => (
            <Link
              key={s.slug}
              href={`/schaufenster/${s.slug}`}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                fenster?.slug === s.slug
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s.titel}
            </Link>
          ))}
        </nav>

        {fehler && (
          <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Daten konnten nicht geladen werden: {fehler}. Der nächste Versuch läuft automatisch.
          </p>
        )}
      </header>

      {fenster && aufmacher && (
        <div className="border-b border-emerald-200 bg-emerald-50 px-5 py-2.5">
          <p className="text-sm text-emerald-950">
            <strong>{aufmacher.name}</strong> ist gerade voller als üblich —{" "}
            <button
              onClick={() => setGewaehlt(aufmacher.alternative!.id)}
              className="font-semibold underline underline-offset-2 hover:text-emerald-700"
            >
              {aufmacher.alternative!.name}
            </button>{" "}
            hat Platz, {aufmacher.alternative!.km} km entfernt.
          </p>
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[1fr_22rem_20rem]">
        <div className="h-[50vh] lg:h-auto lg:min-h-0">
          <LiveMap
            daten={gefiltert}
            ausgewaehlt={gewaehlt}
            onSelect={setGewaehlt}
            start={fenster ? { mitte: fenster.mitte, zoom: fenster.zoom } : undefined}
          />
        </div>

        <section className="border-t border-slate-200 bg-white lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <h2 className="sticky top-0 border-b border-slate-100 bg-white px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Nach Auslastung sortiert
          </h2>
          <ul>
            {liste.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setGewaehlt(p.id)}
                  className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-2.5 text-left hover:bg-slate-50 ${
                    gewaehlt === p.id ? "bg-sky-50" : ""
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: AMPEL_FARBE[p.ampel] }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-900">{p.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {p.alternative
                        ? `→ ${p.alternative.name}`
                        : p.ampel === "veraltet"
                          ? alterText(p.alter_min)
                          : AMPEL_TEXT[p.ampel]}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm tabular-nums text-slate-700">
                    {p.quote != null ? `${p.quote}` : "–"}
                  </span>
                </button>
              </li>
            ))}
            {!liste.length && !laedt && (
              <li className="px-4 py-6 text-sm text-slate-500">
                Für dieses Schaufenster liegen gerade keine Messpunkte vor.
              </li>
            )}
          </ul>
        </section>

        <div className="lg:min-h-0">
          {gewaehltProps ? (
            <Detail p={gewaehltProps} onClose={() => setGewaehlt(null)} />
          ) : (
            <aside className="h-full space-y-4 border-l border-slate-200 bg-white p-5 text-sm text-slate-600">
              <p className="font-medium text-slate-900">
                {fenster ? fenster.titel : "Einen Punkt wählen"}
              </p>
              <p>
                {fenster
                  ? fenster.erklaerung
                  : "Jeder Punkt ist ein realer Sensor: ein Radarzähler auf der Kapellbrücke, Zugangszähler in den Zürcher und Wiener Bädern, Parkleitsysteme an Dolomitenpässen, Eco-Counter an Südtiroler Radwegen, Leihrad-Stationen an der Kieler Förde."}
              </p>
              <p>
                Die Zahl rechts ist <strong>kein</strong> Auslastungsprozent, sondern ein Rang:
                an wie viel Prozent der vergleichbaren Tage war es zu dieser Stunde leerer als
                jetzt. Dadurch sind Personen, Parkplätze und Räder auf einer Karte vergleichbar.
              </p>
              <ul className="space-y-1 border-t border-slate-100 pt-3">
                {(["rot", "gelb", "gruen", "geschlossen", "aufbau", "veraltet"] as Ampel[]).map(
                  (a) => (
                    <li key={a} className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: AMPEL_FARBE[a] }}
                        aria-hidden
                      />
                      {AMPEL_TEXT[a]}
                    </li>
                  ),
                )}
              </ul>
              <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">
                Graue Punkte sind kein Fehler der Seite: Dort liefert der Sensor der Stadt seit
                Tagen nichts mehr. Die Seite prüft das Alter jedes Werts und sagt es, statt eine
                alte Zahl als aktuell auszugeben.
              </p>
            </aside>
          )}
        </div>
      </div>
    </main>
  );
}
