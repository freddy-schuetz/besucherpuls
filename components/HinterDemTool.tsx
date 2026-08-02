/**
 * „Wer steckt dahinter?" — der Abschnitt über der Fussleiste.
 *
 * Eine Akquise-Demo, die niemanden nennt, ist eine Visitenkarte ohne Namen.
 * Wer die Seite interessant findet, soll in derselben Ansicht sehen, wer sie
 * gebaut hat und was er sonst tut — ohne einen Klick auf eine andere Domain.
 *
 * Bewusst ohne "use client": reine Auszeichnung, kein Zustand.
 */
const SCHWERPUNKTE = [
  "n8n",
  "KI-Agenten",
  "Self-Hosted",
  "Workshops",
  "DSGVO-konform",
  "API-Integrationen",
];

export default function HinterDemTool() {
  return (
    <section className="border-t border-linie bg-flaeche">
      <div className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-tinte-zart">
          Hinter dem Tool
        </p>

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,17rem)_1fr] lg:gap-14">
          {/* Person */}
          <div>
            <p className="font-display text-2xl font-semibold leading-tight text-tinte">
              Friedemann Schütz
            </p>
            <p className="mt-2 text-sm leading-relaxed text-tinte-weich">
              (AI) Automation Expert
              <br />
              n8n Ambassador
              <br />
              Essen, Deutschland
            </p>
          </div>

          {/* Text */}
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold text-tinte">Wer steckt dahinter?</h2>
            <p className="mt-3 leading-relaxed text-tinte-weich">
              Ich unterstütze Unternehmen dabei, Prozesse zu automatisieren, KI sinnvoll
              einzusetzen und beides idealerweise auf eigener Infrastruktur zu betreiben —
              ohne Cloud-Zwang, datenschutzfreundlich, praxisnah.
            </p>
            <p className="mt-3 leading-relaxed text-tinte-weich">
              Schwerpunkte sind n8n-Workflows, KI-Agenten und Self-Hosted-Setups. Ich
              arbeite mit Kund:innen aus Tourismus, Technologie und Beratung — von
              kompakten Workshop-Formaten bis zu projektbasierten Implementierungen.
              Besucherpuls ist eines meiner Tools, das zeigt, was mit dem Stack
              alltagstauglich möglich ist.
            </p>

            <ul className="mt-5 flex flex-wrap gap-2">
              {SCHWERPUNKTE.map((s) => (
                <li
                  key={s}
                  className="rounded-full border border-linie bg-karte px-3 py-1.5 text-[13px] font-medium text-tinte-weich"
                >
                  {s}
                </li>
              ))}
            </ul>

            <a
              href="https://friedemann-schuetz.de"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-tinte transition-[gap] hover:gap-2.5"
            >
              Mehr auf friedemann-schuetz.de
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M3 8h9m0 0L8.5 4.5M12 8l-3.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
