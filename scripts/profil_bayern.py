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
          f"{len(roh):>7} Punkte  {len(raster):>3} Zellen  {len(tage)} Tage")

groesse = max((len(z["raster"]) for z in zeilen), default=0)
print(f"\n{len(zeilen)} Profilzeilen, groesstes Raster {groesse/1024:.1f} KB")

if TROCKEN:
    print("--dry: nichts geschrieben")
    sys.exit(0)

# Bestehende bayerische Zeilen wuerden doppeln — vorher pruefen.
vorhanden = json.loads(urllib.request.urlopen(urllib.request.Request(
    f"{BASE}/data-tables/{PROFIL_TABLE}/rows?limit=250", headers=H_API), timeout=90).read())
schon = {r["sensor_id"] for r in (vorhanden.get("data") or []) if str(r.get("sensor_id", "")).startswith("by-")}
if schon:
    print(f"ABBRUCH: {len(schon)} bayerische Profilzeilen liegen schon vor.")
    print("Erst loeschen (MCP n8n_manage_datatable deleteRows, Filter sensor_id like 'by-%').")
    sys.exit(1)

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
