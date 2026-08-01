"use client";

/**
 * Typischer Tagesverlauf: je Stunde der Median aller beobachteten Tage,
 * mit Markierung der aktuellen Stunde.
 *
 * Das ist der Inhalt des Schaufensters "Ausweichen in der Zeit": Wer sieht,
 * dass die Kurve zwei Stunden spaeter deutlich abfaellt, braucht kein anderes
 * Ziel — nur einen anderen Zeitpunkt. Bewusst die Kurve statt einer einzelnen
 * Zahl, weil erst der Verlauf die Frage "wann denn sonst" beantwortet.
 */
export default function Tagesgang({
  kurve,
  einheit,
  width = 280,
  height = 72,
}: {
  kurve: (number | null)[];
  einheit: string;
  width?: number;
  height?: number;
}) {
  const belegt = kurve.filter((v): v is number => v != null);
  if (belegt.length < 6) return null;

  const jetztStunde = new Date().getHours();
  const max = Math.max(...belegt, 1);
  const pad = 4;
  const bodenH = 12;
  const nutzH = height - pad - bodenH;
  const bw = (width - 2 * pad) / 24;

  // Ruhigste Stunde in den naechsten sechs — das ist die eigentliche Empfehlung.
  // Nur Stunden, zu denen ein Besuch ueberhaupt in Frage kommt: Ohne diese Grenze
  // riet die Seite um 23 Uhr zu "0:00 Uhr, typischerweise deutlich ruhiger" —
  // rechnerisch richtig, als Rat an einen Wanderer unsinnig.
  const spaeter: { h: number; v: number }[] = [];
  for (let i = 1; i <= 6; i++) {
    const h = (jetztStunde + i) % 24;
    const v = kurve[h];
    if (v != null && h >= 7 && h <= 20) spaeter.push({ h, v });
  }
  const jetztWert = kurve[jetztStunde];
  const besser =
    jetztWert != null && spaeter.length
      ? spaeter.reduce((a, b) => (b.v < a.v ? b : a))
      : null;
  // Und nur, wenn jetzt ueberhaupt etwas los ist — sonst vergleicht man Stille
  // mit Stille und verkauft das als Tipp.
  const lohnt = besser && jetztWert != null && jetztWert > max * 0.25 && besser.v < jetztWert * 0.7;

  return (
    <figure className="space-y-1">
      <figcaption className="text-xs font-medium text-slate-600">
        Typischer Tagesverlauf
      </figcaption>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Typischer Tagesverlauf, Höchstwert ${Math.round(max)} ${einheit} um ${kurve.indexOf(max)} Uhr`}
      >
        {kurve.map((v, h) => {
          if (v == null) return null;
          const hoehe = Math.max(1, (v / max) * nutzH);
          const ist = h === jetztStunde;
          const empfohlen = lohnt && besser && h === besser.h;
          return (
            <rect
              key={h}
              x={pad + h * bw + 0.5}
              y={pad + nutzH - hoehe}
              width={Math.max(1, bw - 1)}
              height={hoehe}
              rx="1"
              fill={ist ? "#dc2626" : empfohlen ? "#16a34a" : "#cbd5e1"}
            />
          );
        })}
        {[0, 6, 12, 18].map((h) => (
          <text
            key={h}
            x={pad + h * bw + bw / 2}
            y={height - 2}
            textAnchor="middle"
            className="fill-slate-400"
            style={{ fontSize: 9 }}
          >
            {h}
          </text>
        ))}
      </svg>
      <p className="text-[11px] leading-snug text-slate-500">
        {lohnt && besser ? (
          <>
            Rot ist jetzt. Grün ist{" "}
            <strong className="text-emerald-700">{besser.h}:00 Uhr</strong> — typischerweise
            deutlich ruhiger.
          </>
        ) : (
          <>Rot markiert die aktuelle Stunde. Höchstwert {Math.round(max)} {einheit}.</>
        )}
      </p>
    </figure>
  );
}
