"""Einmal-Import der mitgelieferten Historien in die n8n-Tabelle besucherpuls_profil.

Drei der fuenf Quellen bringen Vergangenheitsdaten mit. Die werden hier zu einem
Vergleichsraster verdichtet, damit die Demo ab Tag eins eine Einordnung zeigen kann
statt nur "Vergleichsbasis wird aufgebaut".

Raster je Sensor:
    h  = Median je Stunde (0-23), ueber alle Tage        -> immer vorhanden
    dh = Median je Wochentag_Stunde, nur wo n >= 3       -> erst bei laengerer Historie

Der Status-Webhook nimmt dh, wenn die Zelle existiert, sonst h.
Diese Zweistufigkeit ist noetig, weil die Zuercher Reihe nur rund vier Tage
zurueckreicht — fuer ein Wochentagsraster zu wenig, fuer ein Stundenraster genug.

    python scripts/import_historie.py

Stand: 28.07.2026
"""
import csv
import io
import json
import os
import statistics
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

UA = {"User-Agent": "besucherpuls/0.1 (+https://friedemann-schuetz.de)"}
HIER = os.path.dirname(os.path.abspath(__file__))
SENSORS = os.path.join(HIER, "..", "lib", "sensors.json")
REPO_ROOT = os.path.join(HIER, "..", "..", "..")

ODH = "https://mobility.api.opendatahub.com/v2"
ZH_HIST = "https://data.stadt-zuerich.ch/dataset/ssd_spo_badi_besuch/download/badi_besuch.csv"
PROFIL_TABLE = "OPyMv8bkUvAwtMCc"

TAGE_PARKEN = 14      # 146k Zeilen je 2 Tage ueber alle Stationen — serverseitig gefiltert
TAGE_RAD = 60         # nur ~800 Zeilen je Tag, da ist Tiefe billig


def jget(url, timeout=300):
    return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read())


def raw(url, timeout=300):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def n8n_base_und_key():
    mcp = json.load(io.open(os.path.join(REPO_ROOT, ".mcp.json"), encoding="utf-8"))
    env = mcp["mcpServers"]["n8n-mcp"]["env"]
    base = (env.get("N8N_API_URL") or env.get("N8N_URL")).rstrip("/")
    if not base.endswith("/api/v1"):
        base += "/api/v1"
    return base, env["N8N_API_KEY"]


sensoren = json.load(io.open(SENSORS, encoding="utf-8"))["sensoren"]
nach_quelle = defaultdict(list)
for s in sensoren:
    nach_quelle[s["quelle"]].append(s)

# sensor_id -> [(datetime_utc, wert_normalisiert), ...]
beob = defaultdict(list)


# ---------------------------------------------------------------- Zuerich Baeder
print("Zürich Bäder …")
rows = list(csv.DictReader(io.StringIO(raw(ZH_HIST).decode("utf-8-sig"))))
nach_name = {s["name"]: s for s in nach_quelle["zh_baeder"]}
# Die Historie nutzt LocationName, die Live-Datei uid — Bruecke ist der Name.
treffer = 0
for r in rows:
    s = nach_name.get(r.get("LocationName", "").strip())
    if not s:
        continue
    try:
        wert = float(r["OccupancyMax"])
        t = datetime.strptime(r["Datetime"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except (ValueError, KeyError):
        continue
    beob[s["id"]].append((t, wert))
    treffer += 1
print(f"   {treffer} Messwerte für {len(set(k for k in beob))} Bäder")


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
        print(f"   ! {von}: {str(e)[:80]}")
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
    time.sleep(7)   # ODH antwortet sonst mit 429
print(f"   {geholt} Messwerte")


# ---------------------------------------------------------------- Suedtirol Rad
print(f"Südtirol Rad ({TAGE_RAD} Tage) …")
r_sensoren = nach_quelle["st_rad"]
nach_sname = {s["quelle_id"]: s for s in r_sensoren}
geholt = 0
for start in range(TAGE_RAD, 0, -10):
    von = (heute - timedelta(days=start)).isoformat()
    bis = (heute - timedelta(days=max(start - 10, 0))).isoformat()
    url = (f"{ODH}/flat/BikeCounter/*/{von}/{bis}?limit=-1"
           f"&select=sname,sorigin,mvalidtime,mvalue")
    try:
        d = jget(url)
    except Exception as e:  # noqa: BLE001
        print(f"   ! {von}: {str(e)[:80]}")
        time.sleep(8)
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
    time.sleep(7)
print(f"   {geholt} Messwerte")


# ---------------------------------------------------------------- Raster bauen
print("\nRaster bauen …")
zeilen = []
for s in sensoren:
    werte = beob.get(s["id"])
    if not werte:
        continue
    je_stunde = defaultdict(list)
    je_dow_stunde = defaultdict(list)
    for t, v in werte:
        je_stunde[t.hour].append(v)
        je_dow_stunde[f"{t.weekday()}_{t.hour}"].append(v)
    h = {str(k): round(statistics.median(v), 1) for k, v in je_stunde.items()}
    dh = {k: round(statistics.median(v), 1) for k, v in je_dow_stunde.items() if len(v) >= 3}
    zeiten = [t for t, _ in werte]
    spanne = (max(zeiten) - min(zeiten)).total_seconds() / 86400
    zeilen.append({
        "sensor_id": s["id"],
        "raster": json.dumps({"h": h, "dh": dh}, separators=(",", ":")),
        "n_gesamt": len(werte),
        "basis_tage": round(spanne, 1),
        "erste_beob": min(zeiten).isoformat(),
        "letzte_beob": max(zeiten).isoformat(),
        "quelle_hist": s["quelle"],
    })
    print(f"   {s['id'][:34]:<34} n={len(werte):>7} basis={spanne:>5.1f} Tage  "
          f"h-Zellen={len(h):>2} dh-Zellen={len(dh):>3}")

# ---------------------------------------------------------------- schreiben
base, key = n8n_base_und_key()
H = {"X-N8N-API-KEY": key, "Content-Type": "application/json"}
req = urllib.request.Request(f"{base}/data-tables/{PROFIL_TABLE}/rows",
                             data=json.dumps({"data": zeilen}).encode("utf-8"),
                             headers=H, method="POST")
try:
    antwort = urllib.request.urlopen(req, timeout=180).read()
    print(f"\n{len(zeilen)} Profilzeilen geschrieben. Antwort: {antwort[:120].decode('utf-8','replace')}")
except urllib.error.HTTPError as e:
    print(f"\nFEHLER {e.code}: {e.read()[:400].decode('utf-8', 'replace')}")
