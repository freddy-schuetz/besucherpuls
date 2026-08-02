"use client";

import {
  ART_TEXT,
  STATUS_FARBE,
  alternativeFuer,
  kleinAnfang,
  messwertAbsicht,
  messwertZiel,
  statusFuerZeit,
  type Region,
} from "@/lib/regionen";
import { ArtZeichen } from "@/components/Zielsuche";
import { alterText, type ZielProps } from "@/lib/types";

/** Wie voll im Vergleich zu sonst — als Skala statt als nackte Prozentzahl.
 *  Der Perzentilrang ist inhaltlich richtig, aber niemand liest "Rang 83".
 *  Die Skala zeigt dasselbe, ohne dass man sie erklaeren muss. */
function Vergleichsskala({ quote, farbe }: { quote: number; farbe: string }) {
  return (
    <div className="space-y-1.5">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-still-weich">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
          style={{ width: `${Math.max(3, quote)}%`, background: farbe }}
        />
      </div>
      <div className="flex justify-between text-[11px] leading-none text-tinte-zart">
        <span>leerer als sonst</span>
        <span>voller als sonst</span>
      </div>
    </div>
  );
}

/**
 * Wiens Fünf-Stufen-Ampel, sichtbar.
 *
 * Die Stadt liefert eine Stufe von 1 bis 5 — mehr nicht, keine Kopfzahl, keine
 * Kapazität. Bisher stand davon nur ein Wort auf der Karte („Wird knapp"), und
 * die eigentliche Information, WIE weit oben in der Skala das liegt, ging
 * verloren. Fünf Punkte zeigen sie ohne ein Wort Erklärung.
 */
export function AmpelStufen({ stufe, farbe }: { stufe: number; farbe: string }) {
  const s = Math.min(5, Math.max(1, Math.round(stufe)));
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1" role="img" aria-label={`Stufe ${s} von 5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="h-2.5 w-5 rounded-full transition-colors"
            style={{ background: i <= s ? farbe : "var(--color-still-weich)" }}
          />
        ))}
      </div>
      <span className="zahl text-[12px] text-tinte-zart">Stufe {s} von 5</span>
    </div>
  );
}

