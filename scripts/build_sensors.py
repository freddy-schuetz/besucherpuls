"""Erzeugt lib/sensors.json aus den Live-Quellen.

Die Datei ist das inhaltliche Herzstueck: Sie legt fest, WELCHE Punkte die Demo zeigt,
mit welcher Einheit gemessen wird und wie ein Wert in Auslastung uebersetzt wird.
Sie wird generiert statt handgetippt, damit Koordinaten, Kapazitaeten und Quell-IDs
aus der Realitaet stammen und nicht aus Annahmen.

    python scripts/build_sensors.py

Stand der Kuration: 28.07.2026
"""
import csv
import io
import json
import os
import time
import unicodedata
import urllib.request
from datetime import datetime, timezone

UA = {"User-Agent": "besucherpuls/0.1 (+https://friedemann-schuetz.de)"}
HIER = os.path.dirname(os.path.abspath(__file__))
ZIEL = os.path.join(HIER, "..", "lib", "sensors.json")

# Der Luzerner Devicecounter braucht einen Zugangsschluessel. Er ist Teil des
# offenen Datenangebots der Stadt, steht aber bewusst nicht im Repo — setze
# LUZERN_API_KEY in der Umgebung (siehe .env.example).
LUZERN_KEY = os.environ.get("LUZERN_API_KEY", "")
LUZERN_API = ("https://portal.alfons.io/app/devicecounter/api/sensors"
              f"?api_key={LUZERN_KEY}")
ZH_LIVE = "https://data.stadt-zuerich.ch/dataset/ssd_spo_badi_aktuell/download/crowd-monitor.csv"
ZH_KOORD = "https://data.stadt-zuerich.ch/dataset/ssd_spo_badi_besuch/download/koordinaten.csv"
ODH = "https://mobility.api.opendatahub.com/v2"


def get(url, timeout=120):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def jget(url, timeout=120):
    return json.loads(get(url, timeout))


# ---------------------------------------------------------------- Kuration
# Luzern liefert KEINE Koordinaten im Feed — die stehen hier von Hand.
LUZERN = {
    "luzern_kappelbruecke_01": ("Kapellbrücke", 47.05173, 8.30759,
                                "Radarsensor auf der Brücke — zählt den Fussgängerstrom direkt"),
    "7076FF0069051527": ("Rathausquai", 47.05233, 8.30720, "WLAN-Geräte am Reussufer"),
    "7076FF006905162D": ("Löwendenkmal", 47.05828, 8.31166, "WLAN-Geräte"),
    "7076FF006905162E": ("Schwanenplatz", 47.05180, 8.30947, "WLAN-Geräte am Cars-Halteplatz"),
    "7076FF0069051631": ("Hertensteinstrasse", 47.05300, 8.30850, "WLAN-Geräte"),
    # "7076FF0069051634" (Kapellbrücke Wifi) bewusst weggelassen: Dublette zum Radar am selben Ort
}

# Zuerich: Freibaeder, See- und Flussbaeder. Hallenbaeder raus — das ist Alltagssport,
# kein Besucheraufkommen im touristischen Sinn.
ZH_UIDS = ["flb6939", "flb6940", "flb6941", "flb6942", "SSD-10",
           "seb6946", "seb6947", "seb6948", "LETZI-1", "SSD-13"]

# Suedtirol Parken: Seilbahn-Talstationen, Dolomitenpaesse und Kurorte.
# Die Bozner Stadtparkhaeuser (FAMAS, Municipality Bolzano) bleiben draussen.
# "Passo Gardena" ist raus: Der Sensor meldet unveraendert 0 von 500 freien
# Plaetzen — ueber 14 Tage in ALLEN 168 Wochentag-Stunden-Zellen exakt 100 %
# Auslastung. Das ist kein voller Parkplatz, das ist ein steckengebliebener
# Geber. Auf der Karte erzeugte er den Widerspruch "0 von 500 frei / viel Platz",
# weil der Vergleich mit der eigenen Vergangenheit ihn als voellig normal las.
ST_PARKEN = [
    "Passo Sella", "Plan de Gralba", "Garage Dantercëpies",
    "Parcheggio + Garage Seceda", "Parcheggio Vallunga", "Parcheggio P1 - Monte Pana",
    "Park Terme", "Park Plaza", "Parcheggio Falzeben - Merano 2000", "Parcheggio P4 Senales",
]

