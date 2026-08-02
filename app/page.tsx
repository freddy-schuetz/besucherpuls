import RegionKacheln from "@/components/RegionKacheln";

const SCHRITTE = [
  {
    titel: "Zählen, wo wirklich gezählt wird",
    text: "Radarsensoren an Brücken, Zugangszähler in Bädern, Parkleitsysteme an Pässen, Docks an Leihrad-Stationen. Alles offene Daten, alles aggregiert — keine einzelne Person.",
  },
  {
    titel: "Einordnen statt nur anzeigen",
    text: "„140 Gäste“ sagt nichts. Jeder Wert wird gegen den eigenen Verlauf gehalten: War es an vergleichbaren Tagen um diese Uhrzeit voller oder leerer?",
  },
  {
    titel: "Alternative nennen, bevor es kippt",
    text: "Ist ein Ziel voller als gewohnt, steht daneben, welches in der Nähe gerade Platz hat — und zu welcher Stunde es dort typischerweise ruhiger wird.",
  },
];

export default function Startseite() {
  return (
    <main>
      {/* ------------------------------------------------------------ Kopf */}
      <section
        className="himmel korn relative overflow-hidden"
        style={{ ["--ton-a" as string]: "#bfe6d5", ["--ton-b" as string]: "#f6d9bb" }}
      >
        <div className="relative mx-auto max-w-6xl px-6 pb-12 pt-14 sm:pb-14 sm:pt-20">
          <span className="inline-flex items-center gap-2 rounded-full bg-karte/80 px-3.5 py-1.5 text-xs font-semibold text-tinte-weich shadow-sm backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
                style={{ background: "var(--color-frei)" }}
              />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "var(--color-frei)" }} />
            </span>
            Live aus offenen Daten · aktualisiert alle 5 Minuten
          </span>

          <h1 className="mt-7 max-w-3xl text-[2.6rem] font-bold leading-[1.05] text-tinte sm:text-[3.9rem]">
            Wo ist gerade Platz?
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-tinte-weich sm:text-xl">
            Besucherpuls zeigt für sieben Regionen, wie voll die beliebten Ziele gerade sind —
            und nennt die nächste Alternative, wenn es eng wird. Nicht als Warnung hinterher,
            sondern als Vorschlag vorher.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-3 text-sm text-tinte-weich">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-frei)" }} />
              Viel Platz
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-mittel)" }} />
              Normal viel los
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-voll)" }} />
              Voller als sonst
            </span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ Regionen */}
      <section className="mx-auto max-w-6xl px-6 py-11 sm:py-12">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-tinte sm:text-3xl">Sieben Regionen, sieben Fragen</h2>
            <p className="mt-2 max-w-xl text-tinte-weich">
              Jede Region misst etwas anderes — Parkplätze, Badegäste, Rückgabeplätze. Die
              Aussage bleibt dieselbe.
            </p>
          </div>
        </div>
        <RegionKacheln />
      </section>

      {/* ------------------------------------------------------------ Methode */}
      <section className="border-t border-linie bg-karte">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
          <h2 className="text-2xl font-semibold text-tinte sm:text-3xl">Wie das funktioniert</h2>
          <ol className="mt-9 grid gap-9 sm:grid-cols-3">
            {SCHRITTE.map((s, i) => (
              <li key={s.titel}>
                <span className="zahl flex h-9 w-9 items-center justify-center rounded-full bg-flaeche text-sm font-semibold text-tinte">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold text-tinte">{s.titel}</h3>
                <p className="mt-2 text-sm leading-relaxed text-tinte-weich">{s.text}</p>
              </li>
            ))}
          </ol>

          <div className="mt-11 grid max-w-4xl gap-7 border-t border-linie pt-7 sm:grid-cols-2">
            <p className="text-sm leading-relaxed text-tinte-weich">
              <strong className="font-semibold text-tinte">Ehrlich bleiben gehört dazu.</strong>{" "}
              Wo die Vergleichswerte für eine Tageszeit noch fehlen, steht das da — statt einer
              Farbe, die Sicherheit vortäuscht. Meldet ein Zähler seit Tagen nichts, wird auch das
              gesagt und nicht der letzte bekannte Wert als aktuell ausgegeben. Eine flache
              Tageskurve wird gar nicht erst gezeichnet: Eine gerade Linie ist kein Tagesverlauf.
            </p>
            {/* Der Plan verlangt, die aussortierten Punkte zu NENNEN, nicht nur
                auszusortieren. Ein Geber, der mehr Belegte als Plätze meldet,
                misst nicht — und genau solche standen vorher in den Empfehlungen,
                weil ihre konstante Historie jeden Wert „völlig normal" fand. */}
            <p className="text-sm leading-relaxed text-tinte-weich">
              <strong className="font-semibold text-tinte">Was aussortiert wurde.</strong> Ein
              Geber, der mehr Belegte als Plätze meldet, misst nicht — beim letzten Abruf traf das
              auf 8 der rund 110 bayerischen Parkplätze zu (Alpsee P1: 389 Belegte bei 140
              Plätzen, Vitalpark: 1 819 bei 200). Die stehen nicht auf der Karte. Bei der Historie
              dasselbe: Von 104 abrufbaren Zeitreihen liegen 49 über 105 % oder zeigen über drei
              Jahre weniger als fünf verschiedene Werte — importiert sind 55. Ein Zähler, der
              nicht misst, ist schlechter als kein Zähler.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
