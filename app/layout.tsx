import type { Metadata } from "next";
import Link from "next/link";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import HinterDemTool from "@/components/HinterDemTool";
import Wortmarke from "@/components/Wortmarke";
import "./globals.css";

// Beide Schriften liefert Next selbst aus — kein Fremdaufruf zur Laufzeit,
// kein Layoutsprung beim Nachladen.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  // 800 kam fuer die Wortmarke dazu — der Schriftzug traegt sie, es gibt kein
  // zweites Bildelement daneben.
  weight: ["500", "600", "700", "800"],
  variable: "--schrift-display",
  display: "swap",
});
const text = Inter({
  subsets: ["latin"],
  variable: "--schrift-text",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://besucherpuls.friedemann-schuetz.de"),
  title: "Besucherpuls — wo ist gerade Platz?",
  description:
    "Live-Auslastung von Wanderparkplätzen, Bädern und Leihrad-Stationen in sieben Regionen. Ist es voll, nennt Besucherpuls die nächste Alternative mit Platz — aus offenen Daten.",
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: "Besucherpuls",
    title: "Besucherpuls — wo ist gerade Platz?",
    description:
      "Besucherlenkung aus offenen Daten: Ist ein Ziel voll, steht hier, wohin sonst.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${display.variable} ${text.variable}`}>
      <body className="min-h-dvh">
        {/* Die Startseite hatte gar keinen Kopf — die Marke stand nur in der
            Fussleiste und im Browser-Tab. */}
        <header className="border-b border-linie/70 bg-karte/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
            <Link
              href="/"
              className="text-tinte transition hover:opacity-80"
              aria-label="Besucherpuls — zur Startseite"
            >
              <Wortmarke />
            </Link>
            <span className="text-[13px] text-tinte-zart">
              Besucherlenkung aus offenen Daten
            </span>
          </div>
        </header>
        {children}
        <HinterDemTool />
        <footer className="border-t border-linie bg-karte">
          <div className="mx-auto max-w-6xl px-6 py-10">
            <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-7">
              <div className="max-w-sm">
                <span className="text-tinte">
                  <Wortmarke />
                </span>
                <p className="mt-1.5 text-sm leading-relaxed text-tinte-weich">
                  Demonstrator auf Basis offener Daten. Keine amtliche Auskunft, keine
                  personenbezogenen Daten — alle Quellen liefern aggregierte Zählwerte.
                </p>
              </div>
              <div className="max-w-xs text-sm leading-relaxed text-tinte-weich">
                <p className="font-medium text-tinte">Daten</p>
                {/* Die BayernCloud fehlte hier, ausgerechnet die groesste Quelle:
                    57 der 136 gezeigten Ziele kommen von dort. Reihenfolge nach
                    Gewicht. Die Anreicherung (Touren, POI-Texte) stammt ebenfalls
                    aus der BayernCloud, steht aber unter CC BY-SA — die Lizenz je
                    Objekt nennt die Zielkarte selbst. */}
                <p className="mt-1.5">
                  BayernCloud Tourismus (CC0) · Open Data Hub Südtirol · Stadt Wien ·
                  SprottenFlotte KielRegion (CC0) · Stadt Zürich (CC0) · Stadt Luzern ·
                  © OpenStreetMap-Mitwirkende, © CARTO
                </p>
              </div>
              <div className="text-sm leading-relaxed">
                <p className="font-medium text-tinte">Kontakt</p>
                <span className="mt-1.5 flex flex-col gap-1 text-tinte-weich">
                  <a
                    href="https://friedemann-schuetz.de"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-4 hover:text-tinte hover:underline"
                  >
                    friedemann-schuetz.de
                  </a>
                  <a
                    href="mailto:f.schuetz@posteo.de"
                    className="underline-offset-4 hover:text-tinte hover:underline"
                  >
                    f.schuetz@posteo.de
                  </a>
                  <a
                    href="https://friedemann-schuetz.de/impressum.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-4 hover:text-tinte hover:underline"
                  >
                    Impressum
                  </a>
                </span>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