# Suedtirol Rad: Basisstationen ohne Richtungssplit.
# Rabland faellt raus — letzter Wert vor 135 Tagen.
ST_RAD = ["Toblach / Dobbiaco", "Bruneck / Brunico", "Brixen / Bressanone",
          "Sterzing / Vipiteno", "Marling / Marlengo", "Staben / Stava",
          "St. Leonhard / San Leonardo", "Riffian / Rifiano",
          "Mühlbach / Rio di Pusteria", "Ehrenburg"]

GBFS = [
    ("nextbike_ch", "Luzern & Sempachersee", "CH", "raeder_absolut"),
    ("nextbike_ur", "Insel Usedom", "DE", "fuellgrad"),      # einziges System mit echter Dock-Zählung
    ("nextbike_eq", "Neusiedler See", "AT", "raeder_absolut"),
]

# Wien: alle staedtischen Baeder auf einem WFS-Layer, je Bad eine Ampelstufe.
# Nur 33 der 46 fuehren ueberhaupt einen Wert (13 melden -99); welche das sind,
# entscheidet der Feed zur Bauzeit, nicht diese Liste.
WIEN_WFS = ("https://data.wien.gv.at/daten/geo?service=WFS&request=GetFeature&version=1.1.0"
            "&typeName=ogdwien:SCHWIMMBADOGD&srsName=EPSG:4326&outputFormat=json")

# Kieler Foerde: Leihrad-Stationen der SprottenFlotte (GBFS 3.0, CC0).
# Gemessen wird die DOCK-Belegung, nicht "Besucher". Ein volles Dock heisst:
# hier kannst du dein Rad nicht abgeben — das ist eine ehrliche Lenkungsaussage.
# "Fuellgrad = Besucherzahl" waere eine Unterstellung.
KIEL_GBFS = "https://stables.donkey.bike/api/public/gbfs/3.0/donkey_kielsmile"
KIEL_WORTE = ("strand", "laboe", "foerde", "förde", "kiellinie", "falckenstein",
              "schilksee", "bellevue", "hafen", "seebad", "duesternbrook",
              "düsternbrook", "moltkestr", "reventlou", "wendtorf", "schoenberg",
              "schönberg", "kalifornien", "brasilien", "stein", "heikendorf",
              "moenkeberg", "mönkeberg", "eckernfoerde", "eckernförde")

# Gruppen = Mengen austauschbarer Ziele. Nur innerhalb einer Gruppe darf die
# Demo eine Alternative empfehlen; ein Parkhaus ersetzt kein Bad.
GRUPPEN_ORT = {
    "Luzern": "luzern-altstadt",
    "Zürich": "zuerich-baeder",
    "valgardena": "groeden",
    "Meran - Merano": "meran",
}


def norm(s):
    """Namensnormalisierung fuer den Koordinaten-Abgleich (Umlaute, Gattungswoerter)."""
    s = s.lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    for w in ("freibad", "hallenbad", "flussbad", "seebad", "strandbad", "waermebad",
              "schwimmbad", "park", "/", " - ", " "):
        s = s.replace(w, "")
    return s.strip()


def slug(s):
    """ID-Slug: nur a-z, 0-9 und Bindestrich. Landet in URLs und Datenbankschluesseln."""
    s = s.lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = "".join(c if c.isalnum() else "-" for c in s)
    while "--" in s:
        s = s.replace("--", "-")
    return s.strip("-")


