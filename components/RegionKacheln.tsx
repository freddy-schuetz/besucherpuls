"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  EINZELREGIONEN,
  GAST_REIHENFOLGE,
  VERBUND_BAYERN,
  gastStatus,
  type Region,
} from "@/lib/regionen";
import type { SensorProps, StatusAntwort } from "@/lib/types";

/** Was auf der Kachel steht: wie viele Ziele es gibt, wie viele Platz haben,
 *  und der eine Satz, der gerade zaehlt. */
interface Vorschau {
  ziele: number;
  frei: number;
  voll: number;
  ohneVergleich: number;
  bester: SensorProps | null;
  vollster: SensorProps | null;
}

function auswerten(features: SensorProps[]): Vorschau {
  const mit = features.map((p) => ({ p, s: gastStatus(p) }));
  const zaehl = (a: string) => mit.filter((x) => x.s.ampel === a).length;
  // Fuer den Tipp zaehlt nur, was wirklich frei ist — bei Gleichstand entscheidet
  // die feinere historische Einordnung.
  const frei = mit
    .filter((x) => x.s.ampel === "gruen")
    .sort((a, b) => (a.p.quote ?? 50) - (b.p.quote ?? 50));
  return {
    ziele: features.length,
    frei: zaehl("gruen"),
    voll: zaehl("rot"),
    ohneVergleich: zaehl("aufbau") + zaehl("veraltet") + zaehl("geschlossen"),
    bester: frei[0]?.p ?? null,
    vollster: null,
  };
}

function Punktreihe({ features }: { features: SensorProps[] }) {
  // Alle Ziele als Punktreihe — auf einen Blick sichtbar, wie das Verhaeltnis
  // gerade steht, ohne dass man eine Zahl lesen muss.
  const sortiert = [...features]
    .map((p) => ({ p, s: gastStatus(p) }))
    .sort((a, b) => GAST_REIHENFOLGE.indexOf(a.s.ampel) - GAST_REIHENFOLGE.indexOf(b.s.ampel));
  return (
    <div className="flex flex-wrap gap-1.5" aria-hidden>
      {sortiert.slice(0, 34).map(({ p, s }) => (
        <span
          key={p.id}
          className="h-2 w-2 rounded-full"
          style={{
            background: s.farbe,
            opacity: s.ampel === "aufbau" || s.ampel === "veraltet" ? 0.45 : 1,
          }}
        />
      ))}
      {sortiert.length > 34 && (
        <span className="text-[11px] leading-none text-tinte-zart">+{sortiert.length - 34}</span>
      )}
    </div>
  );
}

