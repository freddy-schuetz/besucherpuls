"use client";

import { useMemo, useRef, useState } from "react";
import { ART_PFAD, ART_TEXT, STATUS_FARBE, type Region } from "@/lib/regionen";
import type { ZielProps, Zielart } from "@/lib/types";

/** Sinnbild einer Kategorie, gezeichnet statt als Schriftzeichen. */
export function ArtZeichen({ art, groesse = 16 }: { art: Zielart; groesse?: number }) {
  return (
    <svg
      width={groesse}
      height={groesse}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <path
        d={ART_PFAD[art]}
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Der Einstieg. Vorher fehlte er — und das war der eigentliche Bruch.
 *
 * Die Seite begrüsste jeden mit einer Empfehlung, bevor irgendjemand gesagt
 * hatte, was er vorhat: „Parkplatz Alpsee P1 ist voll, bei P3 ist mehr Platz."
 * Für jemanden, der zum Nebelhorn will, ist das eine Zufallsinfo.
 *
 * Also zuerst die Frage. Wer sein Ziel kennt, tippt es ein. Wer nur weiss,
 * worauf er Lust hat, wählt eine Kategorie. Erst danach sagt die Seite etwas.
 */
export default function Zielsuche({
  ziele,
  region,
  suche,
  kategorie,
  onSuche,
  onKategorie,
  onZiel,
  leihen,
  onLeihen,
}: {
  ziele: ZielProps[];
  region: Region;
  suche: string;
  kategorie: Zielart | null;
  onSuche: (s: string) => void;
  onKategorie: (k: Zielart | null) => void;
  onZiel: (id: string) => void;
  /** Nur bei Leihrädern: will der Gast eines holen oder abgeben? */
  leihen?: boolean;
  onLeihen?: (v: boolean) => void;
}) {
  const [offen, setOffen] = useState(false);
  const feld = useRef<HTMLInputElement | null>(null);

  // Nur Kategorien anbieten, die es hier wirklich gibt — eine leere Auswahl
  // wäre schlimmer als keine. Gezählt wird über `arten`, nicht über `art`:
  // Ein Nationalpark-Einstieg gehört auch unter „Wandern", und genau deshalb
  // hatte der Bayerische Wald vorher keine Wander-Kategorie.
  const kategorien = useMemo(() => {
    const zaehl = new Map<Zielart, number>();
    for (const z of ziele) {
      for (const a of z.arten ?? [z.art]) {
        if (a === "sonstiges") continue;
        zaehl.set(a, (zaehl.get(a) ?? 0) + 1);
      }
    }
    const gefunden = [...zaehl.entries()]
      .filter(([, n]) => n >= 2)
      // Was auf ALLE Ziele passt, ist kein Filter. Seit die Badtypen eigene
      // Kategorien sind, trägt jedes Wiener Bad zusätzlich die Oberkategorie
      // „see" — ein Knopf „Baden 33" neben 33 Zielen filtert nichts weg und
      // steht nur im Weg. Die Oberkategorie bleibt in den Daten, weil die
      // Empfehlung sie braucht (ein volles Hallenbad darf zum Freibad führen);
      // sichtbar sein muss sie deshalb nicht.
      .filter(([, n]) => n < ziele.length)
      .sort((a, b) => b[1] - a[1]);
    // Eine einzige Kategorie ist ebenfalls keine Auswahl.
    return gefunden.length > 1 ? gefunden : [];
  }, [ziele]);

  const treffer = useMemo(() => {
    const q = suche.trim().toLowerCase();
    if (q.length < 2) return [];
    return ziele
      .filter((z) => z.name.toLowerCase().includes(q))
      .slice(0, 7);
  }, [ziele, suche]);

  return (
    <section className="karte auftauchen relative -mt-6 p-6 sm:-mt-8 sm:p-8">
      <h2 className="text-xl font-semibold text-tinte sm:text-2xl">Wohin willst du?</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-tinte-weich">
        Tipp dein Ziel ein — oder sag, worauf du Lust hast. Danach steht hier, ob es
        sich gerade lohnt.
      </p>

      {/* ------------------------------------------------------- Suchfeld */}
      <div className="relative mt-5">
        <div className="flex items-center gap-2.5 rounded-2xl border border-linie bg-flaeche px-4 py-3 transition focus-within:border-tinte-zart">
          <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-tinte-zart">
            <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.6" />
            <path d="m10.6 10.6 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            ref={feld}
            value={suche}
            onChange={(e) => {
              onSuche(e.target.value);
              setOffen(true);
            }}
            onFocus={() => setOffen(true)}
            onBlur={() => window.setTimeout(() => setOffen(false), 140)}
            placeholder={`z. B. ${ziele[0]?.name ?? region.name}`}
            aria-label={`Ziel im ${region.name} suchen`}
            className="w-full bg-transparent text-[15px] text-tinte outline-none placeholder:text-tinte-zart"
          />
          {suche && (
            <button
              onClick={() => {
                onSuche("");
                feld.current?.focus();
              }}
              aria-label="Eingabe löschen"
              className="shrink-0 rounded-full p-1 text-tinte-zart transition hover:text-tinte"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>

        {offen && treffer.length > 0 && (
          <ul className="karte absolute z-20 mt-2 w-full overflow-hidden p-1.5 shadow-lg">
            {treffer.map((z) => (
              <li key={z.id}>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onZiel(z.id);
                    onSuche("");
                    setOffen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-flaeche"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: STATUS_FARBE[z.ampel].farbe }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-tinte">{z.name}</span>
                    <span className="block text-[12px] text-tinte-zart">
                      {z.art === "sonstiges" ? z.ort || "Parkplatz" : ART_TEXT[z.art]}
                      {z.zugaenge.length > 1 && ` · ${z.zugaenge.length} Zugänge`}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12px] font-medium text-tinte-weich">
                    {z.status.kurz}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {offen && suche.trim().length >= 2 && !treffer.length && (
          <p className="karte absolute z-20 mt-2 w-full px-4 py-3 text-sm text-tinte-weich shadow-lg">
            Kein Ziel dieses Namens in {region.name}.
          </p>
        )}
      </div>

      {/* ------------------------------------------------------ Absicht
          Bei Leihrädern bedeutet „voll" zwei verschiedene Dinge. Ohne diese
          Wahl stand die Seite auf der Rückgabe-Seite fest — und schickte
          jemanden, der ein Rad holen wollte, zu einer Station mit null Rädern. */}
      {onLeihen && ziele.some((z) => z.leihen) && (
        <>
          <p className="mt-6 text-sm font-medium text-tinte">Was hast du vor?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {([true, false] as const).map((v) => (
              <button
                key={String(v)}
                onClick={() => onLeihen(v)}
                aria-pressed={leihen === v}
                className={`rounded-full px-4 py-2.5 text-sm font-medium transition ${
                  leihen === v
                    ? "text-white"
                    : "border border-linie bg-karte text-tinte-weich hover:border-tinte-zart hover:text-tinte"
                }`}
                style={leihen === v ? { background: region.akzent } : undefined}
              >
                {v ? "Rad ausleihen" : "Rad abgeben"}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ------------------------------------------------------ Kategorien */}
      {kategorien.length > 0 && (
        <>
          <p className="mt-6 text-sm font-medium text-tinte">Oder such dir was aus</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {kategorien.map(([a, n]) => {
              const aktiv = kategorie === a;
              return (
                <button
                  key={a}
                  onClick={() => onKategorie(aktiv ? null : a)}
                  aria-pressed={aktiv}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition ${
                    aktiv
                      ? "text-white"
                      : "border border-linie bg-karte text-tinte-weich hover:border-tinte-zart hover:text-tinte"
                  }`}
                  style={aktiv ? { background: region.akzent } : undefined}
                >
                  <ArtZeichen art={a} groesse={15} />
                  {ART_TEXT[a]}
                  <span className="zahl opacity-60">{n}</span>
                </button>
              );
            })}
            {kategorie && (
              <button
                onClick={() => onKategorie(null)}
                className="rounded-full px-3 py-2.5 text-sm font-medium text-tinte-zart underline underline-offset-4 transition hover:text-tinte"
              >
                Alle zeigen
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
