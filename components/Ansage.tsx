"use client";

import { ART_TEXT, type Region } from "@/lib/regionen";
import type { ZielProps } from "@/lib/types";

/**
 * Genau EINE Aussage zu einem Ziel — das ist der Kern der Besucherlenkung.
 *
 * Eine Statustafel sagt „73 % belegt" und überlässt dem Gast die Entscheidung.
 * Diese Komponente entscheidet: hinfahren, anderer Zugang, später, oder
 * woandershin. Und wenn keine der vier Aussagen belegbar ist, sagt sie das,
 * statt die schwächste aufzublasen.
 *
 * Die Reihenfolge ist die Stufenleiter aus dem Workflow, von der sanftesten
 * Lenkung zur stärksten:
 *   1. gleiches Ziel, anderer Zugang  (kein Umweg — nur die andere Seite)
 *   2. gleiches Ziel, andere Zeit     (kein Ortswechsel)
 *   3. vergleichbares Ziel in der Nähe
 */
export default function Ansage({
  z,
  region,
  onZiel,
}: {
  z: ZielProps;
  region: Region;
  /** Empfehlung anklickbar machen: führt zum empfohlenen Ziel und fliegt die Karte hin */
  onZiel?: (id: string) => void;
}) {
  if (z.ampel === "veraltet") {
    return (
      <div className="rounded-2xl border border-linie p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-tinte-zart">
          Keine Meldung
        </p>
        <p className="mt-2 text-sm leading-relaxed text-tinte-weich">
          Von hier kam zuletzt vor über {Math.round(z.alter_min / 60)} Stunden ein Wert.
          Solange das so ist, wird hier nichts behauptet.
        </p>
      </div>
    );
  }
  if (z.ampel === "geschlossen") return null;

  // 1. Anderer Zugang — der beste Rat überhaupt, weil er niemanden umleitet.
  if (z.zugang_tipp) {
    const t = z.zugang_tipp;
    return (
      <div className="rounded-2xl p-5" style={{ background: "var(--color-frei-weich)" }}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#0b6b46" }}>
          Gleiches Ziel, anderer Zugang
        </p>
        <p className="mt-2 text-lg font-semibold leading-snug" style={{ color: "#0b5138" }}>
          {t.nach}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "#0b6b46" }}>
          {t.von} ist voll — {t.nach} liegt {t.km} km entfernt am selben Ziel und hat
          noch Platz.
        </p>
      </div>
    );
  }

  // 2. Später — kein Ortswechsel nötig, für eine Destination die verträglichste
  //    Lenkung überhaupt.
  if (z.spaeter) {
    return (
      <div className="rounded-2xl p-5" style={{ background: "var(--color-mittel-weich)" }}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#95580f" }}>
          Lieber später
        </p>
        <p className="mt-2 text-lg font-semibold leading-snug" style={{ color: "#7c4708" }}>
          Ab {z.spaeter.stunde}:00 Uhr
        </p>
        <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "#95580f" }}>
          Dann ist es hier typischerweise rund {z.spaeter.anteil} % ruhiger — gleiches
          Ziel, nur ein anderer Zeitpunkt.
        </p>
      </div>
    );
  }

  // 3. Woandershin. Klickbar: Wer hier tippt, landet beim empfohlenen Ziel und
  //    die Karte fliegt hin. Ohne das war die Empfehlung eine Sackgasse.
  if (z.alternative) {
    const a = z.alternative;
    const platz =
      a.frei_plaetze != null && a.kapazitaet != null
        ? `${a.frei_plaetze} von ${a.kapazitaet} Plätzen frei`
        : a.status.kurz.toLowerCase();
    const inhalt = (
      <>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#0b6b46" }}>
          Heute besser dorthin
        </p>
        <p className="mt-2 flex items-center gap-2 text-lg font-semibold leading-snug" style={{ color: "#0b5138" }}>
          {a.name}
          {onZiel && (
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 opacity-70">
              <path d="M3 8h9m0 0L8.5 4.5M12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "#0b6b46" }}>
          {ART_TEXT[a.art]} · {a.km} km entfernt · dort {platz}
        </p>
      </>
    );
    return onZiel ? (
      <button
        onClick={() => onZiel(a.id)}
        className="w-full rounded-2xl p-5 text-left transition hover:brightness-[0.97]"
        style={{ background: "var(--color-frei-weich)" }}
      >
        {inhalt}
      </button>
    ) : (
      <div className="rounded-2xl p-5" style={{ background: "var(--color-frei-weich)" }}>
        {inhalt}
      </div>
    );
  }

  // 4. Losfahren — die häufigste und langweiligste Aussage, und genau deshalb
  //    muss sie dastehen: Sonst wirkt Schweigen wie eine Warnung.
  if (z.ampel === "gruen") {
    return (
      <div className="rounded-2xl p-5" style={{ background: "var(--color-frei-weich)" }}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#0b6b46" }}>
          Jetzt losfahren
        </p>
        <p className="mt-2 text-lg font-semibold leading-snug" style={{ color: "#0b5138" }}>
          Hier ist Platz
        </p>
        <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "#0b6b46" }}>
          {z.status.art === "vergleich"
            ? `Spürbar mehr Luft als sonst um diese Zeit — ${z.vergleich_tage} Vergleichstage.`
            : `${region.ziel} mit reichlich freier Kapazität.`}
        </p>
      </div>
    );
  }

  if (z.ampel === "rot") {
    return (
      <div className="rounded-2xl p-5" style={{ background: "var(--color-voll-weich)" }}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#a02b39" }}>
          Gerade voll
        </p>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "#a02b39" }}>
          In der Nähe ist gerade nichts spürbar leerer, und der Tagesverlauf gibt keine
          ruhigere Stunde her. Hier hilft nur ein anderer Tag.
        </p>
      </div>
    );
  }

  if (z.ampel === "aufbau") {
    return (
      <div className="rounded-2xl border border-linie p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-tinte-zart">
          Noch ohne Vergleich
        </p>
        <p className="mt-2 text-sm leading-relaxed text-tinte-weich">
          Der Live-Wert läuft, aber für diese Uhrzeit fehlen noch Vergleichstage
          {z.basis_tage > 0 && ` — bisher ${z.basis_tage}`}. Ohne sie lässt sich nicht
          sagen, ob das viel oder wenig ist.
        </p>
      </div>
    );
  }

  return null;
}
