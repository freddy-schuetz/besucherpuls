"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import ZielKarte, { AmpelStufen } from "@/components/ZielKarte";
import Tagesverlauf from "@/components/Tagesverlauf";
import Ansage from "@/components/Ansage";
import Zielsuche, { ArtZeichen } from "@/components/Zielsuche";
import {
  ART_TEXT,
  GAST_REIHENFOLGE,
  REGIONEN,
  STATUS_FARBE,
  messwertZiel,
  type Region,
} from "@/lib/regionen";
import {
  QUELLE_LABEL,
  alterText,
  einordnungText,
  type StatusAntwort,
  type ZielProps,
  type Zielart,
} from "@/lib/types";

const LiveMap = dynamic(() => import("@/components/LiveMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-still-weich" />,
});

const REFRESH_MS = 60_000;
const ERST_ZEIGEN = 9;

/** Wann jemand losfahren will. Die Zeit sortiert nach dem TYPISCHEN Wert dieser
 *  Stunde — mehr als „typischerweise" geben die Daten nicht her, und mehr wird
 *  auch nicht behauptet. */
const ZEITEN: { wert: string; text: string; stunde: number | null }[] = [
  { wert: "jetzt", text: "Jetzt", stunde: null },
  { wert: "nachmittag", text: "Heute Nachmittag", stunde: 15 },
  { wert: "morgen", text: "Morgen früh", stunde: 9 },
];

function wertFuerZeit(z: ZielProps, stunde: number | null): number | null {
  if (stunde == null) return z.auslastung ?? z.quote ?? null;
  if (!z.tagesgang) return null;
  return z.tagesgang[stunde];
}

