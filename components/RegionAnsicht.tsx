"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import ZielKarte from "@/components/ZielKarte";
import Tagesverlauf from "@/components/Tagesverlauf";
import {
  GAST_REIHENFOLGE,
  REGIONEN,
  STATUS_GAST,
  gastStatus,
  messwertText,
  type Region,
} from "@/lib/regionen";
import { QUELLE_LABEL, alterText, type SensorProps, type StatusAntwort } from "@/lib/types";

const LiveMap = dynamic(() => import("@/components/LiveMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-still-weich" />,
});

const REFRESH_MS = 60_000;
const ERST_ZEIGEN = 9;

/** Der eine Satz, der oben steht. Reihenfolge der Faelle ist Absicht:
 *  erst die Empfehlung (das Produkt), dann Entwarnung, dann Ehrlichkeit. */
function antwort(ziele: SensorProps[], region: Region) {
  // Nur empfehlen, wenn der Punkt nach der bereinigten Bewertung wirklich voll ist.
  // Ungefiltert schlug die Seite auch dann eine Alternative vor, wenn 209 von 340
  // Plaetzen frei waren — historisch ungewoehnlich, aber niemand muss deshalb
  // woandershin fahren.
  const mitAlternative = ziele.find(
    (p) => gastStatus(p).ampel === "rot" && p.alternative,
  );
  if (mitAlternative) {
    return {
      art: "empfehlung" as const,
      kopf: `${mitAlternative.name} ist voller als sonst`,
      text: `Bei ${mitAlternative.alternative!.name} ist gerade deutlich mehr Platz — ${mitAlternative.alternative!.km} km entfernt.`,
      ziel: mitAlternative.alternative!.id,
    };
  }
  const voll = ziele.filter((p) => gastStatus(p).ampel === "rot");
  if (voll.length) {
    // Wortwahl an die Quelle der Aussage binden: „voller als sonst" ist ein
    // Vergleich mit der Vergangenheit. Kommt die Zahl aus der gemeldeten
    // Auslastung, ist sie schlicht voll — das darf man nicht vermischen.
    const ausVergleich = voll.some((p) => gastStatus(p).art === "vergleich");
    const frei = ziele.filter((p) => gastStatus(p).ampel === "gruen");
    return {
      art: "warnung" as const,
      kopf: ausVergleich
        ? `${voll.length} ${voll.length === 1 ? region.ziel : region.zielPlural} voller als sonst`
        : `${voll.length} ${voll.length === 1 ? region.ziel : region.zielPlural} derzeit voll`,
      text: frei.length
        ? `Dafür haben ${frei.length} andere gerade Platz — sie stehen unten zuerst.`
        : "In der Nähe ist gerade nichts spürbar leerer — hier hilft eher ein anderer Zeitpunkt.",
      ziel: voll[0].id,
    };
  }
  const frei = ziele.filter((p) => gastStatus(p).ampel === "gruen");
  if (frei.length) {
    return {
      art: "entwarnung" as const,
      kopf: "Gerade entspannt",
      text: `${frei.length} von ${ziele.length} haben gerade gut Platz.`,
      ziel: frei[0].id,
    };
  }
  return {
    art: "aufbau" as const,
    kopf: "Noch keine Einordnung möglich",
    text: `Die Live-Werte laufen bereits, aber für diese Tageszeit fehlen noch Vergleichswerte. Sie entstehen mit jedem Tag, den ${region.name} mitgemessen wird.`,
    ziel: null,
  };
}