if not LUZERN_KEY:
    raise SystemExit("LUZERN_API_KEY fehlt — siehe .env.example")

sensoren = []

# ---------------------------------------------------------------- Luzern
d = jget(LUZERN_API)
vorhanden = {it["nodeid"] for it in d["data"]}
for nid, (name, lat, lon, hinweis) in LUZERN.items():
    if nid not in vorhanden:
        print(f"  ! Luzern-Sensor {nid} nicht mehr im Feed — uebersprungen")
        continue
    sensoren.append({
        "id": f"lu-{slug(name)}", "name": name, "ort": "Luzern", "land": "CH",
        "lat": lat, "lon": lon,
        "quelle": "luzern", "quelle_id": nid,
        "metrik": "personen", "einheit": "Personen", "kapazitaet": None,
        "hinweis": hinweis,
        "quelle_url": "https://opendata.swiss/de/organization/stadt-luzern",
    })
print(f"Luzern: {sum(1 for s in sensoren if s['quelle']=='luzern')} Sensoren")

# ---------------------------------------------------------------- Zuerich Baeder
live = list(csv.DictReader(io.StringIO(get(ZH_LIVE).decode("utf-8-sig"))))
koord = list(csv.DictReader(io.StringIO(get(ZH_KOORD).decode("utf-8-sig"))))
kmap = {norm(k["LocalName"]): k for k in koord}
n_zh = 0
for r in live:
    if r["uid"] not in ZH_UIDS:
        continue
    k = kmap.get(norm(r["name"]))
    if not k:
        print(f"  ! Zuerich: keine Koordinate fuer {r['name']} — uebersprungen")
        continue
    sensoren.append({
        "id": f"zh-{r['uid'].lower()}", "name": r["name"], "ort": "Zürich", "land": "CH",
        "lat": float(k["Lat"]), "lon": float(k["Lon"]),
        "quelle": "zh_baeder", "quelle_id": r["uid"],
        "metrik": "personen", "einheit": "Badegäste", "kapazitaet": None,
        "hinweis": "Zählsensoren an den Zugängen — nachts korrekt 0, das ist kein Ausfall",
        "quelle_url": "https://data.stadt-zuerich.ch/dataset/ssd_spo_badi_aktuell",
    })
    n_zh += 1
print(f"Zürich Bäder: {n_zh} Sensoren")

# ---------------------------------------------------------------- Suedtirol Parken
time.sleep(2)
d = jget(f"{ODH}/flat,node/ParkingStation/free/latest?limit=-1"
         "&select=sname,sorigin,mvalue,mvalidtime,scoordinate,smetadata,scode")
gefunden = {}
for r in d["data"]:
    if r.get("sname") in ST_PARKEN:
        gefunden[r["sname"]] = r
n_p = 0
for name in ST_PARKEN:
    r = gefunden.get(name)
    if not r:
        print(f"  ! Südtirol-Parken '{name}' nicht im Feed — uebersprungen")
        continue
    md = r.get("smetadata") or {}
    kap = md.get("capacity") or md.get("totalPlaces") or md.get("maxPlaces")
    c = r.get("scoordinate") or {}
    if not kap or int(kap) >= 9999 or not c.get("y"):
        print(f"  ! Südtirol-Parken '{name}': Kapazität {kap} unbrauchbar — uebersprungen")
        continue
    sensoren.append({
        "id": f"st-p-{slug(name)}"[:44], "name": name,
        "ort": md.get("municipality") or "Südtirol", "land": "IT",
        "lat": float(c["y"]), "lon": float(c["x"]),
        "quelle": "st_parken", "quelle_id": r.get("scode") or name,
        "metrik": "frei_plaetze", "einheit": "freie Plätze", "kapazitaet": int(kap),
        "hinweis": "Auslastung = (Kapazität − frei) / Kapazität",
        "quelle_url": "https://mobility.api.opendatahub.com",
    })
    n_p += 1