export default function RegionAnsicht({ region }: { region: Region }) {
  const [daten, setDaten] = useState<StatusAntwort | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [alleZeigen, setAlleZeigen] = useState(false);
  const [suche, setSuche] = useState("");
  const [kategorie, setKategorie] = useState<Zielart | null>(null);
  const [zeit, setZeit] = useState("jetzt");
  const laeuft = useRef(false);
  const antwortBereich = useRef<HTMLDivElement | null>(null);

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

  /** Alle Ziele dieses Gebiets, nach Platz sortiert. */
  const ziele = useMemo(() => {
    if (!daten?.ziele) return [];
    return daten.ziele
      .filter((z) => z.gebiet === region.gruppe)
      .sort((a, b) => {
        const ra = GAST_REIHENFOLGE.indexOf(a.ampel);
        const rb = GAST_REIHENFOLGE.indexOf(b.ampel);
        if (ra !== rb) return ra - rb;
        return (a.auslastung ?? a.quote ?? 999) - (b.auslastung ?? b.quote ?? 999);
      });
  }, [daten, region.gruppe]);

  /**
   * Die Auswahl — und zwar EINE für Liste und Karte.
   *
   * Vorher filterte die Kategoriewahl nur die Liste: Wer „Bergbahn" wählte, sah
   * unten neun Einträge und auf der Karte weiterhin alle 52 Punkte. Beide
   * beziehen jetzt dieselbe Menge.
   */
  const auswahl = useMemo(() => {
    let liste = ziele;
    if (kategorie) liste = liste.filter((z) => (z.arten ?? [z.art]).includes(kategorie));
    const stunde = ZEITEN.find((x) => x.wert === zeit)?.stunde ?? null;
    if (stunde != null) {
      liste = liste
        .filter((z) => wertFuerZeit(z, stunde) != null)
        .slice()
        .sort((a, b) => (wertFuerZeit(a, stunde) ?? 999) - (wertFuerZeit(b, stunde) ?? 999));
    }
    return liste;
  }, [ziele, kategorie, zeit]);

  const sichtbar = useMemo(
    () => (alleZeigen ? auswahl : auswahl.slice(0, ERST_ZEIGEN)),
    [auswahl, alleZeigen],
  );

  const detail = useMemo(() => ziele.find((z) => z.id === gewaehlt) ?? null, [ziele, gewaehlt]);
  const hatTagesgang = useMemo(() => ziele.some((z) => z.tagesgang), [ziele]);
  const nurKapazitaet = useMemo(
    () => ziele.length > 0 && ziele.every((z) => z.status.art !== "vergleich"),
    [ziele],
  );

  const waehlen = useCallback((id: string) => {
    setGewaehlt(id);
    // Erst im nächsten Frame scrollen — sonst steht die Antwortkarte noch nicht.
    requestAnimationFrame(() =>
      antwortBereich.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }, []);

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
            {daten
              ? `${ziele.length} Ziele · Stand ${new Date(daten.erzeugt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`
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

        {/* ------------------------------------------------------- Einstieg */}
        {ziele.length > 0 && (
          <Zielsuche
            ziele={ziele}
            region={region}
            suche={suche}
            kategorie={kategorie}
            onSuche={setSuche}
            onKategorie={(k) => {
              setKategorie(k);
              setAlleZeigen(false);
            }}
            onZiel={waehlen}
          />
        )}

        {/* -------------------------------------------------------- Antwort
            ERST wenn ein Ziel gewählt ist. Vorher stand hier immer eine
            Empfehlung — auch dann, wenn niemand gesagt hatte, was er vorhat.
            Für jemanden, der zum Nebelhorn will, war „Alpsee P1 ist voll" eine
            Zufallsinfo. Ohne Eingabe sagt die Seite deshalb nichts mehr. */}
        {/* data-ziel am Kasten: welches Ziel die Karte gerade beantwortet. Macht
            von aussen prüfbar, dass ein Klick auf die Empfehlung wirklich dorthin
            führt — an blossem Text lässt sich das nicht festmachen. */}
        <div ref={antwortBereich} className="scroll-mt-4">
          {detail && (
            <section data-ziel={detail.id} className="karte auftauchen mt-6 overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-linie p-6 sm:p-7">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-tinte-zart">
                    <ArtZeichen art={detail.art} groesse={13} />
                    {detail.art === "sonstiges"
                      ? detail.ort || "Parkplatz"
                      : ART_TEXT[detail.art]}
                    {detail.zugaenge.length > 1 && ` · ${detail.zugaenge.length} Zugänge`}
                  </p>
                  <h2 className="mt-1.5 text-2xl font-semibold leading-tight text-tinte sm:text-[1.9rem]">
                    {detail.name}
                  </h2>
                  <div className="mt-2">
                    {detail.metrik === "ampelstufe" ? (
                      <AmpelStufen stufe={detail.wert} farbe={STATUS_FARBE[detail.ampel].farbe} />
                    ) : (
                      <p className="zahl text-sm text-tinte-weich">{messwertZiel(detail)}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold"
                    style={{
                      background: STATUS_FARBE[detail.ampel].feld,
                      color: STATUS_FARBE[detail.ampel].farbe,
                    }}
                  >
                    {detail.status.kurz}
                  </span>
                  <button
                    onClick={() => setGewaehlt(null)}
                    aria-label="Auswahl aufheben"
                    className="rounded-full border border-linie p-2 text-tinte-zart transition hover:text-tinte"
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="grid gap-6 p-6 sm:p-7 lg:grid-cols-[1.05fr_1fr]">
                <div className="space-y-4">
                  <Ansage z={detail} region={region} onZiel={waehlen} />

                  {einordnungText(detail) && (
                    <p className="text-sm leading-relaxed text-tinte-weich">
                      {einordnungText(detail)}
                    </p>
                  )}

                  {/* Mehrere Zugänge einzeln zeigen — das ist die konkrete
                      Handlungsinformation: nicht „am Alpsee ist Platz", sondern
                      an welchem der vier Parkplätze. */}
                  {detail.zugaenge.length > 1 && (
                    <div className="rounded-2xl border border-linie p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-tinte-zart">
                        Zugänge
                      </p>
                      <ul className="mt-3 space-y-2.5">
                        {detail.zugaenge.map((zg) => (
                          <li key={zg.id} className="flex items-center gap-3 text-sm">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ background: STATUS_FARBE[zg.ampel].farbe }}
                            />
                            <span className="min-w-0 flex-1 truncate text-tinte">{zg.name}</span>
                            <span className="zahl shrink-0 text-tinte-weich">
                              {zg.auslastung != null && zg.kapazitaet
                                ? `${Math.max(0, Math.round(zg.kapazitaet - (zg.auslastung / 100) * zg.kapazitaet))} frei`
                                : zg.status.kurz}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {detail.tagesgang ? (
                    <Tagesverlauf kurve={detail.tagesgang} akzent={region.akzent} />
                  ) : (
                    <div className="rounded-2xl border border-linie p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-tinte-zart">
                        Typischer Tagesverlauf
                      </p>
                      <p className="mt-2 text-[13px] leading-relaxed text-tinte-weich">
                        {detail.basis_tage > 0
                          ? "Der Verlauf hier ist über den Tag praktisch gleich — dann ist eine Kurve keine Information, sondern Zierde. Sie erscheint, sobald sich die Stunden erkennbar unterscheiden."
                          : "Wird aufgebaut: Für eine Tageskurve braucht es mehrere gemessene Tage."}
                      </p>
                    </div>
                  )}

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
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
                    <dt className="text-tinte-zart">Quelle</dt>
                    <dd className="text-right">
                      <a
                        href={detail.quelle_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-tinte underline underline-offset-4 hover:text-tinte-weich"
                      >
                        {QUELLE_LABEL[detail.quelle]}
                      </a>
                    </dd>
                  </dl>

                  <p className="text-[13px] leading-relaxed text-tinte-zart">{detail.hinweis}</p>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* ---------------------------------------------------------- Liste */}
        <section className="py-12 sm:py-14">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-xl font-semibold text-tinte">
              {kategorie ? ART_TEXT[kategorie] : "Alle Ziele"}{" "}
              <span className="text-sm font-normal text-tinte-zart">
                {zeit === "jetzt"
                  ? "— die mit dem meisten Platz zuerst"
                  : `— nach dem typischen Wert um ${ZEITEN.find((z) => z.wert === zeit)?.stunde}:00 Uhr`}
              </span>
            </h2>
            {hatTagesgang && (
              <div className="flex flex-wrap gap-1.5">
                {ZEITEN.map((z) => (
                  <button
                    key={z.wert}
                    onClick={() => setZeit(z.wert)}
                    className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                      zeit === z.wert
                        ? "text-white"
                        : "border border-linie bg-karte text-tinte-weich hover:border-tinte-zart hover:text-tinte"
                    }`}
                    style={zeit === z.wert ? { background: region.akzent } : undefined}
                  >
                    {z.text}
                  </button>
                ))}
              </div>
            )}
          </div>

          {nurKapazitaet && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-tinte-zart">
              Die Angaben stammen hier direkt aus der gemeldeten Auslastung. Der Vergleich
              mit sonst — „voller als üblich um diese Zeit" — kommt dazu, sobald genug Tage
              erfasst sind.
            </p>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sichtbar.map((z, i) => (
              <ZielKarte
                key={z.id}
                z={z}
                region={region}
                verzug={Math.min(i, 9) * 45}
                aktiv={z.id === gewaehlt}
                onWaehlen={() => waehlen(z.id)}
              />
            ))}
            {!auswahl.length && ziele.length > 0 && (
              <p className="col-span-full text-sm text-tinte-weich">
                {zeit === "jetzt"
                  ? "Für diese Auswahl liegt gerade nichts vor."
                  : `Bei „${ZEITEN.find((z) => z.wert === zeit)?.text}" zählen nur Ziele mit genug eigenem Verlauf — hier hat noch keines genug.`}
              </p>
            )}
            {!ziele.length &&
              [0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="karte h-40 animate-pulse bg-still-weich/40" />
              ))}
          </div>

          {auswahl.length > ERST_ZEIGEN && (
            <button
              onClick={() => setAlleZeigen((v) => !v)}
              className="mt-6 rounded-full border border-linie bg-karte px-5 py-2.5 text-sm font-semibold text-tinte transition hover:border-tinte-zart"
            >
              {alleZeigen ? "Weniger anzeigen" : `Alle ${auswahl.length} Ziele anzeigen`}
            </button>
          )}
        </section>

        {/* ---------------------------------------------------------- Karte */}
        <section className="pb-14 sm:pb-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-xl font-semibold text-tinte">Auf der Karte</h2>
            <p className="text-sm text-tinte-zart">
              {kategorie
                ? `${auswahl.length} ${ART_TEXT[kategorie]}-Ziele`
                : `${auswahl.length} Ziele`}
            </p>
          </div>
          <div className="karte mt-5 h-[26rem] overflow-hidden lg:h-[32rem]">
            <LiveMap
              ziele={auswahl}
              ausgewaehlt={gewaehlt}
              onSelect={waehlen}
              start={{ mitte: region.mitte, zoom: region.zoom }}
            />
          </div>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            {(
              [
                ["gruen", "Platz"],
                ["gelb", "Wird eng"],
                ["rot", "Voll"],
                ["aufbau", "Noch ohne Vergleich"],
                ["veraltet", "Keine Meldung"],
              ] as const
            ).map(([k, t]) => (
              <li key={k} className="flex items-center gap-2 text-[13px] text-tinte-weich">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: STATUS_FARBE[k].farbe }}
                />
                {t}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
