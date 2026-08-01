import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";

// Beide Schriften liefert Next selbst aus — kein Fremdaufruf zur Laufzeit,
// kein Layoutsprung beim Nachladen.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--schrift-display",
  display: "swap",
});
const text = Inter({
  subsets: ["latin"],
  variable: "--schrift-text",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Besucherpuls — wo ist gerade Platz?",
  description:
    "Live-Auslastung von Wanderparkplätzen, Bädern und Leihrad-Stationen in vier Regionen. Ist es voll, nennt Besucherpuls die nächste Alternative mit Platz — aus offenen Daten.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${display.variable} ${text.variable}`}>
      <body className="min-h-dvh">
        {children}
        <footer className="border-t border-linie bg-karte">
          <div className="mx-auto max-w-6xl px-6 py-10">
            <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-7">
              <div className="max-w-sm">
                <p className="font-display text-base font-semibold text-tinte">Besucherpuls</p>
                <p className="mt-1.5 text-sm leading-relaxed text-tinte-weich">
                  Demonstrator auf Basis offener Daten. Keine amtliche Auskunft, keine
                  personenbezogenen Daten — alle Quellen liefern aggregierte Zählwerte.
                </p>
              </div>
              <div className="max-w-xs text-sm leading-relaxed text-tinte-weich">
                <p className="font-medium text-tinte">Daten</p>
                <p className="mt-1.5">
                  Open Data Hub Südtirol · Stadt Zürich (CC0) · Stadt Wien · SprottenFlotte
                  KielRegion (CC0) · Stadt Luzern · © OpenStreetMap-Mitwirkende, © CARTO
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
