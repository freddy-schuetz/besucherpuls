"""Baut die Profil-Tabelle neu auf — Format v2.

WARUM NEU. Das alte Raster speicherte je Zelle (Wochentag x Stunde) einen Median
ueber alle Einzelmessungen. Das sah gut gefuellt aus (n >= 3), stammte aber bei
vier Tagen Historie aus einem EINZIGEN Freitag: zehn Messungen desselben
Nachmittags. Ein Median daraus ist kein Freitagsprofil, sondern die Erinnerung an
genau diesen Freitag. Bei Baedern kam hinzu, dass nachts alle Werte 0 sind — der
Zellenmedian wurde 0,5 und die Quote 'wert/median' explodierte auf 93 200 %.

FORMAT v2. Je Zelle wird eine Liste von TAGESWERTEN gefuehrt (Median der Messungen
dieses Tages in dieser Stunde), begrenzt auf die letzten MAX_TAGE Vorkommen:

    {"v": 2, "dh": {"<wochentag>_<stunde>": [w1, w2, ...]}, "stand": "..."}

Daraus laesst sich alles Weitere zur Laufzeit ableiten (Stundenprofil, Werktag/
Wochenende), und die Zahl der Eintraege IST die Zahl der beobachteten Tage — die
Angabe, auf die es fuer die Belastbarkeit ankommt.

Die Einordnung rechnet spaeter keinen Quotienten mehr, sondern den Perzentilrang:
'voller als an X % der vergleichbaren Tage'. Der ist auf 0-100 begrenzt und
gegen Nullmediane immun.

Quellen: n8n-Ringpuffer (alle Sensoren) + Zuerich-CSV (rollierend 4 Tage)
+ Open Data Hub Suedtirol (Parken 14 Tage, Rad 60 Tage).

    python scripts/profil_neu.py [--dry]

Stand: 01.08.2026
"""
import csv
import io
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

# Alles, was in ein Stundenraster einsortiert wird, muss dieselbe Zeitzone
# benutzen wie der Workflow — sonst beschreibt Zelle "13" eine andere Stunde,
# als der Gast meint, wenn er 13 Uhr liest.
BERLIN = ZoneInfo("Europe/Berlin")

UA = {"User-Agent": "besucherpuls/0.1 (+https://friedemann-schuetz.de)"}
HIER = os.path.dirname(os.path.abspath(__file__))
SENSORS = os.path.join(HIER, "..", "lib", "sensors.json")
REPO_ROOT = os.path.join(HIER, "..", "..", "..")

ODH = "https://mobility.api.opendatahub.com/v2"
ZH_HIST = "https://data.stadt-zuerich.ch/dataset/ssd_spo_badi_besuch/download/badi_besuch.csv"
PROFIL_TABLE = "OPyMv8bkUvAwtMCc"
PUFFER_TABLE = "nVawEogJkPNKOCHp"

MAX_TAGE = 12         # so viele Vorkommen je Zelle werden behalten
TAGE_PARKEN = 14
TAGE_RAD = 0          # Radzaehler liefern derzeit 0 und drosseln hart (429) — uebersprungen
TROCKEN = "--dry" in sys.argv


def jget(url, timeout=300, headers=None):
    r = urllib.request.Request(url, headers={**UA, **(headers or {})})
    return json.loads(urllib.request.urlopen(r, timeout=timeout).read())


def raw(url, timeout=300):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def n8n_base_und_key():
    mcp = json.load(io.open(os.path.join(REPO_ROOT, ".mcp.json"), encoding="utf-8"))
    env = mcp["mcpServers"]["n8n-mcp"]["env"]
    base = (env.get("N8N_API_URL") or env.get("N8N_URL")).rstrip("/")
    if not base.endswith("/api/v1"):
        base += "/api/v1"
    return base, env["N8N_API_KEY"]


BASE, KEY = n8n_base_und_key()
H_API = {"X-N8N-API-KEY": KEY, "Content-Type": "application/json"}

sensoren = json.load(io.open(SENSORS, encoding="utf-8"))["sensoren"]