export default function ZielKarte({
  z,
  region,
  verzug,
  onWaehlen,
  aktiv,
  stunde,
  leihen = false,
}: {
  z: ZielProps;
  region: Region;
  verzug: number;
  onWaehlen: () => void;
  aktiv: boolean;
  /** Gewählte Stunde, oder null für „jetzt". Steuert Farbe UND Text. */
  stunde: number | null;
  /** Nur bei Leihrädern: Absicht des Gastes. */
  leihen?: boolean;
}) {
  // Ein Ziel konnte unter „Heute Nachmittag" ganz oben stehen und trotzdem rot
  // leuchten: Die Liste sortierte nach 15 Uhr, die Ampel zeigte den Jetzt-Wert.
  // Beides kommt jetzt aus derselben Stunde.
  const st = statusFuerZeit(z, stunde, leihen);
  const farben = STATUS_FARBE[st?.ampel ?? "aufbau"];
  // Die Skala vergleicht mit der Vergangenheit — sie darf nur erscheinen, wenn
  // die Aussage auch von dort kommt, nicht bei reiner Kapazitaetsangabe.
  const zeigtSkala = stunde == null && z.status.art === "vergleich" && z.quote != null;

  return (
    <button
      onClick={onWaehlen}
      className={`karte auftauchen flex flex-col gap-3.5 p-5 text-left transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgb(12_26_23/0.05),0_18px_36px_-18px_rgb(12_26_23/0.28)] ${
        aktiv ? "ring-2" : ""
      }`}
      style={{
        ["--verzug" as string]: `${verzug}ms`,
        ...(aktiv ? { ["--tw-ring-color" as string]: region.akzent } : {}),
      }}
      aria-pressed={aktiv}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[1.05rem] font-semibold leading-snug text-tinte">{z.name}</h3>
          {/* Bei „sonstiges" stand hier ein Wort, das nichts aussagt. Dann
              lieber die Gemeinde — die hilft beim Einordnen wirklich. */}
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-tinte-zart">
            <ArtZeichen art={z.art} groesse={13} />
            {z.ortsziel
              ? `${z.zugaenge.length} Parkplätze im Ort`
              : z.art === "sonstiges"
                ? z.ort || "Parkplatz"
                : ART_TEXT[z.art]}
            {/* Der Gebietsname ist die Antwort auf „kennt der Gast das?" —
                „Neuhausenbrücke · Lattengebirge" sagt mehr als der Name allein. */}
            {!z.ortsziel && z.info?.gebiet && ` · ${z.info.gebiet}`}
            {!z.ortsziel && z.zugaenge.length > 1 && ` · ${z.zugaenge.length} Zugänge`}
          </p>
        </div>
        <span
          className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: farben.feld, color: farben.farbe }}
        >
          {st ? (stunde == null ? st.kurz : `Meist ${kleinAnfang(st.kurz)}`) : "Kein Verlauf"}
        </span>
      </div>

      {stunde != null ? (
        <p className="zahl text-sm text-tinte-weich">
          {z.tagesgang?.[stunde] != null
            ? `Um ${stunde}:00 Uhr typischerweise ${Math.round(z.tagesgang[stunde]!)} % belegt`
            : `Für ${stunde}:00 Uhr fehlt der Verlauf`}
        </p>
      ) : z.ampel === "veraltet" ? (
        <p className="zahl text-sm text-tinte-weich">
          Zuletzt gemeldet {alterText(z.alter_min)}
        </p>
      ) : z.metrik === "ampelstufe" ? (
        <AmpelStufen stufe={z.wert} farbe={farben.farbe} />
      ) : (
        <p className="zahl text-sm text-tinte-weich">
          {z.leihen ? messwertAbsicht(z, leihen) : messwertZiel(z)}
        </p>
      )}

      {zeigtSkala && <Vergleichsskala quote={z.quote!} farbe={farben.farbe} />}

      {stunde == null && z.ampel === "aufbau" && (
        <p className="text-[13px] leading-relaxed text-tinte-zart">
          Für diese Tageszeit fehlen noch Vergleichswerte.
        </p>
      )}

      {/* Dieselben Aussagen wie in der Ansage, nur kurz — und in derselben
          Reihenfolge der Stufenleiter, damit die Karte nicht etwas anderes
          empfiehlt als das Detailfeld daneben. */}
      {stunde != null ? null : z.zugang_tipp ? (
        <p
          className="rounded-xl px-3 py-2 text-[13px] leading-snug"
          style={{ background: "var(--color-frei-weich)", color: "#0b6b46" }}
        >
          <strong className="font-semibold">Anderer Zugang:</strong> {z.zugang_tipp.nach}
        </p>
      ) : z.spaeter ? (
        <p
          className="rounded-xl px-3 py-2 text-[13px] leading-snug"
          style={{ background: "var(--color-mittel-weich)", color: "#95580f" }}
        >
          <strong className="font-semibold">Lieber später:</strong>{" "}
          <span className="zahl">ab {z.spaeter.stunde}:00 Uhr</span> rund {z.spaeter.anteil} %
          ruhiger
        </p>
      ) : alternativeFuer(z, leihen) ? (
        <p
          className="rounded-xl px-3 py-2 text-[13px] leading-snug"
          style={{ background: "var(--color-frei-weich)", color: "#0b6b46" }}
        >
          <strong className="font-semibold">
            {leihen ? "Rad gibt es hier:" : "Heute besser dorthin:"}
          </strong>{" "}
          {alternativeFuer(z, leihen)!.name} · {alternativeFuer(z, leihen)!.km} km
          {alternativeFuer(z, leihen)!.begruendung && (
            <span className="mt-1 block opacity-90">
              {alternativeFuer(z, leihen)!.begruendung}
            </span>
          )}
        </p>
      ) : null}
    </button>
  );
}
