"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Detail from "@/components/Detail";
import {
  AMPEL_FARBE,
  AMPEL_TEXT,
  alterText,
  type Ampel,
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
const REIHENFOLGE: Ampel[] = ["rot", "gelb", "gruen", "aufbau", "veraltet", "unbekannt"];

export default function Seite() {
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

  const liste = useMemo(() => {
    if (!daten) return [];
    return [...daten.features]
      .map((f) => f.properties)
      .sort((a, b) => {
        const ra = REIHENFOLGE.indexOf(a.ampel);
        const rb = REIHENFOLGE.indexOf(b.ampel);
        if (ra !== rb) return ra - rb;
        return (b.quote ?? -1) - (a.quote ?? -1);
      });
  }, [daten]);

  const gewaehltProps: SensorProps | null = useMemo(
    () => liste.find((p) => p.id === gewaehlt) ?? null,
    [liste, gewaehlt],
  );

  const z = daten?.zusammenfassung;

  return (
    <main className="flex h-dvh flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">Besucherpuls</h1>
            <p className="text-sm text-slate-600">
              Wie voll ist es gerade — und ist das viel? Fünf offene Live-Zählquellen aus vier Ländern,
              jede gegen ihren eigenen Normalwert.
            </p>
          </div>
          <p className="text-xs text-slate-500">
            {daten ? (
              <>
                Stand {new Date(daten.erzeugt).toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })} ·{" "}
                {z?.sensoren} Sensoren · {z?.mit_ampel} eingeordnet · {z?.im_aufbau} im Aufbau ·{" "}
                {z?.veraltet} ohne Signal
              </>
            ) : laedt ? (
              "lädt …"
            ) : null}
          </p>
        </div>
        {fehler && (
          <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Daten konnten nicht geladen werden: {fehler}. Der nächste Versuch läuft automatisch.
          </p>
        )}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_22rem_20rem]">
        <div className="min-h-[45vh] lg:min-h-0">
          <LiveMap daten={daten} ausgewaehlt={gewaehlt} onSelect={setGewaehlt} />
        </div>

        <section className="min-h-0 overflow-y-auto border-l border-slate-200 bg-white">
          <h2 className="sticky top-0 border-b border-slate-100 bg-white px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Nach Abweichung sortiert
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
                      {p.ort} · {p.ampel === "veraltet" ? alterText(p.alter_min) : AMPEL_TEXT[p.ampel]}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm tabular-nums text-slate-700">
                    {p.quote != null ? `${p.quote} %` : "–"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <div className="min-h-0">
          {gewaehltProps ? (
            <Detail p={gewaehltProps} onClose={() => setGewaehlt(null)} />
          ) : (
            <aside className="h-full space-y-4 border-l border-slate-200 bg-white p-5 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Einen Punkt wählen</p>
              <p>
                Jeder Punkt ist ein realer Sensor: ein Radarzähler auf der Kapellbrücke, Zugangszähler
                in den Zürcher Bädern, Parkleitsysteme an Dolomitenpässen, Eco-Counter an
                Südtiroler Radwegen, Leihrad-Stationen an der Ostsee.
              </p>
              <p>
                Die Farbe vergleicht den aktuellen Wert mit dem, was an diesem Ort zu dieser
                Tageszeit üblich ist. <strong>Nicht</strong> mit einer Kapazität — deshalb sind
                Personen, Parkplätze und Räder auf einer Karte vergleichbar.
              </p>
              <ul className="space-y-1 border-t border-slate-100 pt-3">
                {(["rot", "gelb", "gruen", "aufbau", "veraltet"] as Ampel[]).map((a) => (
                  <li key={a} className="flex items-center gap-2 text-xs">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: AMPEL_FARBE[a] }}
                      aria-hidden
                    />
                    {AMPEL_TEXT[a]}
                  </li>
                ))}
              </ul>
              <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">
                Graue Punkte sind kein Fehler der Seite: Dort liefert der Sensor der Stadt seit Tagen
                nichts mehr. Die Seite prüft das Alter jedes Werts und sagt es, statt eine alte Zahl
                als aktuell auszugeben.
              </p>
            </aside>
          )}
        </div>
      </div>
    </main>
  );
}