# Quellen, die dieser Lauf NICHT anfassen soll. Die bayerischen Profile stammen
# aus scripts/profil_bayern.py (drei Jahre Historie direkt von der BayernCloud);
# aus dem Ringpuffer liessen sich hier nur ein paar duenne Tage bauen, die das
# Gute ueberschreiben wuerden.
OHNE = set()
if "--ohne" in sys.argv:
    OHNE = {q.strip() for q in sys.argv[sys.argv.index("--ohne") + 1].split(",") if q.strip()}
    vorher = len(sensoren)
    sensoren = [s for s in sensoren if s["quelle"] not in OHNE]
    print(f"--ohne {','.join(sorted(OHNE))}: {vorher - len(sensoren)} Sensoren uebersprungen")

nach_quelle = defaultdict(list)
for s in sensoren:
    nach_quelle[s["quelle"]].append(s)
bekannt = {s["id"] for s in sensoren}

# sensor_id -> [(datetime_utc, wert), ...]
beob = defaultdict(list)


# ---------------------------------------------------------------- Ringpuffer
# Der Puffer ist die einzige Quelle, die ALLE Sensoren abdeckt — auch Luzern und
# GBFS, die gar keine Historie mitbringen.
print("n8n-Ringpuffer …")
geholt = 0
gelesen = 0
cursor = None
while True:
    # Die Tabellen-API kennt weder skip noch offset — nur den opaken nextCursor.
    u = f"{BASE}/data-tables/{PUFFER_TABLE}/rows?limit=250"
    if cursor:
        u += "&cursor=" + urllib.parse.quote(cursor, safe="")
    try:
        d = jget(u, headers=H_API)
    except urllib.error.HTTPError as e:
        print(f"   ! HTTP {e.code}: {e.read()[:200].decode('utf-8','replace')}")
        break
    zeilen = d.get("data") if isinstance(d, dict) else d
    if isinstance(zeilen, dict):
        zeilen = zeilen.get("data") or []
    if not zeilen:
        break
    for r in zeilen:
        sid = r.get("sensor_id")
        if sid not in bekannt:
            continue
        wert = r.get("auslastung")
        if wert is None:
            wert = r.get("wert")
        if wert is None:
            continue
        try:
            t = datetime.fromisoformat(str(r["ts"]).replace("Z", "+00:00"))
        except (ValueError, KeyError, TypeError):
            continue
        # Tote Sensoren nicht ins Profil: ein 80 000 Minuten alter Wert beschreibt
        # nicht diese Stunde, sondern einen Ausfall.
        alter = r.get("alter_min")
        if alter is not None and (alter < 0 or alter > 1440):
            continue
        beob[sid].append((t, float(wert)))
        geholt += 1
    gelesen += len(zeilen)
    cursor = d.get("nextCursor") if isinstance(d, dict) else None
    if not cursor or len(zeilen) < 250:
        break
print(f"   {geholt} verwertbare Messwerte aus {gelesen} Pufferzeilen")


