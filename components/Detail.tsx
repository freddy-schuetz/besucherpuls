import Verlauf from "./Verlauf";
import { AMPEL_FARBE, AMPEL_TEXT, QUELLE_LABEL, alterText, type SensorProps } from "@/lib/types";

/** Die Kernaussage in einem Satz — das ist der eigentliche Produktinhalt. */
function Kernsatz({ p }: { p: SensorProps }) {
  const ist = p.auslastung != null ? `${Math.round(p.auslastung)} %` : `${Math.round(p.wert)} ${p.einheit}`;

  if (p.ampel === "veraltet") {
    return (
      <p className="text-sm text-slate-600">
        Dieser Sensor hat zuletzt <strong>{alterText(p.alter_min)}</strong> gemeldet. Der angezeigte
        Wert ist der letzte bekannte, keine aktuelle Messung.
      </p>
    );
  }
  if (p.ampel === "aufbau") {
    return (
      <p className="text-sm text-slate-600">
        Aktuell <strong>{ist}</strong>. Für eine Einordnung fehlt noch die Vergleichsbasis — sie wird
        seit {p.basis_tage > 0 ? `${p.basis_tage} Tagen` : "heute"} aufgebaut.
      </p>
    );
  }
  const ref =
    p.auslastung != null && p.vergleichswert != null
      ? `${Math.round(p.vergleichswert)} %`
      : `${Math.round(p.vergleichswert ?? 0)} ${p.einheit}`;
  return (
    <p className="text-sm text-slate-700">
      Aktuell <strong>{ist}</strong>. Üblich sind zu dieser Zeit <strong>{ref}</strong> — das sind{" "}
      <strong>{p.quote} %</strong> des Normalwerts.
    </p>
  );
}

export default function Detail({ p, onClose }: { p: SensorProps; onClose: () => void }) {
  const farbe = AMPEL_FARBE[p.ampel];

  return (
    <aside className="flex h-full flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{p.name}</h2>
          <p className="text-xs text-slate-500">
            {p.ort} · {p.land}
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
          aria-label="Detailansicht schliessen"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-full" style={{ background: farbe }} aria-hidden />
        <span className="text-sm font-medium" style={{ color: farbe }}>
          {AMPEL_TEXT[p.ampel]}
        </span>
      </div>

      <Kernsatz p={p} />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-3 text-sm">
        <dt className="text-slate-500">Messwert</dt>
        <dd className="text-right tabular-nums text-slate-900">
          {p.wert} {p.einheit}
        </dd>

        {p.auslastung != null && (
          <>
            <dt className="text-slate-500">Auslastung</dt>
            <dd className="text-right tabular-nums text-slate-900">{p.auslastung} %</dd>
          </>
        )}
        {p.kapazitaet != null && (
          <>
            <dt className="text-slate-500">Kapazität</dt>
            <dd className="text-right tabular-nums text-slate-900">{p.kapazitaet}</dd>
          </>
        )}

        <dt className="text-slate-500">Stand</dt>
        <dd className="text-right text-slate-900">{alterText(p.alter_min)}</dd>

        {p.vergleichswert != null && (
          <>
            <dt className="text-slate-500">Vergleich</dt>
            <dd className="text-right text-slate-900">
              {p.vergleich_art === "wochentag_stunde" ? "Wochentag + Stunde" : "Tageszeit"}
            </dd>
          </>
        )}
        {p.basis_tage > 0 && (
          <>
            <dt className="text-slate-500">Basis</dt>
            <dd className="text-right tabular-nums text-slate-900">
              {p.basis_tage} Tage · {p.basis_n.toLocaleString("de-CH")} Messwerte
            </dd>
          </>
        )}
      </dl>

      <div className="border-t border-slate-100 pt-3">
        <Verlauf punkte={p.sparkline} einheit={p.auslastung != null ? "%" : p.einheit} />
      </div>

      <p className="border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
        {p.hinweis}
      </p>

      <p className="text-xs text-slate-400">
        Quelle:{" "}
        <a href={p.quelle_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">
          {QUELLE_LABEL[p.quelle]}
        </a>
      </p>
    </aside>
  );
}