export default function RegionAnsicht({ region }: { region: Region }) {
  const [daten, setDaten] = useState<StatusAntwort | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [alleZeigen, setAlleZeigen] = useState(false);
  const laeuft = useRef(false);
  const kartenBereich = useRef<HTMLDivElement | null>(null);

  const holen = useCallback(async () => {
    if (laeuft.current) return;
    laeuft.current = true;
    try {
      const r = await fetch("/api/status", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.fehler ?? `HTTP ${r.status}`);
      setDaten(j as StatusAntwort);
      setFehler(null);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Unbekannter Fehler");
    } finally {
      laeuft.current = false;
    }
  }, []);

  useEffect(() => {
    holen();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") holen();
    }, REFRESH_MS);
    const beiSichtbar = () => {
      if (document.visibilityState === "visible") holen();
    };
    document.addEventListener("visibilitychange", beiSichtbar);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", beiSichtbar);
    };
  }, [holen]);

  const gefiltert = useMemo(() => {
    if (!daten) return null;
    const features = daten.features.filter((f) => f.properties.gruppe === region.gruppe);
    return { ...daten, features } satisfies StatusAntwort;
  }, [daten, region.gruppe]);

  const ziele = useMemo(() => {
    if (!gefiltert) return [];
    return [...gefiltert.features]
      .map((f) => f.properties)
      .sort((a, b) => {
        const ra = GAST_REIHENFOLGE.indexOf(gastStatus(a).ampel);
        const rb = GAST_REIHENFOLGE.indexOf(gastStatus(b).ampel);
        if (ra !== rb) return ra - rb;
        return (a.quote ?? 999) - (b.quote ?? 999);
      });
  }, [gefiltert]);

  const a = useMemo(() => (ziele.length ? antwort(ziele, region) : null), [ziele, region]);
  const detail = useMemo(() => ziele.find((p) => p.id === gewaehlt) ?? null, [ziele, gewaehlt]);

  // Bei 31 Baedern ist die volle Liste eine Zumutung — erst das Wesentliche.
  const sichtbar = useMemo(
    () => (alleZeigen ? ziele : ziele.slice(0, ERST_ZEIGEN)),
    [ziele, alleZeigen],
  );
  const nurKapazitaet = useMemo(
    () => ziele.length > 0 && ziele.every((p) => gastStatus(p).art !== "vergleich"),
    [ziele],
  );

  const waehlen = (id: string) => {
    setGewaehlt(id);
    kartenBereich.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <main>
      {/* ------------------------------------------------------------ Kopf */}
      <section
        className="himmel korn relative overflow-hidden"
        style={{ ["--ton-a" as string]: region.tonA, ["--ton-b" as string]: region.tonB }}
      >
        <div className="relative mx-auto max-w-6xl px-6 pb-12 pt-7 sm:pb-14">
          <nav className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full bg-karte/75 px-3 py-1.5 font-medium text-tinte-weich backdrop-blur transition hover:text-tinte"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M13 8H4m0 0 3.5-3.5M4 8l3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Besucherpuls
            </Link>
            {REGIONEN.filter((r) => r.slug !== region.slug).map((r) => (
              <Link
                key={r.slug}
                href={`/region/${r.slug}`}
                className="rounded-full px-3 py-1.5 text-tinte-weich transition hover:bg-karte/75 hover:text-tinte"
              >
                {r.name}
              </Link>
            ))}
          </nav>

          <p
            className="mt-8 text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: region.akzent }}
          >
            {region.name} · {region.aktivitaet}
          </p>
          <h1 className="mt-2.5 max-w-3xl text-[2.15rem] font-bold leading-[1.1] text-tinte sm:text-[3.1rem]">
            {region.frage}
          </h1>
          <p className="mt-4 max-w-2xl leading-relaxed text-tinte-weich">{region.versprechen}</p>

          <p className="zahl mt-5 text-sm text-tinte-zart">
            {gefiltert
              ? `${ziele.length} ${region.zielPlural} · Stand ${new Date(gefiltert.erzeugt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`
              : "Live-Werte werden geladen …"}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6">
        {fehler && (
          <p className="karte mt-6 px-5 py-4 text-sm text-tinte-weich">
            Die Live-Werte sind gerade nicht erreichbar ({fehler}). Der nächste Versuch läuft
            automatisch.
          </p>
        )}

        {/* --------------------------------------------------------- Antwort */}
        {a && (
          <section
            className="karte auftauchen relative -mt-6 overflow-hidden p-6 sm:-mt-8 sm:p-8"
            aria-live="polite"
          >
            <div
              className="absolute inset-y-0 left-0 w-1.5"
              style={{
                background:
                  a.art === "empfehlung" || a.art === "entwarnung"
                    ? "var(--color-frei)"
                    : a.art === "warnung"
                      ? "var(--color-voll)"
                      : "var(--color-still)",
              }}
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-tinte-zart">
              {a.art === "empfehlung"
                ? "Empfehlung"
                : a.art === "warnung"
                  ? "Gerade voll"
                  : a.art === "entwarnung"
                    ? "Gute Nachricht"
                    : "Hinweis"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold leading-tight text-tinte sm:text-[1.9rem]">
              {a.kopf}
            </h2>
            <p className="mt-2.5 max-w-2xl leading-relaxed text-tinte-weich">{a.text}</p>
            {a.ziel && (
              <button
                onClick={() => waehlen(a.ziel!)}
                className="mt-5 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ background: region.akzent }}
              >
                Auf der Karte zeigen
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M3 8h9m0 0L8.5 4.5M12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </section>
        )}

        {/* --------------------------------------------------------- Ziele */}
        <section className="py-12 sm:py-14">
          <h2 className="text-xl font-semibold text-tinte">
            Alle {region.zielPlural}
            <span className="ml-2 text-sm font-normal text-tinte-zart">
              — die mit dem meisten Platz zuerst
            </span>
          </h2>
          {nurKapazitaet && (
            // Einmal je Abschnitt statt auf jeder Karte: der Hinweis stand vorher
            // 31-mal untereinander und erschlug die eigentliche Information.
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-tinte-zart">
              Die Angaben stammen hier direkt aus der gemeldeten Auslastung. Der Vergleich
              mit sonst — „voller als üblich um diese Zeit" — kommt dazu, sobald genug Tage
              erfasst sind.
            </p>
          )}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sichtbar.map((p, i) => (
              <ZielKarte
                key={p.id}
                p={p}
                region={region}
                verzug={Math.min(i, 9) * 45}
                aktiv={p.id === gewaehlt}
                onWaehlen={() => waehlen(p.id)}
              />
            ))}
            {!ziele.length &&
              [0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="karte h-40 animate-pulse bg-still-weich/40" />
              ))}
          </div>
          {ziele.length > ERST_ZEIGEN && (
            <button
              onClick={() => setAlleZeigen((v) => !v)}
              className="mt-6 rounded-full border border-linie bg-karte px-5 py-2.5 text-sm font-semibold text-tinte transition hover:border-tinte-zart"
            >
              {alleZeigen
                ? "Weniger anzeigen"
                : `Alle ${ziele.length} ${region.zielPlural} anzeigen`}
            </button>
          )}
        </section>

        {/* --------------------------------------------------------- Karte */}
        <section ref={kartenBereich} className="pb-14 sm:pb-16">
          <h2 className="text-xl font-semibold text-tinte">Auf der Karte</h2>
          <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <div className="karte h-[26rem] overflow-hidden lg:h-[30rem]">
              <LiveMap
                daten={gefiltert}
                ausgewaehlt={gewaehlt}
                onSelect={setGewaehlt}
                start={{ mitte: region.mitte, zoom: region.zoom }}
              />
            </div>

            <aside className="karte flex flex-col gap-5 p-6">
              {detail ? (
                <>
                  <div>
                    <span
                      className="inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold"
                      style={{
                        background: gastStatus(detail).feld,
                        color: gastStatus(detail).farbe,
                      }}
                    >
                      {gastStatus(detail).kurz}
                    </span>
                    <h3 className="mt-3 text-lg font-semibold text-tinte">{detail.name}</h3>
                    <p className="zahl mt-1 text-sm text-tinte-weich">{messwertText(detail)}</p>
                  </div>

                  {detail.tagesgang && (
                    <Tagesverlauf kurve={detail.tagesgang} akzent={region.akzent} />
                  )}

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-linie pt-4 text-sm">
                    <dt className="text-tinte-zart">Stand</dt>
                    <dd className="zahl text-right text-tinte">{alterText(detail.alter_min)}</dd>
                    {detail.vergleich_tage > 0 && (
                      <>
                        <dt className="text-tinte-zart">Verglichen mit</dt>
                        <dd className="zahl text-right text-tinte">
                          {detail.vergleich_tage} Tagen
                        </dd>
                      </>
                    )}
                  </dl>

                  <p className="text-[13px] leading-relaxed text-tinte-zart">{detail.hinweis}</p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-tinte">
                    {region.ziel} auswählen
                  </h3>
                  <p className="text-sm leading-relaxed text-tinte-weich">
                    Tippe oben auf eine Karte oder auf einen Punkt in der Karte — hier erscheint
                    dann der typische Tagesverlauf und woher die Zahl kommt.
                  </p>
                  <ul className="mt-1 space-y-2 border-t border-linie pt-4">
                    {(["gruen", "gelb", "rot", "geschlossen"] as const).map((k) => (
                      <li key={k} className="flex items-center gap-2.5 text-sm text-tinte-weich">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: STATUS_GAST[k].farbe }}
                        />
                        {STATUS_GAST[k].kurz}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <p className="mt-auto border-t border-linie pt-4 text-[13px] text-tinte-zart">
                Quelle:{" "}
                <a
                  href={region.quelleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 hover:text-tinte-weich"
                >
                  {detail ? QUELLE_LABEL[detail.quelle] : region.quelle}
                </a>
              </p>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