# ---------------------------------------------------------------- Zuerich Baeder
print("Zürich Bäder (rollierendes 4-Tage-Fenster) …")
rows = list(csv.DictReader(io.StringIO(raw(ZH_HIST).decode("utf-8-sig"))))
nach_name = {s["name"]: s for s in nach_quelle["zh_baeder"]}
treffer = 0
for r in rows:
    s = nach_name.get((r.get("LocationName") or "").strip())
    if not s:
        continue
    try:
        wert = float(r["OccupancyMax"])
        t = datetime.strptime(r["Datetime"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except (ValueError, KeyError):
        continue
    beob[s["id"]].append((t, wert))
    treffer += 1
print(f"   {treffer} Messwerte")


# ---------------------------------------------------------------- Suedtirol Parken
print(f"Südtirol Parken ({TAGE_PARKEN} Tage) …")
p_sensoren = nach_quelle["st_parken"]
namen = [s["quelle_id"] for s in p_sensoren]
nach_code = {s["quelle_id"]: s for s in p_sensoren}
heute = date.today()
geholt = 0
for start in range(TAGE_PARKEN, 0, -2):
    von = (heute - timedelta(days=start)).isoformat()
    bis = (heute - timedelta(days=max(start - 2, 0))).isoformat()
    where = "scode.in.(" + ",".join('"' + n + '"' for n in namen) + ")"
    url = (f"{ODH}/flat/ParkingStation/free/{von}/{bis}?limit=-1"
           f"&select=scode,mvalidtime,mvalue&where={urllib.parse.quote(where)}")
    try:
        d = jget(url)
    except Exception as e:  # noqa: BLE001
        print(f"   ! {von}: {str(e)[:70]}")
        time.sleep(8)
        continue
    for r in d.get("data", []):
        s = nach_code.get(r.get("scode"))
        if not s or not s.get("kapazitaet") or r.get("mvalue") is None:
            continue
        try:
            t = datetime.strptime(r["mvalidtime"][:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        auslastung = (s["kapazitaet"] - float(r["mvalue"])) / s["kapazitaet"] * 100
        beob[s["id"]].append((t, round(auslastung, 1)))
        geholt += 1
    time.sleep(7)
print(f"   {geholt} Messwerte")


# ---------------------------------------------------------------- Suedtirol Rad
print(f"Südtirol Rad ({TAGE_RAD} Tage) …")
nach_sname = {s["quelle_id"]: s for s in nach_quelle["st_rad"]}
geholt = 0
for start in range(TAGE_RAD, 0, -10):
    von = (heute - timedelta(days=start)).isoformat()
    bis = (heute - timedelta(days=max(start - 10, 0))).isoformat()
    url = (f"{ODH}/flat/BikeCounter/*/{von}/{bis}?limit=-1"
           f"&select=sname,sorigin,mvalidtime,mvalue")
    # Der BikeCounter-Endpunkt drosselt haerter als ParkingStation und antwortet
    # schon bei moderatem Takt mit 429. Feste Pausen haben beim ersten Anlauf
    # nicht gereicht — deshalb Wiederholung mit wachsender Wartezeit.
    d = None
    for versuch in range(4):
        try:
            d = jget(url)
            break
        except urllib.error.HTTPError as e:
            if e.code != 429:
                print(f"   ! {von}: HTTP {e.code}")
                break
            wart = 30 * (versuch + 1)
            print(f"   429 bei {von}, warte {wart}s …")
            time.sleep(wart)
        except Exception as e:  # noqa: BLE001
            print(f"   ! {von}: {str(e)[:70]}")
            break
    if d is None:
        continue
    for r in d.get("data", []):
        n = r.get("sname") or ""
        if r.get("sorigin") != "Ecocounter" or "(in)" in n or "(out)" in n:
            continue
        s = nach_sname.get(n)
        if not s or r.get("mvalue") is None:
            continue
        try:
            t = datetime.strptime(r["mvalidtime"][:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        beob[s["id"]].append((t, float(r["mvalue"])))
        geholt += 1
    time.sleep(20)
print(f"   {geholt} Messwerte")


# ---------------------------------------------------------------- Raster v2 bauen
print("\nRaster v2 bauen (Tageswerte je Zelle) …")
zeilen = []
for s in sensoren:
    werte = beob.get(s["id"])
    if not werte:
        continue
    # Schritt 1: je (Datum, Stunde) den Median der Messungen dieses Tages.
    #
    # ORTSZEIT, NICHT UTC. Hier lag ein Fehler, der jede Zeitaussage verdreht hat:
    # Der Suedtiroler Open Data Hub liefert `mvalidtime` mit +0000, die Zuercher
    # Besuchsdaten ebenso — beide werden korrekt als UTC geparst. `t.hour` gab
    # dann aber die UTC-Stunde, waehrend der Workflow (status_node.js,
    # verdichten_node.js) in Europe/Berlin rechnet. Im Sommer sind das zwei
    # Stunden Versatz. Fuer Passo Sella behauptete das Profil zu Stunde 13 null
    # Prozent, waehrend der Sensor 90,5 % mass — die Empfehlung "lieber ab
    # 13 Uhr" schickte Gaeste in die vollste Stunde des Tages.
    je_tag_stunde = defaultdict(list)
    for t, v in werte:
        o = t.astimezone(BERLIN)
        je_tag_stunde[(o.date(), o.hour)].append(v)
    tageswerte = {k: statistics.median(v) for k, v in je_tag_stunde.items()}

    # Schritt 2: nach (Wochentag, Stunde) gruppieren — ein Eintrag JE TAG
    dh = defaultdict(list)
    for (d, h), v in sorted(tageswerte.items()):
        dh[f"{d.weekday()}_{h}"].append((d, round(v, 1)))

    raster = {}
    letzte = {}
    for k, paare in dh.items():
        paare.sort()                                   # aelteste zuerst
        behalten = paare[-MAX_TAGE:]
        raster[k] = [v for _, v in behalten]           # nur die juengsten behalten
        # Datum des letzten Eintrags je Zelle. Ohne dieses Feld haengt der
        # stuendliche Verdichter am selben Tag mehrfach an statt zu ersetzen.
        letzte[k] = behalten[-1][0].isoformat()

    tage = {d for d, _ in tageswerte}
    zeiten = [t for t, _ in werte]
    max_tage_je_zelle = max((len(v) for v in raster.values()), default=0)
    # Die Liste der beobachteten Tage MUSS mitgeschrieben werden: Der Verdichter
    # leitet basis_tage daraus ab. Fehlte sie, fing er bei null an und setzte
    # nach dem ersten Lauf jeden Sensor auf "1 Tag Basis" zurueck — obwohl die
    # Zellenwerte aus 15 Tagen stammten.
    beob_tage = sorted(d.isoformat() for d in tage)[-60:]
    zeilen.append({
        "sensor_id": s["id"],
        "raster": json.dumps({"v": 2, "dh": raster, "d": beob_tage, "letzte": letzte,
                              "stand": max(zeiten).date().isoformat()},
                             separators=(",", ":")),
        "n_gesamt": len(werte),
        "basis_tage": len(tage),
        "erste_beob": min(zeiten).isoformat(),
        "letzte_beob": max(zeiten).isoformat(),
        "quelle_hist": s["quelle"],
    })
    print(f"   {s['id'][:32]:<32} n={len(werte):>7}  Tage={len(tage):>3}  "
          f"Zellen={len(raster):>3}  max/Zelle={max_tage_je_zelle:>2}")

groesse = max((len(z["raster"]) for z in zeilen), default=0)
print(f"\n{len(zeilen)} Profilzeilen, groesstes Raster {groesse/1024:.1f} KB")

if TROCKEN:
    print("--dry: nichts geschrieben")
    sys.exit(0)

# ---------------------------------------------------------------- schreiben
# Die betroffenen Zeilen muessen VORHER weg sein. Ein DELETE auf
# /data-tables/{id}/rows beantwortet die REST-API mit 405 — loeschen geht nur
# ueber das MCP-Werkzeug n8n_manage_datatable (action deleteRows) oder die
# Oberflaeche. Wird das vergessen, stehen alte Zeilen neben den neuen und der
# Status-Webhook liest je Sensor eine zufaellige von beiden.
#
# Geprueft wird nur, was dieser Lauf auch schreibt. Frueher verlangte das Skript
# eine komplett LEERE Tabelle — damit haette jeder Teil-Neuaufbau die 55
# bayerischen Zeitreihen mitgerissen, die aus einer ganz anderen Quelle stammen
# (scripts/profil_bayern.py, drei Jahre Historie, zehn Minuten Download).
meine_quellen = {z["quelle_hist"] for z in zeilen}
alle_alt, cursor = [], None
while True:
    u = f"{BASE}/data-tables/{PROFIL_TABLE}/rows?limit=250"
    if cursor:
        u += "&cursor=" + urllib.parse.quote(cursor, safe="")
    d = jget(u, headers=H_API)
    teil = d.get("data") or []
    alle_alt += teil
    cursor = d.get("nextCursor")
    if not cursor or len(teil) < 250:
        break
kollision = [r for r in alle_alt if r.get("quelle_hist") in meine_quellen]
if kollision:
    print(f"\nABBRUCH: {len(kollision)} Zeilen der Quellen "
          f"{', '.join(sorted(meine_quellen))} liegen schon vor.")
    print("Erst loeschen (MCP: n8n_manage_datatable deleteRows, Filter quelle_hist),")
    print("dann erneut starten. Bayerische Zeilen bleiben unberuehrt.")
    sys.exit(1)
print(f"\n{len(alle_alt)} Zeilen in der Tabelle, davon 0 aus "
      f"{', '.join(sorted(meine_quellen))} — Bahn frei.")

req = urllib.request.Request(f"{BASE}/data-tables/{PROFIL_TABLE}/rows",
                             data=json.dumps({"data": zeilen}).encode("utf-8"),
                             headers=H_API, method="POST")
try:
    antwort = urllib.request.urlopen(req, timeout=180).read()
    print(f"{len(zeilen)} Profilzeilen geschrieben. {antwort[:120].decode('utf-8','replace')}")
except urllib.error.HTTPError as e:
    print(f"FEHLER {e.code}: {e.read()[:400].decode('utf-8', 'replace')}")
