"use client";

import {
  ART_TEXT,
  alternativeFuer,
  kleinAnfang,
  ruhigerAb,
  statusFuerZeit,
  type Region,
} from "@/lib/regionen";
import type { ZielProps } from "@/lib/types";

/**
 * Die Aussage für eine GEWÄHLTE Stunde — bewusst schwächer formuliert als die
 * Jetzt-Ansage. Was in der Zukunft liegt, ist ein typischer Wert und keine
 * Messung, und genau so steht es da.
 */
function ZeitAnsage({ z, stunde }: { z: ZielProps; stunde: number }) {
  const st = statusFuerZeit(z, stunde);
  const wert = z.tagesgang?.[stunde];
  const spaeter = ruhigerAb(z.tagesgang, stunde);

  if (wert == null) {
    return (
      <div className="rounded-2xl border border-linie p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-tinte-zart">
          Um {stunde} Uhr
        </p>
        <p className="mt-2 text-sm leading-relaxed text-tinte-weich">
          Für diese Stunde gibt es hier noch keinen Verlauf. Er entsteht mit jedem
          Tag, den mitgemessen wird.
        </p>
      </div>
    );
  }

  const voll = st?.ampel === "rot" || st?.ampel === "gelb";
  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: voll ? "var(--color-mittel-weich)" : "var(--color-frei-weich)" }}
    >
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: voll ? "#95580f" : "#0b6b46" }}
      >
        Um {stunde} Uhr typischerweise
      </p>
      <p
        className="mt-2 text-lg font-semibold leading-snug"
        style={{ color: voll ? "#7c4708" : "#0b5138" }}
      >
        {st ? st.kurz : `${Math.round(wert)} %`}
      </p>
      <p
        className="mt-1.5 text-sm leading-relaxed"
        style={{ color: voll ? "#95580f" : "#0b6b46" }}
      >
        {Math.round(wert)} % belegt im Mittel über {z.basis_tage} beobachtete Tage.
        {spaeter && ` Ab ${spaeter.stunde}:00 Uhr ist es hier typischerweise rund ${spaeter.anteil} % ruhiger.`}
      </p>
    </div>
  );
}

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
  stunde,
  leihen = false,
}: {
  z: ZielProps;
  region: Region;
  /** Empfehlung anklickbar machen: führt zum empfohlenen Ziel und fliegt die Karte hin */
  onZiel?: (id: string) => void;
  /** Gewählte Stunde, oder null für „jetzt". */
  stunde?: number | null;
  /** Nur bei Leihrädern: Absicht des Gastes. */
  leihen?: boolean;
}) {
  // FÜR EINE GEWÄHLTE STUNDE gilt eine andere Aussage als für jetzt. Vorher
  // stand unter „Heute Nachmittag" weiterhin „Lieber ab 13:00 Uhr" — ein Rat,
  // der zum Zeitpunkt der Auswahl längst Vergangenheit war.
  if (stunde != null) return <ZeitAnsage z={z} stunde={stunde} />;

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
  if (z.ampel === "geschlossen") {
    return (
      <div className="rounded-2xl border border-linie p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-tinte-zart">
          Geschlossen
        </p>
        <p className="mt-2 text-sm leading-relaxed text-tinte-weich">
          {z.status.kurz} — der Betreiber meldet das selbst.
        </p>
      </div>
    );
  }

  // Bei Leihrädern gilt die Aussage für die gewählte Absicht.
  const alt = alternativeFuer(z, leihen);
  const eigene = leihen && z.leihen ? z.leihen.status : z.status;

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
  //
  // Auch hier gilt: DIE FARBE GEHOERT DEM AUSGANGSZIEL. Der Kasten war fest
  // bernsteinfarben — auch unter „Passo Sella, 7 von 199 Plätzen frei, Voll".
  // Dieselbe Regel war für den Ortswechsel unten schon gezogen, für diesen
  // Zweig aber nicht; ein gedämpftes Gelb über einem vollen Ziel redet den
  // Zustand klein. Der Rat selbst bleibt unverändert, nur der Ton stimmt jetzt.
  if (z.spaeter) {
    const rot = eigene.ampel === "rot";
    return (
      <div
        className="rounded-2xl p-5"
        style={{ background: rot ? "var(--color-voll-weich)" : "var(--color-mittel-weich)" }}
      >
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: rot ? "#a02b39" : "#95580f" }}
        >
          {rot ? "Hier ist voll — lieber später" : "Lieber später"}
        </p>
        <p
          className="mt-2 text-lg font-semibold leading-snug"
          style={{ color: rot ? "#8a1f2c" : "#7c4708" }}
        >
          Ab {z.spaeter.stunde}:00 Uhr
        </p>
        <p className="mt-1.5 text-sm leading-relaxed" style={{ color: rot ? "#a02b39" : "#95580f" }}>
          Dann ist es hier typischerweise rund {z.spaeter.anteil} % ruhiger — gleiches
          Ziel, nur ein anderer Zeitpunkt.
        </p>
      </div>
    );
  }

  // 3. Woandershin. Klickbar: Wer hier tippt, landet beim empfohlenen Ziel und
  //    die Karte fliegt hin. Ohne das war die Empfehlung eine Sackgasse.
  if (alt) {
    const a = alt;
    const platz =
      a.raeder != null
        ? `${a.raeder} ${a.raeder === 1 ? "Rad" : "Räder"}`
        : a.frei_plaetze != null && a.kapazitaet != null
          ? `${a.frei_plaetze} von ${a.kapazitaet} Plätzen frei`
          : kleinAnfang(a.status.kurz);
    // DIE FARBE GEHOERT DEM AUSGANGSZIEL, nicht der Alternative.
    //
    // Der Kasten war durchgehend gruen — auch unter "Passhoehe Mittelalpe,
    // 0 von 10 Plaetzen frei, Voll". Das grosse gruene Feld las sich dann wie
    // "hier ist alles in Ordnung", obwohl es das Gegenteil sagen sollte. Jetzt
    // traegt der Kasten den Zustand des Ortes, an dem der Gast gerade steht;
    // die Alternative bekommt ihre eigene gruene Marke im Inneren.
    const rot = eigene.ampel === "rot";
    const feld = rot ? "var(--color-voll-weich)" : "var(--color-mittel-weich)";
    const ton = rot ? "#a02b39" : "#95580f";
    const tonKraeftig = rot ? "#8a1f2c" : "#7c4708";

    const inhalt = (
      <>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: ton }}>
          {leihen && z.leihen
            ? "Kein Rad hier — welche gibt es bei"
            : rot
              ? "Hier ist voll — besser dorthin"
              : "Wird eng — ruhiger ist es bei"}
        </p>
        <p className="mt-2 flex items-center gap-2 text-lg font-semibold leading-snug" style={{ color: tonKraeftig }}>
          {a.name}
          {onZiel && (
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 opacity-70">
              <path d="M3 8h9m0 0L8.5 4.5M12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-relaxed" style={{ color: ton }}>
          <span>{ART_TEXT[a.art]} · {a.km} km entfernt ·</span>
          {/* Die gruene Marke gehoert der Alternative — dort ist Platz, hier nicht. */}
          <span
            className="rounded-full px-2 py-0.5 text-[13px] font-semibold"
            style={{ background: "var(--color-frei-weich)", color: "#0b6b46" }}
          >
            dort {platz}
          </span>
        </p>
        {/* Warum das passt — aus den geprüften Fakten des Ziels formuliert.
            Fehlt der Satz, trägt die Zeile darüber die Aussage allein; es
            wird nichts erfunden, um die Lücke zu füllen. */}
        {a.begruendung && (
          <p
            className="mt-2 border-t pt-2 text-sm leading-relaxed"
            style={{ color: ton, borderColor: "rgba(0,0,0,0.12)" }}
          >
            {a.begruendung}
          </p>
        )}
      </>
    );
    return onZiel ? (
      <button
        onClick={() => onZiel(a.id)}
        className="w-full rounded-2xl p-5 text-left transition hover:brightness-[0.97]"
        style={{ background: feld }}
      >
        {inhalt}
      </button>
    ) : (
      <div className="rounded-2xl p-5" style={{ background: feld }}>
        {inhalt}
      </div>
    );
  }

  // 4. Losfahren — die häufigste und langweiligste Aussage, und genau deshalb
  //    muss sie dastehen: Sonst wirkt Schweigen wie eine Warnung.
  if (eigene.ampel === "gruen") {
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

  if (eigene.ampel === "rot") {
    return (
      <div className="rounded-2xl p-5" style={{ background: "var(--color-voll-weich)" }}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "#a02b39" }}>
          {leihen && z.leihen ? "Kein Rad hier" : "Gerade voll"}
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