function Kachel({ region, daten, verzug }: { region: Region; daten: StatusAntwort | null; verzug: number }) {
  const features = useMemo(
    () => (daten?.features ?? []).map((f) => f.properties).filter((p) => p.gruppe === region.gruppe),
    [daten, region.gruppe],
  );
  const v = useMemo(() => auswerten(features), [features]);

  const tipp = v.bester ? { titel: v.bester.name } : null;

  return (
    <Link
      href={`/region/${region.slug}`}
      className="karte auftauchen group relative flex flex-col overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-[0_2px_4px_rgb(12_26_23/0.05),0_22px_44px_-20px_rgb(12_26_23/0.3)]"
      style={{ ["--verzug" as string]: `${verzug}ms` }}
    >
      {/* Kopf mit Regionsfarbe */}
      <div
        className="himmel korn relative px-6 pb-5 pt-6"
        style={{ ["--ton-a" as string]: region.tonA, ["--ton-b" as string]: region.tonB }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: region.akzent }}>
          {region.aktivitaet}
        </p>
        <h2 className="mt-2 text-[1.65rem] font-semibold leading-[1.15] text-tinte">{region.frage}</h2>
        <p className="mt-1.5 text-sm font-medium text-tinte-weich">
          {region.name} · {region.land}
        </p>
      </div>

      {/* Live-Stand */}
      <div className="flex flex-1 flex-col gap-4 px-6 py-5">
        {daten ? (
          <>
            <div className="flex items-baseline gap-5">
              <span>
                <span className="zahl text-4xl font-semibold leading-none text-tinte">{v.ziele}</span>
                <span className="ml-1.5 text-sm text-tinte-weich">{region.zielPlural}</span>
              </span>
              {v.frei > 0 && (
                <span className="zahl text-sm font-medium" style={{ color: "var(--color-frei)" }}>
                  {v.frei} mit viel Platz
                </span>
              )}
              {v.voll > 0 && (
                // Bewusst nur "voll": Ob die Aussage aus dem Vergleich mit sonst
                // oder aus der gemeldeten Auslastung stammt, unterscheidet sich je
                // Region — auf der Kachel waere jede der beiden Formulierungen für
                // die Haelfte der Faelle falsch.
                <span className="zahl text-sm font-medium" style={{ color: "var(--color-voll)" }}>
                  {v.voll} voll
                </span>
              )}
            </div>

            <Punktreihe features={features} />

            {tipp ? (
              <p className="mt-auto text-sm leading-relaxed text-tinte-weich">
                Gerade am entspanntesten:{" "}
                <strong className="font-semibold text-tinte">{tipp.titel}</strong>
              </p>
            ) : v.voll === v.ziele ? (
              <p className="mt-auto text-sm leading-relaxed text-tinte-weich">
                Gerade ist überall viel los.
              </p>
            ) : (
              <p className="mt-auto text-sm leading-relaxed text-tinte-weich">
                {v.ohneVergleich === v.ziele
                  ? "Gerade geschlossen — die Werte laufen weiter mit."
                  : "Kein Ziel sticht gerade heraus."}
              </p>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="h-9 w-32 animate-pulse rounded-lg bg-still-weich" />
            <div className="h-2 w-full animate-pulse rounded bg-still-weich" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-still-weich" />
          </div>
        )}

        <span
          className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold transition-[gap] group-hover:gap-2.5"
          style={{ color: region.akzent }}
        >
          Ansehen
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M3 8h9m0 0L8.5 4.5M12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </Link>
  );
}

/** Bayern als eine breite Kachel mit den drei Gebieten darin. Sieben
 *  gleichrangige Kacheln waeren Brei — und die Staffelung zeigt nebenbei, wo
 *  die Demo am meisten kann. */
function BayernKachel({ daten }: { daten: StatusAntwort | null }) {
  const v = VERBUND_BAYERN;
  const alle = useMemo(
    () =>
      (daten?.features ?? [])
        .map((f) => f.properties)
        .filter((p) => v.gebiete.some((g) => g.gruppe === p.gruppe)),
    [daten, v.gebiete],
  );

  return (
    <div
      className="karte auftauchen overflow-hidden sm:col-span-2"
      style={{ ["--verzug" as string]: "0ms" }}
    >
      <div
        className="himmel korn relative px-6 pb-6 pt-7"
        style={{ ["--ton-a" as string]: v.tonA, ["--ton-b" as string]: v.tonB }}
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: v.akzent }}
            >
              {v.aktivitaet}
            </p>
            <h2 className="mt-2 text-[1.9rem] font-semibold leading-[1.12] text-tinte">
              {v.frage}
            </h2>
            <p className="mt-1.5 text-sm font-medium text-tinte-weich">{v.land}</p>
          </div>
          {daten && (
            <p className="text-sm text-tinte-weich">
              <span className="zahl text-3xl font-semibold text-tinte">{alle.length}</span>{" "}
              Parkplätze mit eigener Historie
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-px bg-linie sm:grid-cols-3">
        {v.gebiete.map((g) => {
          const f = alle.filter((p) => p.gruppe === g.gruppe);
          const s = auswerten(f);
          return (
            <Link
              key={g.slug}
              href={`/region/${g.slug}`}
              className="group flex flex-col gap-3 bg-karte px-5 py-5 transition hover:bg-flaeche"
            >
              <p className="text-[15px] font-semibold text-tinte">{g.name}</p>
              {daten ? (
                <>
                  <p className="zahl text-sm text-tinte-weich">
                    {s.ziele} Parkplätze
                    {s.frei > 0 && (
                      <span className="ml-2 font-medium" style={{ color: "var(--color-frei)" }}>
                        {s.frei} frei
                      </span>
                    )}
                    {s.voll > 0 && (
                      <span className="ml-2 font-medium" style={{ color: "var(--color-voll)" }}>
                        {s.voll} voll
                      </span>
                    )}
                  </p>
                  <Punktreihe features={f} />
                </>
              ) : (
                <div className="h-2 w-full animate-pulse rounded bg-still-weich" />
              )}
              <span
                className="mt-auto inline-flex items-center gap-1.5 pt-1 text-sm font-semibold transition-[gap] group-hover:gap-2.5"
                style={{ color: g.akzent }}
              >
                Ansehen
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M3 8h9m0 0L8.5 4.5M12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function RegionKacheln() {
  const [daten, setDaten] = useState<StatusAntwort | null>(null);

  useEffect(() => {
    let lebt = true;
    const holen = async () => {
      try {
        const r = await fetch("/api/status", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as StatusAntwort;
        if (lebt) setDaten(j);
      } catch {
        /* stiller Fehlschlag: die Kacheln bleiben im Ladezustand */
      }
    };
    holen();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") holen();
    }, 60_000);
    return () => {
      lebt = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <BayernKachel daten={daten} />
      {EINZELREGIONEN.map((r, i) => (
        <Kachel key={r.slug} region={r} daten={daten} verzug={(i + 1) * 70} />
      ))}
    </div>
  );
}
