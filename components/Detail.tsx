import Verlauf from "./Verlauf";
import Tagesgang from "./Tagesgang";
import {
  AMPEL_FARBE,
  AMPEL_TEXT,
  QUELLE_LABEL,
  alterText,
  einordnungText,
  type SensorProps,
} from "@/lib/types";

const VERGLEICH_TEXT: Record<string, string> = {
  wochentag_stunde: "gleicher Wochentag, gleiche Stunde",
  werktag_stunde: "Werktage, gleiche Stunde",
  wochenende_stunde: "Wochenende, gleiche Stunde",
  stunde: "alle Tage, gleiche Stunde",
};

/** Die Kernaussage in einem Satz — das ist der eigentliche Produktinhalt. */
function Kernsatz({ p }: { p: SensorProps }) {
  const ist =
    p.metrik === "ampelstufe"
      ? `Stufe ${p.wert} von 5`
      : p.auslastung != null
        ? `${Math.round(p.auslastung)} %`
        : `${Math.round(p.wert)} ${p.einheit}`;

  if (p.ampel === "veraltet") {
    return (
      <p className="text-sm text-slate-600">
        Dieser Sensor hat zuletzt <strong>{alterText(p.alter_min)}</strong> gemeldet. Der angezeigte
        Wert ist der letzte bekannte, keine aktuelle Messung.
      </p>
    );
  }
  if (p.ampel === "aufbau") {
    const seit =
      p.basis_tage >= 2 ? `seit ${p.basis_tage} Tagen` : p.basis_tage === 1 ? "seit gestern" : "seit heute";
    // Zwei sehr verschiedene Faelle, die vorher beide "wird aufgebaut" hiessen:
    // gar keine Historie — oder Historie, aber nichts fuer DIESE Stunde (nachts
    // an einem Bad zum Beispiel). Das zweite ist kein Mangel, sondern Normalfall.
    const nurDieseStunde = p.basis_tage >= 5;
    return (
      <p className="text-sm text-slate-600">
        Aktuell <strong>{ist}</strong>.{" "}
        {nurDieseStunde ? (
          <>
            Für <em>diese Tageszeit</em> liegen noch keine Vergleichswerte vor — an diesem Ort
            wurde zu dieser Stunde bisher nichts gemessen.
          </>
        ) : (
          <>
            Für eine Einordnung fehlt noch die Vergleichsbasis — sie wird {seit} aufgebaut und ist
            ab etwa fünf Tagen belastbar.
          </>
        )}
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-sm text-slate-700">
        Aktuell <strong>{ist}</strong>.
      </p>
      <p className="text-sm text-slate-700">{einordnungText(p)}</p>
    </div>
  );
}

/** Der Schritt von „ist voll" zu „geh dorthin". */
function Empfehlung({ p }: { p: SensorProps }) {
  if (p.ampel !== "rot" && p.ampel !== "gelb") return null;

  if (!p.alternative) {
    return (
      <p className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Keine leerere Alternative in der Nähe — hier hilft nur ein anderer Zeitpunkt.
      </p>
    );
  }
  const a = p.alternative;
  return (
    <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2.5">
      <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">Ausweichen</p>
      <p className="mt-1 text-sm text-emerald-950">
        <strong>{a.name}</strong> ist gerade deutlich leerer — {a.km} km entfernt.
      </p>
      <p className="mt-0.5 text-xs text-emerald-800">
        Dort {a.quote} % statt {p.quote} % Auslastungsrang.
      </p>
    </div>
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
      <Empfehlung p={p} />

      {p.tagesgang && (
        <div className="border-t border-slate-100 pt-3">
          <Tagesgang kurve={p.tagesgang} einheit={p.auslastung != null ? "%" : p.einheit} />
        </div>
      )}

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
        {p.kapazitaet != null && p.metrik !== "ampelstufe" && (
          <>
            <dt className="text-slate-500">Kapazität</dt>
            <dd className="text-right tabular-nums text-slate-900">{p.kapazitaet}</dd>
          </>
        )}

        <dt className="text-slate-500">Stand</dt>
        <dd className="text-right text-slate-900">{alterText(p.alter_min)}</dd>

        {p.vergleich_art && (
          <>
            <dt className="text-slate-500">Verglichen mit</dt>
            <dd className="text-right text-slate-900">
              {VERGLEICH_TEXT[p.vergleich_art] ?? p.vergleich_art}
            </dd>
          </>
        )}
        {p.vergleich_tage > 0 && (
          <>
            <dt className="text-slate-500">Vergleichstage</dt>
            <dd className="text-right tabular-nums text-slate-900">{p.vergleich_tage}</dd>
          </>
        )}
        {p.basis_tage > 0 && (
          <>
            <dt className="text-slate-500">Basis insgesamt</dt>
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
        <a
          href={p.quelle_url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-slate-600"
        >
          {QUELLE_LABEL[p.quelle]}
        </a>
      </p>
    </aside>
  );
}