print(f"Südtirol Parken: {n_p} Sensoren")

# ---------------------------------------------------------------- Suedtirol Rad
time.sleep(6)
d = jget(f"{ODH}/flat,node/BikeCounter/*/latest?limit=-1"
         "&select=sname,sorigin,mvalidtime,mvalue,mperiod,scoordinate,tname,scode")
basis = {}
for r in d["data"]:
    n = r.get("sname") or ""
    if r.get("sorigin") != "Ecocounter" or "(in)" in n or "(out)" in n:
        continue
    basis.setdefault(n, r)
n_r = 0
for name in ST_RAD:
    r = basis.get(name)
    if not r:
        print(f"  ! Südtirol-Rad '{name}' nicht im Feed — uebersprungen")
        continue
    c = r.get("scoordinate") or {}
    if not c.get("y"):
        continue
    kurz = name.split("/")[0].strip()
    sensoren.append({
        "id": f"st-r-{slug(kurz)}"[:44], "name": kurz, "ort": "Südtirol", "land": "IT",
        "lat": float(c["y"]), "lon": float(c["x"]),
        "quelle": "st_rad", "quelle_id": name,
        "metrik": "rad_pro_stunde", "einheit": "Räder/h", "kapazitaet": None,
        "hinweis": "Eco-Counter am Radweg — Feed liefert mit rund einem Tag Verzug",
        "quelle_url": "https://mobility.api.opendatahub.com",
    })
    n_r += 1
print(f"Südtirol Rad: {n_r} Sensoren")

# ---------------------------------------------------------------- GBFS
for sys_id, label, land, metrik in GBFS:
    info = jget(f"https://gbfs.nextbike.net/maps/gbfs/v2/{sys_id}/en/station_information.json")
    st = info["data"]["stations"]
    lats = [s["lat"] for s in st if s.get("lat")]
    lons = [s["lon"] for s in st if s.get("lon")]
    sensoren.append({
        "id": f"gbfs-{sys_id}", "name": label, "ort": label, "land": land,
        "lat": round(sum(lats) / len(lats), 5), "lon": round(sum(lons) / len(lons), 5),
        "quelle": "gbfs", "quelle_id": sys_id,
        "metrik": metrik,
        "einheit": "verfügbare Räder" if metrik == "raeder_absolut" else "% Räder an Station",
        "kapazitaet": None,
        "stationen": len(st),
        "hinweis": ("Regionalaggregat über alle Stationen. Weniger Räder an den Stationen "
                    "heisst mehr Räder unterwegs."
                    if metrik == "raeder_absolut"
                    else "Regionalaggregat: Anteil der Räder, die an einer Station stehen."),
        "quelle_url": f"https://gbfs.nextbike.net/maps/gbfs/v2/{sys_id}/gbfs.json",
    })
    time.sleep(1)
print(f"GBFS: {len(GBFS)} Regionalpunkte")

# ---------------------------------------------------------------- Wien Baeder
d = jget(WIEN_WFS, 180)
n_w = 0
for f in d.get("features", []):
    p = f.get("properties") or {}
    kat = p.get("AUSLASTUNG_AMPEL_KATEGORIE_0")
    # -99 = das Bad meldet nichts. Solche Punkte gar nicht erst aufnehmen —
    # sie wuerden auf der Karte dauerhaft grau stehen und nichts erklaeren.
    if kat is None or int(kat) < 0:
        continue
    g = f.get("geometry") or {}
    c = g.get("coordinates") or []
    if len(c) < 2:
        continue
    name = (p.get("NAME") or "").strip()
    sensoren.append({
        "id": f"wien-{slug(name)}"[:44], "name": name,
        "ort": "Wien", "land": "AT",
        "lat": round(float(c[1]), 6), "lon": round(float(c[0]), 6),
        "quelle": "wien_baeder", "quelle_id": name,
        "metrik": "ampelstufe", "einheit": "Auslastungsstufe", "kapazitaet": 5,
        "hinweis": ("Die Stadt Wien veröffentlicht je Bad eine Ampelstufe von 1 (noch Platz) "
                    "bis 5 (derzeit voll). 0 heisst geschlossen."),
        "quelle_url": "https://www.data.gv.at/katalog/dataset/stadt-wien_schwimmbderwien",
        "bezirk": p.get("BEZIRK"),
    })
    n_w += 1
