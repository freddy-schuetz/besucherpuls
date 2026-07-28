/**
 * Mini-Verlauf der letzten Stunden. Eigenes SVG, keine Chart-Bibliothek —
 * uebernommen aus dem Sparkline-Muster der Klima-Toolbox.
 */
export default function Verlauf({
  punkte,
  einheit,
  width = 280,
  height = 56,
}: {
  punkte: [string, number][];
  einheit: string;
  width?: number;
  height?: number;
}) {
  const werte = punkte.map((p) => p[1]).filter((v) => v != null && !Number.isNaN(v));
  if (werte.length < 2) {
    return (
      <p className="text-xs text-slate-500">
        Noch kein Verlauf — der Sammler läuft seit wenigen Minuten.
      </p>
    );
  }

  const min = Math.min(...werte);
  const max = Math.max(...werte);
  const spanne = max - min || 1;
  const pad = 4;
  const x = (i: number) => pad + (i / (werte.length - 1)) * (width - 2 * pad);
  const y = (v: number) => height - pad - ((v - min) / spanne) * (height - 2 * pad);

  const d = werte.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const flaeche = `${d} L${x(werte.length - 1).toFixed(1)},${height - pad} L${x(0).toFixed(1)},${height - pad} Z`;

  const von = new Date(punkte[0][0]);
  const bis = new Date(punkte[punkte.length - 1][0]);
  const stunden = Math.max(1, Math.round((bis.getTime() - von.getTime()) / 3600000));

  return (
    <figure className="space-y-1">
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Verlauf der letzten ${stunden} Stunden: von ${Math.round(min)} bis ${Math.round(max)} ${einheit}`}
      >
        <title>{`letzte ${stunden} Std.: ${Math.round(min)}–${Math.round(max)} ${einheit}`}</title>
        <path d={flaeche} fill="#0ea5e9" fillOpacity="0.12" />
        <path d={d} fill="none" stroke="#0284c7" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(werte.length - 1)} cy={y(werte[werte.length - 1])} r="3" fill="#0369a1" />
      </svg>
      <figcaption className="flex justify-between text-[11px] text-slate-500">
        <span>letzte {stunden} Std.</span>
        <span>
          {Math.round(min)}–{Math.round(max)} {einheit}
        </span>
      </figcaption>
    </figure>
  );
}
