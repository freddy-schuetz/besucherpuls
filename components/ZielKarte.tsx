"use client";

import { gastStatus, messwertText, type Region } from "@/lib/regionen";
import { alterText, type SensorProps } from "@/lib/types";

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

/** Die ruhigste sinnvolle Stunde aus dem typischen Tagesverlauf. */
function ruhigereStunde(p: SensorProps): { stunde: number; anteil: number } | null {
  if (!p.tagesgang) return null;
  const jetzt = new Date().getHours();
  const max = Math.max(...p.tagesgang.filter((v): v is number => v != null), 0);
  const jetztWert = p.tagesgang[jetzt];
  if (jetztWert == null || max <= 0 || jetztWert < max * 0.25) return null;
  let beste: { stunde: number; anteil: number } | null = null;
  for (let i = 1; i <= 6; i++) {
    const h = (jetzt + i) % 24;
    const v = p.tagesgang[h];
    if (v == null || h < 7 || h > 20) continue;
    if (v < jetztWert * 0.7 && (!beste || v < p.tagesgang[beste.stunde]!)) {
      beste = { stunde: h, anteil: Math.round((1 - v / jetztWert) * 100) };
    }
  }
  return beste;
}

export default function ZielKarte({
  p,
  region,
  verzug,
  onWaehlen,
  aktiv,
}: {
  p: SensorProps;
  region: Region;
  verzug: number;
  onWaehlen: () => void;
  aktiv: boolean;
}) {
  const s = gastStatus(p);
  const spaeter = ruhigereStunde(p);
  // Die Skala vergleicht mit der Vergangenheit — sie darf nur erscheinen, wenn
  // die Aussage auch von dort kommt, nicht bei reiner Kapazitaetsangabe.
  const zeigtSkala = s.art === "vergleich" && p.quote != null;

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
        <h3 className="text-[1.05rem] font-semibold leading-snug text-tinte">{p.name}</h3>
        <span
          className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: s.feld, color: s.farbe }}
        >
          {s.kurz}
        </span>
      </div>

      {/* Die Zeile entfaellt, wo sie nur das Statusfeld wiederholen wuerde —
          bei einer gemeldeten Ampelstufe steht die Aussage schon oben rechts. */}
      {p.ampel === "veraltet" ? (
        <p className="zahl text-sm text-tinte-weich">
          Zuletzt gemeldet {alterText(p.alter_min)}
        </p>
      ) : p.metrik !== "ampelstufe" ? (
        <p className="zahl text-sm text-tinte-weich">{messwertText(p)}</p>
      ) : p.bezirk ? (
        <p className="text-sm text-tinte-weich">{p.bezirk}. Bezirk</p>
      ) : null}

      {zeigtSkala && <Vergleichsskala quote={p.quote!} farbe={s.farbe} />}

      {s.art === "keiner" && s.ampel === "aufbau" && (
        <p className="text-[13px] leading-relaxed text-tinte-zart">
          Für diese Tageszeit fehlen noch Vergleichswerte.
        </p>
      )}

      {p.alternative && (
        <p
          className="rounded-xl px-3 py-2 text-[13px] leading-snug"
          style={{ background: "var(--color-frei-weich)", color: "#0b6b46" }}
        >
          Mehr Platz bei <strong className="font-semibold">{p.alternative.name}</strong> ·{" "}
          {p.alternative.km} km
        </p>
      )}

      {!p.alternative && spaeter && (
        <p
          className="rounded-xl px-3 py-2 text-[13px] leading-snug"
          style={{ background: "var(--color-frei-weich)", color: "#0b6b46" }}
        >
          Ab <strong className="font-semibold zahl">{spaeter.stunde}:00 Uhr</strong> typischerweise
          rund {spaeter.anteil} % ruhiger
        </p>
      )}
    </button>
  );
}
