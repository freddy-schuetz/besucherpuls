"""Nachtrag zum Historien-Import: schliesst die zwei Luecken aus dem ersten Lauf.

1. Suedtirol Rad lief vollstaendig in HTTP 429 — der BikeCounter-Endpunkt ist deutlich
   empfindlicher als der Parking-Endpunkt. Hier mit 25 s Pause, kleineren Fenstern
   und Wiederholung bei 429.
2. Bei Zuerich fehlten 3 von 10 Baedern, weil die Historie Langnamen fuehrt
   ("Schwimmbad / Park Letzigraben") und die Live-Datei Kurznamen ("Freibad Letzigraben").
   Loesung ist dieselbe Normalisierung, die schon den Koordinaten-Abgleich traegt.

    python scripts/import_historie_nachtrag.py

Stand: 28.07.2026
"""
import csv
import io
import json
import os
import statistics
import time
import unicodedata
import urllib.error
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
TAGE_RAD = 60
FENSTER = 15
PAUSE = 25


def norm(s):
    s = s.lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    for w in ("freibad", "hallenbad", "flussbad", "seebad", "strandbad", "waermebad",
              "schwimmbad", "park", "/", " - ", " "):
        s = s.replace(w, "")
    return s.strip()


def jget_retry(url, versuche=4, timeout=300):
    for i in range(versuche):
        try:
            return json.loads(urllib.request.urlopen(
                urllib.request.Request(url, headers=UA), timeout=timeout).read())
        except urllib.error.HTTPError as e:
            if e.code != 429 or i == versuche - 1:
                raise
            warte = PAUSE * (i + 2)
            print(f"      429 — warte {warte}s und wiederhole")
            time.sleep(warte)
    return None


def n8n():
    mcp = json.load(io.open(os.path.join(REPO_ROOT, ".mcp.json"), encoding="utf-8"))
    env = mcp["mcpServers"]["n8n-mcp"]["env"]
    base = (env.get("N8N_API_URL") or env.get("N8N_URL")).rstrip("/")
    if not base.endswith("/api/v1"):
        base += "/api/v1"
    return base, env["N8N_API_KEY"]


sensoren = json.load(io.open(SENSORS, encoding="utf-8"))["sensoren"]
base, key = n8n()
H = {"X-N8N-API-KEY": key, "Content-Type": "application/json"}

# Welche Sensoren haben schon eine Profilzeile?
vorhanden = set()
r = urllib.request.urlopen(urllib.request.Request(
    f"{base}/data-tables/{PROFIL_TABLE}/rows?limit=200", headers=H), timeout=120).read()
for row in json.loads(r).get("data", []):
    vorhanden.add(row["sensor_id"])
print(f"Bereits im Profil: {len(vorhanden)} Sensoren\n")

beob = defaultdict(list)

# ---------------------------------------------------------------- Zuerich, fehlende
fehlend_zh = [s for s in sensoren if s["quelle"] == "zh_baeder" and s["id"] not in vorhanden]
if fehlend_zh:
    print(f"Zürich — nachtragen: {[s['name'] for s in fehlend_zh]}")
    rows = list(csv.DictReader(io.StringIO(urllib.request.urlopen(
        urllib.request.Request(ZH_HIST, headers=UA), timeout=300).read().decode("utf-8-sig"))))
    nach_norm = {norm(s["name"]): s for s in fehlend_zh}
    n = 0
    for r in rows:
        s = nach_norm.get(norm(r.get("LocationName", "")))
        if not s:
            continue
        try:
            wert = float(r["OccupancyMax"])
            t = datetime.strptime(r["Datetime"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except (ValueError, KeyError):
            continue
        beob[s["id"]].append((t, wert))
        n += 1
    print(f"   {n} Messwerte für {len([k for k in beob])} Bäder")
    for s in fehlend_zh:
        if s["id"] not in beob:
            print(f"   ! '{s['name']}' auch nach Normalisierung ohne Treffer")

# ---------------------------------------------------------------- Suedtirol Rad
rad = [s for s in sensoren if s["quelle"] == "st_rad" and s["id"] not in vorhanden]
if rad:
    print(f"\nSüdtirol Rad — {len(rad)} Stationen, {TAGE_RAD} Tage in {FENSTER}-Tage-Fenstern")
    nach_sname = {s["quelle_id"]: s for s in rad}
    heute = date.today()
    for start in range(TAGE_RAD, 0, -FENSTER):
        von = (heute - timedelta(days=start)).isoformat()
        bis = (heute - timedelta(days=max(start - FENSTER, 0))).isoformat()
        url = (f"{ODH}/flat/BikeCounter/*/{von}/{bis}?limit=-1"
               f"&select=sname,sorigin,mvalidtime,mvalue")
        print(f"   {von} → {bis}")
        try:
            d = jget_retry(url)
        except Exception as e:  # noqa: BLE001
            print(f"      übersprungen: {str(e)[:70]}")
            time.sleep(PAUSE)
            continue
        n = 0
        for r in (d or {}).get("data", []):
            nm = r.get("sname") or ""
            if r.get("sorigin") != "Ecocounter" or "(in)" in nm or "(out)" in nm:
                continue
            s = nach_sname.get(nm)
            if not s or r.get("mvalue") is None:
                continue
            try:
                t = datetime.strptime(r["mvalidtime"][:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
            except ValueError:
                continue
            beob[s["id"]].append((t, float(r["mvalue"])))
            n += 1
        print(f"      {n} Messwerte")
        time.sleep(PAUSE)

# ---------------------------------------------------------------- Raster + schreiben
zeilen = []
for s in sensoren:
    werte = beob.get(s["id"])
    if not werte:
        continue
    je_h, je_dh = defaultdict(list), defaultdict(list)
    for t, v in werte:
        je_h[t.hour].append(v)
        je_dh[f"{t.weekday()}_{t.hour}"].append(v)
    h = {str(k): round(statistics.median(v), 1) for k, v in je_h.items()}
    dh = {k: round(statistics.median(v), 1) for k, v in je_dh.items() if len(v) >= 3}
    zeiten = [t for t, _ in werte]
    spanne = (max(zeiten) - min(zeiten)).total_seconds() / 86400
    zeilen.append({
        "sensor_id": s["id"],
        "raster": json.dumps({"h": h, "dh": dh}, separators=(",", ":")),
        "n_gesamt": len(werte), "basis_tage": round(spanne, 1),
        "erste_beob": min(zeiten).isoformat(), "letzte_beob": max(zeiten).isoformat(),
        "quelle_hist": s["quelle"],
    })
    print(f"   {s['id'][:34]:<34} n={len(werte):>7} basis={spanne:>5.1f} Tage  "
          f"h={len(h):>2} dh={len(dh):>3}")

if not zeilen:
    print("\nNichts nachzutragen.")
else:
    req = urllib.request.Request(f"{base}/data-tables/{PROFIL_TABLE}/rows",
                                 data=json.dumps({"data": zeilen}).encode("utf-8"),
                                 headers=H, method="POST")
    try:
        a = urllib.request.urlopen(req, timeout=180).read()
        print(f"\n{len(zeilen)} Zeilen nachgetragen: {a[:120].decode('utf-8','replace')}")
    except urllib.error.HTTPError as e:
        print(f"\nFEHLER {e.code}: {e.read()[:400].decode('utf-8','replace')}")
