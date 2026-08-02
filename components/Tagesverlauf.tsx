"use client";

/**
 * Typischer Tagesverlauf als Saeulen, mit Markierung der aktuellen Stunde.
 *
 * Bewusst keine Achsenbeschriftung mit Zahlen: Der Gast will nicht wissen,
 * dass um 15 Uhr im Mittel 847 Personen da waren — er will sehen, wo im Tag
 * der Berg liegt und wo er selbst gerade steht.
 */
export default function Tagesverlauf({
  kurve,
  akzent,
}: {
  kurve: (number | null)[];
  akzent: string;
}) {
  const belegt = kurve.filter((v): v is number => v != null);
  if (belegt.length < 6) return null;

  const jetzt = new Date().getHours();
  const max = Math.max(...belegt, 1);

  return (
    <figure>
      <figcaption className="text-sm font-medium text-tinte">
        So läuft ein typischer Tag hier
      </figcaption>
      <div className="mt-3 flex h-24 items-end gap-[3px]">
        {kurve.map((v, h) => {
          const ist = h === jetzt;
          const hoehe = v == null ? 2 : Math.max(3, (v / max) * 100);
          return (
            // h-full ist entscheidend: Ohne Hoehe am Wrapper loest die
            // Prozenthoehe der Saeule gegen null auf — die Grafik blieb leer,
            // nur Achse und "jetzt"-Fahne standen da.
            <div key={h} className="relative flex h-full flex-1 items-end">
              <div
                className="w-full rounded-t-[3px] transition-[height] duration-500"
                style={{
                  height: `${hoehe}%`,
                  background: ist ? akzent : v == null ? "var(--color-still-weich)" : "#dfe4e0",
                }}
              />
              {ist && (
                <span
                  className="absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
                  style={{ background: akzent, bottom: `calc(${hoehe}% + 4px)` }}
                >
                  jetzt
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-tinte-zart">
        <span>0 Uhr</span>
        <span>6</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </figure>
  );
}
