/**
 * Die Wortmarke.
 *
 * Die Pulslinie ist kein erfundenes Symbol: Es ist dieselbe Kurve, die in der
 * Demo unter jedem Ziel steht („So läuft ein typischer Tag hier") — ruhige
 * Nacht, Vormittagsberg, Abflachen zum Abend. Eine Marke, die aus dem Produkt
 * stammt, hält der Frage „warum das Zeichen?" stand; ein Kartenzeiger oder drei
 * Ampelpunkte hätten es nicht getan.
 *
 * Bewusst ohne "use client": reines SVG, kein Zustand.
 */
export function Pulslinie({
  breite = 46,
  hoehe = 18,
  farbe = "currentColor",
  strich = 2.1,
}: {
  breite?: number;
  hoehe?: number;
  farbe?: string;
  strich?: number;
}) {
  return (
    <svg
      width={breite}
      height={hoehe}
      viewBox="0 0 46 18"
      fill="none"
      aria-hidden
      className="shrink-0"
    >
      <path
        d="M1 13.5h6.5l3-2.2 3.2-7.8 3.4 11.4 2.6-5.2 2.8 3.8 3-6.6 3.4 8.4 3-4.6 3 2.6H45"
        stroke={farbe}
        strokeWidth={strich}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Schriftzug mit der Linie zwischen „Besucher" und „puls".
 *
 * `ton` steuert nur die Linienfarbe — der Text erbt die Farbe der Umgebung,
 * damit die Marke auf dem hellen Farbfeld der Startseite und in der dunklen
 * Fussleiste ohne Sonderfall funktioniert.
 */
export default function Wortmarke({
  gross = false,
  ton = "var(--color-frei)",
}: {
  gross?: boolean;
  ton?: string;
}) {
  return (
    <span
      className={`font-display inline-flex items-baseline gap-[3px] font-bold leading-none tracking-[-0.02em] ${
        gross ? "text-[1.6rem] sm:text-[1.9rem]" : "text-base"
      }`}
    >
      Besucher
      <span className="relative inline-block" style={{ width: gross ? 30 : 20 }}>
        <span
          className="absolute left-0"
          style={{ bottom: gross ? "0.18em" : "0.12em" }}
        >
          <Pulslinie
            breite={gross ? 30 : 20}
            hoehe={gross ? 13 : 9}
            farbe={ton}
            strich={gross ? 2.3 : 1.9}
          />
        </span>
      </span>
      puls
    </span>
  );
}
