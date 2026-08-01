"use client";

import { useMemo } from "react";
import type { Region } from "@/lib/regionen";
import type { SensorProps } from "@/lib/types";

/**
 * Der Einstieg für Gäste, die noch kein Ziel haben: „Was hast du vor?" und
 * „Wann?" statt einer Liste aller Messpunkte.
 *
 * Das Vorhaben filtert über die eingefrorene Zielart (siehe
 * scripts/ziele_anreichern.py). Die Zeit greift auf den typischen Tagesverlauf
 * zu: Für „nachmittags" wird nicht der Jetzt-Wert sortiert, sondern der Wert,
 * den dieses Ziel um 15 Uhr üblicherweise hat. Das ist der einzige ehrliche
 * Weg, eine Frage über die Zukunft zu beantworten — mehr als „typischerweise"
 * geben die Daten nicht her, und mehr wird auch nicht behauptet.
 */
export type VorhabenWahl = string | null;
export type ZeitWahl = "jetzt" | "nachmittag" | "morgen";

export const ZEITEN: { wert: ZeitWahl; text: string; stunde: number | null }[] = [
  { wert: "jetzt", text: "Jetzt", stunde: null },
  { wert: "nachmittag", text: "Heute Nachmittag", stunde: 15 },
  { wert: "morgen", text: "Morgen früh", stunde: 9 },
];

const ART_TEXT: Record<string, string> = {
  wandern: "Wandern",
  bergbahn: "Bergbahn",
  wasser: "See & Baden",
  nationalpark: "Nationalpark",
  anreise: "Mit Bahn & Bus",
  ort: "Im Ort",
  sonstiges: "Sonstiges",
};

/** Der Wert, nach dem sortiert wird — jetzt oder zur gewählten Stunde. */
export function wertFuerZeit(p: SensorProps, stunde: number | null): number | null {
  if (stunde == null) return p.auslastung ?? p.quote ?? null;
  if (!p.tagesgang) return null;
  return p.tagesgang[stunde];
}

export default function Vorhaben({
  ziele,
  region,
  vorhaben,
  zeit,
  onVorhaben,
  onZeit,
}: {
  ziele: SensorProps[];
  region: Region;
  vorhaben: VorhabenWahl;
  zeit: ZeitWahl;
  onVorhaben: (v: VorhabenWahl) => void;
  onZeit: (z: ZeitWahl) => void;
}) {
  // Nur Vorhaben anbieten, die es in dieser Region wirklich gibt — eine leere
  // Auswahl wäre schlimmer als keine.
  const arten = useMemo(() => {
    const zaehl = new Map<string, number>();
    for (const p of ziele) {
      const a = p.ziel?.art;
      if (!a || a === "sonstiges") continue;
      zaehl.set(a, (zaehl.get(a) ?? 0) + 1);
    }
    return [...zaehl.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1]);
  }, [ziele]);

  const hatTagesgang = useMemo(() => ziele.some((p) => p.tagesgang), [ziele]);
  if (!arten.length && !hatTagesgang) return null;

  const knopf = (aktiv: boolean) =>
    `rounded-full px-4 py-2 text-sm font-medium transition ${
      aktiv
        ? "text-white"
        : "border border-linie bg-karte text-tinte-weich hover:border-tinte-zart hover:text-tinte"
    }`;

  return (
    <section className="karte p-6 sm:p-7">
      <h2 className="text-lg font-semibold text-tinte">Was hast du vor?</h2>
      <p className="mt-1.5 text-sm text-tinte-weich">
        {region.name} hat {ziele.length} {region.zielPlural}. Sag, worauf du hinauswillst — die
        Liste unten ordnet sich danach.
      </p>

      {arten.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => onVorhaben(null)}
            className={knopf(vorhaben === null)}
            style={vorhaben === null ? { background: region.akzent } : undefined}
          >
            Alles
          </button>
          {arten.map(([a, n]) => (
            <button
              key={a}
              onClick={() => onVorhaben(a)}
              className={knopf(vorhaben === a)}
              style={vorhaben === a ? { background: region.akzent } : undefined}
            >
              {ART_TEXT[a] ?? a}
              <span className="zahl ml-1.5 opacity-60">{n}</span>
            </button>
          ))}
        </div>
      )}

      {hatTagesgang && (
        <>
          <p className="mt-6 text-sm font-medium text-tinte">Wann?</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {ZEITEN.map((z) => (
              <button
                key={z.wert}
                onClick={() => onZeit(z.wert)}
                className={knopf(zeit === z.wert)}
                style={zeit === z.wert ? { background: region.akzent } : undefined}
              >
                {z.text}
              </button>
            ))}
          </div>
          {zeit !== "jetzt" && (
            <p className="mt-3 text-[13px] leading-relaxed text-tinte-zart">
              Sortiert nach dem <strong className="font-semibold">typischen</strong> Wert um{" "}
              {ZEITEN.find((z) => z.wert === zeit)?.stunde}:00 Uhr — aus dem eigenen Verlauf
              jedes Ziels, nicht aus einer Vorhersage. Ziele ohne genug Verlauf fehlen in
              dieser Ansicht.
            </p>
          )}
        </>
      )}
    </section>
  );
}
