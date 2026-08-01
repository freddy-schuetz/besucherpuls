"use client";

import { gastStatus, type Region } from "@/lib/regionen";
import type { SensorProps } from "@/lib/types";

/**
 * Genau EINE Aussage zu einem Ziel — das ist der Kern der Besucherlenkung.
 *
 * Eine Statustafel sagt „73 % belegt" und überlässt dem Gast die Entscheidung.
 * Diese Komponente entscheidet: hinfahren, später fahren, oder woandershin.
 * Und wenn keine der drei Aussagen belegbar ist, sagt sie das, statt die
 * schwächste zu nehmen.
 *
 * Sie ist bewusst eigenständig gehalten: Genau so könnte eine Destination den
 * Kasten neben jede Ausflugsziel-Seite hängen.
 */
export default function Ansage({ p, region }: { p: SensorProps; region: Region }) {
  const s = gastStatus(p);

  if (p.ampel === "veraltet" || p.ampel === "geschlossen") return null;

  // 1. Woandershin — nur wenn der Punkt wirklich voll ist UND es eine belegbare
  //    Alternative gibt. Die Stufe verrät, wie stark die Begründung ist.
  if (p.alternative) {
    const a = p.alternative;
    const grund =
      a.stufe === "zugang"
        ? "Gleiches Ziel, anderer Zugang"
        : a.stufe === "ziel"
          ? "Vergleichbares Ziel in der Nähe"
          : "Alternative in der Nähe";
    return (
      <div
        className="rounded-2xl p-5"
        style={{ background: "var(--color-frei-weich)" }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#0b6b46" }}>
          Heute besser dorthin
        </p>
        <p className="mt-2 text-lg font-semibold leading-snug" style={{ color: "#0b5138" }}>
          {a.name}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "#0b6b46" }}>
          {grund} · {a.km} km entfernt · dort deutlich mehr Platz
        </p>
      </div>
    );
  }

  // 2. Später — der Tagesverlauf zeigt eine ruhigere Stunde. Kein Ortswechsel
  //    nötig, und für eine Destination die verträglichste Lenkung überhaupt.
  if (p.spaeter) {
    return (
      <div className="rounded-2xl p-5" style={{ background: "var(--color-mittel-weich)" }}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#95580f" }}>
          Lieber später
        </p>
        <p className="mt-2 text-lg font-semibold leading-snug" style={{ color: "#7c4708" }}>
          Ab {p.spaeter.stunde}:00 Uhr
        </p>
        <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "#95580f" }}>
          Dann ist es hier typischerweise rund {p.spaeter.anteil} % ruhiger — gleiches Ziel,
          nur ein anderer Zeitpunkt.
        </p>
      </div>
    );
  }

  // 3. Losfahren — es ist Platz. Die häufigste und langweiligste Aussage, und
  //    genau deshalb muss sie auch dastehen: Sonst wirkt Schweigen wie Warnung.
  if (s.ampel === "gruen") {
    return (
      <div className="rounded-2xl p-5" style={{ background: "var(--color-frei-weich)" }}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#0b6b46" }}>
          Jetzt losfahren
        </p>
        <p className="mt-2 text-lg font-semibold leading-snug" style={{ color: "#0b5138" }}>
          Hier ist Platz
        </p>
        <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "#0b6b46" }}>
          {region.ziel} mit spürbar mehr Luft als sonst um diese Zeit.
        </p>
      </div>
    );
  }

  // 4. Nichts Belastbares. Lieber offen sagen als eine schwache Aussage aufblasen.
  if (s.ampel === "rot") {
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

  return null;
}
