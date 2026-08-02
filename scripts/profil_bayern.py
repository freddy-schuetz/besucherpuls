"""Einmal-Import der bayerischen Historie in die Profil-Tabelle.

Die BayernCloud liefert je Parkplatz eine Zeitreihe der Auslastung zurueck bis
Mai 2023 — rund 125 000 Punkte, etwa 5 MB je Objekt. Damit haben die bayerischen
Gebiete ab Tag eins ein echtes Wochentag-Stunden-Profil, statt es wochenlang
selbst aufbauen zu muessen. Das ist der Grund, warum Bayern die Leitregion ist.

Einen Zeitraum-Parameter kennt der Endpunkt NICHT (from/start/after/limit/days
wurden alle getestet, jeder liefert die volle Reihe). Es wird also je Sensor
einmal alles geholt, im Speicher verdichtet und wieder verworfen.

Format wie in profil_neu.py: je Zelle (Wochentag x Stunde) eine Liste von
TAGESWERTEN, dazu die Liste der beobachteten Tage. Beides ist Pflicht — ohne
`d` setzt der stuendliche Verdichter jeden Sensor auf basis_tage = 1 zurueck.

    python scripts/profil_bayern.py [--dry] [--nur N]

Stand: 02.08.2026
"""
import io
import json
import os
import re
import statistics
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime

HIER = os.path.dirname(os.path.abspath(__file__))
SENSORS = os.path.join(HIER, "..", "lib", "sensors.json")
ENVDATEI = os.path.join(HIER, "..", ".env.local")
REPO_ROOT = os.path.join(HIER, "..", "..", "..")

BCT = "https://data.bayerncloud.digital/api/v4"
PROFIL_TABLE = "OPyMv8bkUvAwtMCc"
MAX_TAGE = 12          # Vorkommen je Zelle
MAX_DATEN = 60         # gezaehlte Beobachtungstage
TROCKEN = "--dry" in sys.argv
NUR = None
if "--nur" in sys.argv:
    NUR = int(sys.argv[sys.argv.index("--nur") + 1])


def geheim(name):
    k = os.environ.get(name)
    if k:
        return k.strip()
    for z in io.open(ENVDATEI, encoding="utf-8"):
        m = re.match(rf"\s*{name}\s*=\s*(.+)", z)
        if m:
            return m.group(1).strip().strip('"').strip("'")
    sys.exit(f"{name} nicht gefunden")


def n8n():
    mcp = json.load(io.open(os.path.join(REPO_ROOT, ".mcp.json"), encoding="utf-8"))
    env = mcp["mcpServers"]["n8n-mcp"]["env"]
    base = (env.get("N8N_API_URL") or env.get("N8N_URL")).rstrip("/")
    if not base.endswith("/api/v1"):
        base += "/api/v1"
    return base, {"X-N8N-API-KEY": env["N8N_API_KEY"], "Content-Type": "application/json"}


TOKEN = geheim("BAYERNCLOUD_TOKEN")
H_BCT = {"User-Agent": "besucherpuls/0.1", "Authorization": f"Bearer {TOKEN}"}
BASE, H_API = n8n()

sensoren = [s for s in json.load(io.open(SENSORS, encoding="utf-8"))["sensoren"]
            if s.get("quelle") == "bayern"]
if NUR:
    sensoren = sensoren[:NUR]
print(f"{len(sensoren)} bayerische Sensoren\n")

# Reihen-URL je Objekt aus dem Katalog holen (steht nicht in sensors.json)
reihe_von = {}
seite = f"{BCT}/endpoints/list_occupancy"
while seite:
    d = json.loads(urllib.request.urlopen(
        urllib.request.Request(seite, headers=H_BCT), timeout=120).read())
    for o in d.get("@graph", []):
        r = (o.get("dcls:occupancyRate") or {}).get("dc:entityUrl")
        if r:
            reihe_von[o["@id"]] = r
    seite = (d.get("links") or {}).get("next")
print(f"{len(reihe_von)} Zeitreihen im Katalog\n")

