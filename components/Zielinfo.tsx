"use client";

import type { ZielProps } from "@/lib/types";

/**
 * Was es an diesem Ziel gibt — jenseits der Auslastung.
 *
 * Ein Gast kennt „Neuhausenbrücke" nicht, wohl aber die „Berchtesgadener
 * Alpen"; er kennt „Feuerwehrhaus" nicht, wohl aber „Balderschwang". Und wenn
 * die Seite ihn woandershin schickt, will er wissen, was ihn dort erwartet.
 *
 * ALLES HIER IST BELEGT. Die Felder stammen aus scripts/anreichern.py und sind
 * in lib/ziele.json eingefroren: Gebietsname per Punkt-in-Fläche aus
 * OpenStreetMap, Tour aus der BayernCloud, Badtyp aus den städtischen
 * Sportstätten-Datensätzen. Wo eine Quelle nichts hergibt, steht nichts —
 * lieber eine kurze Karte als eine erfundene Beschreibung. Genau daran ist die
 * Wikipedia-Anreicherung gescheitert: „Nebelhorn" liefert dort den Artikel
 * über das Schiffssignalhorn, mit Bild.
 */
/** „https://creativecommons.org/licenses/by-sa/4.0/" → „CC BY-SA 4.0".
 *  Die BayernCloud liefert die Lizenz als URL; roh angezeigt ist das eine
 *  Zeile Fussnoten-Rauschen unter jeder Tour. Die Nennung bleibt Pflicht,
 *  nur die Form wird lesbar. */
function lizenzKurz(l: string): string {
  const m = l.match(/licenses\/([a-z-]+)\/([\d.]+)/i);
  if (m) return `CC ${m[1].toUpperCase()} ${m[2]}`;
  if (/publicdomain|zero/i.test(l)) return "CC0";
  return l.length > 28 ? "siehe Quelle" : l;
}

export default function Zielinfo({ z }: { z: ZielProps }) {
  const i = z.info ?? {};
  const t = i.tour;

  const hatOrt = i.gebiet || i.schutzgebiet;
  const hatTour = t && (t.km || t.hm);
  const hatBad = i.badtyp || i.ausstattung?.length;
  const hatLage = i.lage?.length;
  if (!hatOrt && !hatTour && !hatBad && !hatLage) return null;

  const LAGE_TEXT: Record<string, string> = {
    strand: "am Strand",
    hafen: "am Hafen",
    bahnhof: "am Bahnhof",
    see: "am See",
  };

  return (
    <div className="rounded-2xl border border-linie p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-tinte-zart">
        Was dich hier erwartet
      </p>

      {hatOrt && (
        <p className="mt-2.5 text-sm leading-relaxed text-tinte">
          {i.gebiet}
          {i.schutzgebiet && i.schutzgebiet !== i.gebiet && (
            <>
              {i.gebiet && " · "}
              <span className="font-medium">{i.schutzgebiet}</span>
            </>
          )}
        </p>
      )}

      {hatLage && (
        <p className="mt-1.5 text-sm text-tinte-weich">
          {i.lage!.map((l) => LAGE_TEXT[l] ?? l).join(" · ")}
        </p>
      )}

      {hatBad && (
        <p className="mt-1.5 text-sm text-tinte-weich">
          {i.badtyp}
          {i.drinnen != null && ` · ${i.drinnen ? "drinnen" : "im Freien"}`}
          {i.ausstattung?.length ? ` · ${i.ausstattung.join(", ")}` : ""}
        </p>
      )}

      {i.oeffnung?.some(Boolean) && (
        <p className="zahl mt-1.5 text-[13px] text-tinte-zart">
          Heute {i.oeffnung[(new Date().getDay() + 6) % 7] ?? "—"}
        </p>
      )}

      {hatTour && (
        <div className="mt-3 border-t border-linie pt-3">
          <p className="text-sm font-medium text-tinte">
            {t!.rund ? "Rundweg ab hier" : "Wanderung ab hier"}
          </p>
          {t!.name && (
            <p className="mt-0.5 text-sm leading-snug text-tinte-weich">{t!.name}</p>
          )}
          <p className="zahl mt-1.5 text-[13px] text-tinte-weich">
            {[
              t!.km != null && `${t!.km.toFixed(1).replace(".", ",")} km`,
              t!.hm != null && `${t!.hm} Höhenmeter`,
              t!.min != null && `${Math.round(t!.min / 60)} Std.`,
              t!.schwierigkeit,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {t!.quelle && (
            <p className="mt-1.5 text-[12px] text-tinte-zart">
              {t!.quelle}
              {t!.lizenz && ` · ${lizenzKurz(t!.lizenz)}`}
            </p>
          )}
        </div>
      )}

      {i.gebiet && (
        <p className="mt-3 text-[12px] text-tinte-zart">
          Gebietszuordnung: © OpenStreetMap-Mitwirkende (ODbL)
        </p>
      )}
    </div>
  );
}
