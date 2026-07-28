# Besucherpuls

**Wie voll ist es gerade — und ist das viel?**

Fünf offene Live-Zählquellen aus vier Ländern auf einer Karte. Jeder Wert wird nicht
gegen eine Kapazität gehalten, sondern gegen **den eigenen Normalwert für diese
Tageszeit**. Erst dadurch werden Personen, Parkplätze und Leihräder vergleichbar —
und erst dadurch sagt eine Live-Zahl überhaupt etwas.

> „37 Personen auf der Kapellbrücke — normal sind um diese Zeit 15."

## Die Quellen

| Quelle | Was gezählt wird | Takt | Historie | Lizenz |
|---|---|---|---|---|
| Stadt Luzern (Devicecounter) | Fussgängerstrom, u.a. Radarsensor Kapellbrücke | ~5 Min | ❌ | OGD Stadt Luzern |
| Stadt Zürich (Crowd Monitor) | Badegäste in See-, Fluss- und Freibädern | ~2 Std | ✅ ~4 Tage | CC0 |
| Open Data Hub Südtirol | freie Parkplätze (Dolomitenpässe, Seilbahnen, Kurorte) | 1–5 Min | ✅ 14 Tage importiert | CC0/CC-BY |
| Open Data Hub Südtirol | Eco-Counter an Radwegen (Vinschgau, Drauradweg) | stündlich, **~28 h Verzug** | ⚠️ siehe unten | CC0/CC-BY |
| nextbike (GBFS) | verfügbare Räder je Region (Usedom, Neusiedler See, Luzern) | 60 s | ❌ | CC0 |

**Keine personenbezogenen Daten.** Alle Quellen liefern aggregierte Zählwerte.

## Architektur

Muster A — die gesamte Logik liegt in n8n, das Frontend ist ein dünner Proxy.

```
n8n  besucherpuls-collect   Schedule 5 Min → 5 Quellen → Data Table besucherpuls_puffer
                                                       → Puffer > 72 h löschen
n8n  besucherpuls-status    Webhook GET (x-bp-secret) → Profil + Puffer → GeoJSON
Next app/api/status         Server-Route, reicht durch, kein Cache
Next app/page.tsx           Karte + Liste + Detail, Refresh alle 60 s
```

### Warum 5 Minuten und nicht schneller

Schneller pollen als die Quelle liefert erzeugt nur Duplikate: GBFS hat `ttl` 60 s, Luzern
aktualisiert ~5-minütlich, die Südtiroler Radzähler haben `mperiod` 900. Und mehr Rohdaten
*verringern* die Statistik-Freiheit in n8n, weil ein Code-Node Items in den Speicher lädt.
Deshalb zwei Tabellen mit konstanter Grösse statt einer wachsenden:

* `besucherpuls_puffer` — 72 h in voller Auflösung, für den Verlauf
* `besucherpuls_profil` — eine Zeile je Sensor, Vergleichsraster als JSON

Das Raster hat zwei Ebenen: `h` (Median je Stunde) und `dh` (Median je Wochentag × Stunde,
nur wo n ≥ 3). Der Status-Webhook nimmt `dh`, wenn die Zelle existiert, sonst `h`. Diese
Zweistufigkeit ist nötig, weil die Zürcher Reihe nur rund vier Tage zurückreicht — für ein
Wochentagsraster zu wenig, für ein Stundenraster genug.

## Ehrlichkeiten, die im Produkt sichtbar sind

* **Frischeprüfung je Quelle.** Eine pauschale Grenze wäre falsch: Die Südtiroler Radzähler
  liefern regulär mit rund einem Tag Verzug, GBFS im Minutentakt. Wer beides gleich behandelt,
  erklärt funktionierende Zähler zu Ausfällen. Schwellen: Luzern 180 Min, Zürich 240,
  Südtirol-Parken 60, Südtirol-Rad 2880, GBFS 30.
* **Tote Sensoren werden grau gezeigt, nicht versteckt.** In Luzern liefern drei von sechs
  Sensoren seit Tagen bis Wochen nichts (Löwendenkmal zuletzt vor 51 Tagen). Das steht mit
  Altersangabe da, statt eine alte Zahl als aktuell auszugeben.
* **Fehlende Vergleichsbasis wird benannt.** Wo noch keine Historie da ist, gibt es keine
  Ampel, sondern den Hinweis, dass die Basis aufgebaut wird.

## Offene Punkte

* **Südtirol-Radzähler ohne Historie.** Der Import scheiterte reproduzierbar an HTTP 429 —
  der `BikeCounter/*`-Pfad über Mehrtagesfenster ist dem Open Data Hub zu teuer, auch mit
  100-Sekunden-Pausen. Die Basis baut sich über den laufenden Sammler auf; ein Nachtrag mit
  Tagesfenstern und einzelnem Datentyp statt `*` wäre der nächste Versuch.
* **Männerbad Schanzengraben** findet in der Zürcher Historie keinen Namenstreffer.
* **Passo Gardena und Seceda melden dauerhaft 0 freie Plätze.** Ob das echt ist (Hochsaison)
  oder ein Sensor-Default, zeigt die wachsende Historie.

## Betrieb

```bash
python scripts/build_sensors.py       # lib/sensors.json aus den Live-Quellen erzeugen
python scripts/import_historie.py     # einmalig: mitgelieferte Historien ins Profil
npm run dev
```

Env (`.env.local`, Vorlage in `.env.example`):

```
N8N_BASE=https://n8n.friedemann-schuetz.de
N8N_BP_SECRET=<Secret des besucherpuls-status-Webhooks>
```

**Deploy:** `git push origin main` (Vercel-GitHub-Integration), vorher lokal `npm run build`
grün. Nicht `vercel deploy --prod`.