zeilen = []
verworfen = []
for i, s in enumerate(sensoren, 1):
    u = reihe_von.get(s.get("quelle_id"))
    if not u:
        print(f"  {i:>3}/{len(sensoren)} {s['name'][:38]:<38} keine Reihe")
        continue
    try:
        roh = json.loads(urllib.request.urlopen(
            urllib.request.Request(u, headers=H_BCT), timeout=300).read()).get("data", [])
    except Exception as e:  # noqa: BLE001
        print(f"  {i:>3}/{len(sensoren)} {s['name'][:38]:<38} Fehler {str(e)[:40]}")
        continue

    # PRUEFUNG VOR DEM SCHREIBEN. Beim ersten Import habe ich nur gezaehlt, dass
    # Zeilen ankamen — nicht, ob die Werte stimmen. Alpsee P1 lag ueber alle drei
    # Jahre konstant auf 277 (bei Kapazitaet 140), Vitalpark zwischen 860 und 964.
    # Solche Reihen erzeugen flache Tagesverlaeufe und einen Vergleich, der jeden
    # Wert "normal" findet. Sie gehoeren gar nicht erst in die Tabelle.
    werte = []
    for punkt in roh:
        try:
            werte.append(float(punkt[1]))
        except (ValueError, TypeError, IndexError):
            pass
    if not werte:
        print(f"  {i:>3}/{len(sensoren)} {s['name'][:38]:<38} VERWORFEN: keine Werte")
        verworfen.append((s["name"], "keine Werte"))
        continue
    hoch, tief, eindeutig = max(werte), min(werte), len(set(werte))
    if hoch > 105:
        print(f"  {i:>3}/{len(sensoren)} {s['name'][:38]:<38} VERWORFEN: Rate bis {hoch:.0f} %")
        verworfen.append((s["name"], f"Rate bis {hoch:.0f} %"))
        continue
    if eindeutig < 5:
        print(f"  {i:>3}/{len(sensoren)} {s['name'][:38]:<38} VERWORFEN: nur {eindeutig} verschiedene Werte")
        verworfen.append((s["name"], f"nur {eindeutig} verschiedene Werte"))
        continue

    # Schritt 1: je (Datum, Stunde) den Median dieses Tages
    je_tag_stunde = defaultdict(list)
    for punkt in roh:
        try:
            t = datetime.fromisoformat(punkt[0])
            v = float(punkt[1])
        except (ValueError, TypeError, IndexError):
            continue
        je_tag_stunde[(t.date(), t.hour)].append(v)

    # Schritt 2: nach (Wochentag, Stunde) gruppieren, ein Eintrag JE TAG
    dh = defaultdict(list)
    for (d_, h), v in sorted(je_tag_stunde.items()):
        dh[f"{d_.weekday()}_{h}"].append((d_, round(statistics.median(v), 1)))

    raster, letzte = {}, {}
    for k, paare in dh.items():
        paare.sort()
        behalten = paare[-MAX_TAGE:]
        raster[k] = [v for _, v in behalten]
        letzte[k] = behalten[-1][0].isoformat()

    tage = sorted({d_ for d_, _ in je_tag_stunde})[-MAX_DATEN:]
    zeilen.append({
        "sensor_id": s["id"],
        "raster": json.dumps({"v": 2, "dh": raster,
                              "d": [d_.isoformat() for d_ in tage],
                              "letzte": letzte,
                              "stand": tage[-1].isoformat()},
                             separators=(",", ":")),
        "n_gesamt": len(roh),
        "basis_tage": len(tage),
        "erste_beob": min(je_tag_stunde)[0].isoformat(),
        "letzte_beob": max(je_tag_stunde)[0].isoformat(),
        "quelle_hist": "bayern",
    })
    print(f"  {i:>3}/{len(sensoren)} {s['name'][:38]:<38} "
          f"{len(roh):>7} Punkte  {len(raster):>3} Zellen  {len(tage)} Tage  "
          f"Spanne {tief:.0f}–{hoch:.0f} %, {eindeutig} verschiedene")

groesse = max((len(z["raster"]) for z in zeilen), default=0)
print(f"\n{len(zeilen)} Profilzeilen, groesstes Raster {groesse/1024:.1f} KB")

if TROCKEN:
    print("--dry: nichts geschrieben")
    sys.exit(0)

# Der stuendliche Verdichter legt fuer neue Sensoren selbst Zeilen an (duenn,
# ein Tag). Die wuerden hier doppeln. Frueher brach das Skript deshalb komplett
# ab — jetzt werden nur die betroffenen Sensoren uebersprungen, damit ein
# erneuter Lauf nicht alle 104 Zeitreihen noch einmal herunterlaedt.
alle_vorhanden = set()
cursor = None
while True:
    u = f"{BASE}/data-tables/{PROFIL_TABLE}/rows?limit=250"
    if cursor:
        u += "&cursor=" + urllib.parse.quote(cursor, safe="")
    d = json.loads(urllib.request.urlopen(
        urllib.request.Request(u, headers=H_API), timeout=90).read())
    zs = d.get("data") or []
    alle_vorhanden |= {r["sensor_id"] for r in zs}
    cursor = d.get("nextCursor")
    if not cursor or len(zs) < 250:
        break
doppelt = [z for z in zeilen if z["sensor_id"] in alle_vorhanden]
if doppelt:
    print(f"{len(doppelt)} Sensoren haben schon eine Profilzeile — werden uebersprungen:")
    for z in doppelt:
        print(f"   {z['sensor_id']}")
    zeilen = [z for z in zeilen if z["sensor_id"] not in alle_vorhanden]
if not zeilen:
    print("Nichts zu schreiben.")
    sys.exit(0)

# In Bloecken schreiben — ein einzelner POST mit 109 Rastern waere sehr gross.
for i in range(0, len(zeilen), 25):
    block = zeilen[i:i + 25]
    try:
        r = urllib.request.urlopen(urllib.request.Request(
            f"{BASE}/data-tables/{PROFIL_TABLE}/rows",
            data=json.dumps({"data": block}).encode("utf-8"),
            headers=H_API, method="POST"), timeout=180).read()
        print(f"  Block {i//25 + 1}: {r[:80].decode('utf-8','replace')}")
    except urllib.error.HTTPError as e:
        print(f"  Block {i//25 + 1} FEHLER {e.code}: {e.read()[:300].decode('utf-8','replace')}")