print(f"Wien Bäder: {n_w} Sensoren (von {len(d.get('features', []))} im Layer)")

# ---------------------------------------------------------------- Kieler Foerde
info = jget(f"{KIEL_GBFS}/station_information.json", 180)
stationen = info["data"]["stations"]


def gbfs3_name(v):
    """GBFS 3.0 fuehrt name als Sprach-Array [{language, text}], nicht als String."""
    if isinstance(v, list):
        for e in v:
            if isinstance(e, dict) and e.get("text"):
                return e["text"]
        return ""
    return str(v or "")


n_k = 0
for st in stationen:
    name = gbfs3_name(st.get("name")).strip()
    kap = st.get("capacity")
    if not name or not kap or st.get("lat") is None:
        continue
    if not any(w in name.lower() for w in KIEL_WORTE):
        continue
    sensoren.append({
        "id": f"kiel-{slug(name)}"[:44], "name": name,
        "ort": "Kieler Förde", "land": "DE",
        "lat": round(float(st["lat"]), 6), "lon": round(float(st["lon"]), 6),
        "quelle": "kiel_gbfs", "quelle_id": str(st.get("station_id")),
        "metrik": "dock_belegung", "einheit": "% belegte Docks", "kapazitaet": int(kap),
        "hinweis": ("Anteil belegter Rückgabeplätze an dieser Station. Voll heisst: hier lässt "
                    "sich kein Rad abgeben — nicht, dass hier viele Menschen sind."),
        "quelle_url": f"{KIEL_GBFS}/gbfs.json",
    })
    n_k += 1
print(f"Kieler Förde: {n_k} Stationen (von {len(stationen)} im System)")

# ---------------------------------------------------------------- Gruppen setzen
for s in sensoren:
    if s["quelle"] == "wien_baeder":
        s["gruppe"] = "wien-baeder"
    elif s["quelle"] == "kiel_gbfs":
        s["gruppe"] = "kiel-foerde"
    elif s["quelle"] == "st_rad":
        s["gruppe"] = "suedtirol-rad"
    elif s["quelle"] == "gbfs":
        s["gruppe"] = None          # Regionalaggregate sind keine Alternativen zueinander
    else:
        s["gruppe"] = GRUPPEN_ORT.get(s["ort"])

# ---------------------------------------------------------------- schreiben
ausgabe = {
    "erzeugt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "anzahl": len(sensoren),
    "sensoren": sensoren,
}
os.makedirs(os.path.dirname(ZIEL), exist_ok=True)
with open(ZIEL, "w", encoding="utf-8") as f:
    json.dump(ausgabe, f, ensure_ascii=False, indent=2)
print(f"\n{len(sensoren)} Sensoren geschrieben nach lib/sensors.json")
for q in ("luzern", "zh_baeder", "st_parken", "st_rad", "gbfs", "wien_baeder", "kiel_gbfs"):
    print(f"  {q:<12} {sum(1 for s in sensoren if s['quelle'] == q)}")
print("\nGruppen (Mengen austauschbarer Ziele):")
gr = {}
for s in sensoren:
    gr[s.get("gruppe")] = gr.get(s.get("gruppe"), 0) + 1
for g, n in sorted(gr.items(), key=lambda x: (x[0] is None, str(x[0]))):
    warn = "  <- Einzelpunkt, kann nicht lenken" if g and n < 2 else ""
    print(f"  {str(g):<18} {n}{warn}")
