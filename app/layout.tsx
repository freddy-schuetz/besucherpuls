import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Besucherpuls — wie voll ist es gerade, und ist das viel?",
  description:
    "Fünf offene Live-Zählquellen aus vier Ländern auf einer Karte: Fussgängerzähler Luzern, Badegäste Zürich, Parkleitsysteme und Radzähler Südtirol, Leihrad-Stationen. Jeder Wert gegen seinen eigenen Normalwert eingeordnet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="bg-slate-50 text-slate-900 antialiased">
        {children}
        <footer className="border-t border-slate-200 bg-white px-3 py-3 text-center text-[11px] leading-relaxed text-slate-500">
          Demonstrator auf Basis offener Daten — keine amtliche Auskunft, keine personenbezogenen Daten.{" "}
          <span className="mt-0.5 block sm:mt-0 sm:inline">
            Daten: Stadt Luzern · Stadt Zürich (CC0) · Open Data Hub Südtirol · nextbike/GBFS (CC0) ·
            © OpenStreetMap-Mitwirkende, © CARTO
          </span>
          <span className="mt-1 block">
            <a
              href="https://friedemann-schuetz.de"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline"
            >
              friedemann-schuetz.de
            </a>
            {" · "}
            <a href="mailto:f.schuetz@posteo.de" className="underline-offset-2 hover:underline">
              f.schuetz@posteo.de
            </a>
            {" · "}
            <a
              href="https://friedemann-schuetz.de/impressum.html"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:underline"
            >
              Impressum
            </a>
          </span>
        </footer>
      </body>
    </html>
  );
}
