"""Reichert lib/ziele.json um beschreibende Zusatzinfos an.

WARUM. Ein Gast kennt "Neuhausenbruecke" nicht — aber die "Berchtesgadener
Alpen". Er kennt "Feuerwehrhaus" nicht, wohl aber "Balderschwang". Und wenn die
Seite ihn zu einem anderen Ziel schickt, will er wissen, was ihn dort erwartet.
Auslastungszahlen allein beantworten das nicht.

WAS WOHER (alles gemessen, nicht geschaetzt):

  Overpass `is_in`     uebergeordnetes Gebiet je Koordinate, 0,8-2 s
                       Neuhausenbruecke -> Berchtesgadener Alpen (Q679384)
                       Nebelhorn        -> Allgaeuer Alpen
                       Passo Sella      -> Sellagruppe, Val Gardena
                       Lizenz ODbL: Namensnennung UND Share-alike
  Overpass `around`    Nationalpark, Gipfel, Gewaesser, Wanderrouten
                       Kiel: Strand / Hafen / Bahnhof / Ort, 30 von 30
  BayernCloud          Touren mit km, Hoehenmetern, Dauer, Schwierigkeit,
                       Beschreibung, Bild. Bayerischer Wald 22/22,
                       Allgaeu 33/50, Berchtesgaden 0/9 (die Region hat dort
                       nur acht Touren, alles Fernradwege — das ist echt)
  Wien / Zuerich       Badtyp und Ausstattung aus je EINEM GET

WAS BEWUSST NICHT: Wikipedia als Kurztext je Ziel. Gemessen 43 % Trefferquote,
im Allgaeu 18 % — unsere Ziele heissen dort Halde, Saege, Klause. Und die
Falschtreffer sind gefaehrlich: "Nebelhorn" liefert den Artikel ueber das
SCHIFFSSIGNALHORN, "Feuerwehrhaus" einen Gattungsartikel, beide mit Bild.

Das Ergebnis wird in lib/ziele.json eingefroren und ist zum Durchsehen gedacht.
Zur Laufzeit wird nichts nachgeschlagen.

    python scripts/anreichern.py --nur overpass      # nur Gebiete + Kiel
    python scripts/anreichern.py --nur bct           # nur BayernCloud-Touren
    python scripts/anreichern.py --nur baeder        # nur Wien + Zuerich
    python scripts/anreichern.py                     # alles
    python scripts/anreichern.py --zeigen            # nichts schreiben

Stand: 02.08.2026
"""
import io
import json
import math
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict

HIER = os.path.dirname(os.path.abspath(__file__))
ZIELE = os.path.join(HIER, "..", "lib", "ziele.json")
SENSORS = os.path.join(HIER, "..", "lib", "sensors.json")
ENVDATEI = os.path.join(HIER, "..", ".env.local")
CACHE = os.path.join(HIER, ".anreichern-cache.json")

ZEIGEN = "--zeigen" in sys.argv
NUR = None
if "--nur" in sys.argv:
    NUR = sys.argv[sys.argv.index("--nur") + 1]

# overpass-api.de wirft unter Last 504. Die Spiegel sind langsamer, aber da.
OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
BCT = "https://data.bayerncloud.digital/api/v4"
KOPF = {"User-Agent": "besucherpuls/0.1 (+https://besucherpuls.friedemann-schuetz.de)"}


def geheim(name):
    k = os.environ.get(name)
    if k:
        return k.strip()
    for z in io.open(ENVDATEI, encoding="utf-8"):
        m = re.match(rf"\s*{name}\s*=\s*(.+)", z)
        if m:
            return m.group(1).strip().strip('"').strip("'")
    sys.exit(f"{name} nicht gefunden")


def hole(url, kopf=None, daten=None, timeout=180):
    r = urllib.request.Request(url, data=daten, headers={**KOPF, **(kopf or {})})
    return urllib.request.urlopen(r, timeout=timeout).read()


def jhole(url, kopf=None, daten=None, timeout=180):
    return json.loads(hole(url, kopf, daten, timeout))


def km(a, b):
    R = 6371.0
    dlat, dlon = math.radians(b[0] - a[0]), math.radians(b[1] - a[1])
    x = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlon / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(x))


# Cache ueber Laeufe hinweg. Die Umkreisabfragen kosten je 1-6 s; ohne Cache
# dauert ein erneuter Lauf ueber 175 Ziele eine Viertelstunde.
cache = {}
if os.path.exists(CACHE):
    try:
        cache = json.load(io.open(CACHE, encoding="utf-8"))
    except (ValueError, OSError):
        cache = {}


for _k in [k for k in cache if k.startswith("flaechen:")]:
    if cache[_k] and not cache[_k][0].get("id"):
        del cache[_k]          # alter Cache ohne id/typ ist unbrauchbar
for _k in [k for k in cache if k.startswith("geom:")]:
    del cache[_k]              # alter Cache mit offenen Segmenten statt Ringen


def cache_sichern():
    io.open(CACHE, "w", encoding="utf-8").write(json.dumps(cache, ensure_ascii=False))


def overpass(query, runden=2):
    """Fragt Overpass, mit Spiegel-Rueckfall und Wartezeit.

    Gemessen: overpass-api.de antwortet unter Last mit 504, die Spiegel mit 429.
    Ohne Pause zwischen den Versuchen laufen alle drei ins selbe Limit, und man
    bekommt fuer 175 Ziele fast nur leere Antworten. Zwei Runden ueber alle
    Spiegel mit wachsender Wartezeit holen praktisch alles.
    """
    for runde in range(runden):
        for i, url in enumerate(OVERPASS):
            try:
                return json.loads(hole(url, daten=("data=" + urllib.parse.quote(query)).encode(),
                                       kopf={"Content-Type": "application/x-www-form-urlencoded"},
                                       timeout=240))
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
                code = getattr(e, "code", "?")
                warte = 4 + runde * 12
                print(f"     Overpass {i + 1}/{len(OVERPASS)} ({code}), {warte}s warten")
                time.sleep(warte)
    return None


ziele = json.load(io.open(ZIELE, encoding="utf-8"))
sensoren = {s["id"]: s for s in json.load(io.open(SENSORS, encoding="utf-8"))["sensoren"]}
for z in ziele["ziele"]:
    z.setdefault("info", {})
# Beim Neulauf die geografischen Felder verwerfen: Ein alter, per Bounding Box
# gesetzter Wert bliebe sonst stehen, wenn die Polygonpruefung ihn ablehnt.
if NUR in (None, "overpass"):
    for z in ziele["ziele"]:
        z["info"].pop("gebiet", None)
        z["info"].pop("gebiet_wikidata", None)
        z["info"].pop("schutzgebiet", None)


# ==================================================================== Overpass
# Regionsnamen, die ein Gast kennt — und fuer Kiel die Lage.
#
# `is_in` liefert alle Flaechen, in denen ein Punkt liegt: Gebirgsgruppen,
# Taeler, Schutzgebiete, Verwaltungsgebiete. Genau das beantwortet "kennt der
# Gast Neuhausenbruecke?" mit "Berchtesgadener Alpen".
#
# NICHT genommen: `natural=valley`. Im 8-km-Umkreis von Neuhausenbruecke gibt es
# genau EIN getaggtes Tal, und das ist das falsche. Talnamen sind in OSM zu
# lueckenhaft, um darauf ein Merkmal zu bauen.

# Nach diesen Schluesseln wird das uebergeordnete Gebiet gesucht, in dieser
# Rangfolge. `boundary=administrative` faellt komplett raus: "Rubi" ist formal
# richtig und fuer einen Gast wertlos.
GEBIET_RANG = [
    ("natural", "mountain_range"),
    ("natural", "massif"),
    ("place", "region"),
]
# Schongebiete sind reines Rauschen: Um Neuhausenbruecke liegen sieben
# "Wald-Wild-Schongebiete" (protect_class 14), die kein Gast je gehoert hat.
SCHUTZ_RAUSCHEN = {"14", "97", "98", "99"}
# ZU GROSS, um zu helfen. Gemessen: Ohne diese Liste gewinnt bei JEDEM
# Alpen-Ziel schlicht "Alps" — es traegt dasselbe place=region wie
# "Berchtesgadener Alpen" und steht in der Antwort weiter vorn. Ein Gast, der
# liest "Neuhausenbruecke, Alps", weiss danach genau so viel wie vorher.
ZU_GROSS = {
    "alps", "alpen", "alpi", "eastern alps", "ostalpen", "westliche dolomiten",
    "deutschland", "deutschland (landmasse)", "oesterreich", "österreich",
    "italia", "italien", "schweiz", "suisse", "svizzera", "europe", "europa",
    "bayern", "suedbayern", "südbayern", "oberbayern", "niederbayern",
    "schwaben", "franken", "wien", "zürich", "zuerich", "kanton zürich",
    "schleswig-holstein", "trentino-alto adige/südtirol", "südtirol", "suedtirol",
    "mitteleuropa", "central europe", "dolomiti", "dolomiten",
    # Landschaftsraeume, die zwar stimmen, aber niemandem helfen. "Kalifornien
    # liegt in Holstein" beantwortet keine Frage, die ein Gast stellt.
    "holstein", "südschleswig", "suedschleswig", "schwansen", "angeln",
    "marchfeld", "wienerwald", "simmeringer haide", "emmentaler alpen",
    "swiss alps", "schweizer alpen", "nordtiroler kalkalpen",
}


def bbox_der_ziele(gruppe, rand=0.25):
    """Umschliessendes Rechteck aller Ziele eines Gebiets, mit Rand."""
    lats = [z["lat"] for z in ziele["ziele"] if z["gebiet"] == gruppe]
    lons = [z["lon"] for z in ziele["ziele"] if z["gebiet"] == gruppe]
    return (min(lats) - rand, min(lons) - rand, max(lats) + rand, max(lons) + rand)


def flaechen_holen(gruppe):
    """Alle benannten Gebietsflaechen im Umkreis eines Gebiets — EIN Abruf.

    Frueher lief hier ein `is_in` JE ZIEL, also 175 Abfragen. Gemessen: Nach
    25 Minuten waren keine 25 davon durch, und danach antwortete kein einziger
    Overpass-Spiegel mehr — der eigene Lauf hatte sie dichtgemacht. Zehn Abrufe
    statt 175 sind derselbe Erkenntnisgewinn bei 6 % der Last.

    `out tags bb` liefert Namen plus Bounding Box, nicht die volle Geometrie.
    Das ist Absicht: Die Geometrie der Alpen waere ein Vielfaches der Nutzlast,
    und fuer die Frage "in welcher Gebirgsgruppe liegt dieser Punkt" reicht das
    KLEINSTE umschliessende Rechteck. Die Naeherung ist an den Alpenzielen
    geprueft; wo sie nicht traegt, steht lieber gar kein Gebiet als ein falsches.
    """
    schluessel = f"flaechen:{gruppe}"
    if schluessel in cache:
        return cache[schluessel]
    s_, w_, n_, e_ = bbox_der_ziele(gruppe)
    box = f"{s_},{w_},{n_},{e_}"
    q = (f"[out:json][timeout:180];("
         f'way["natural"="mountain_range"]["name"]({box});'
         f'relation["natural"="mountain_range"]["name"]({box});'
         f'way["natural"="massif"]["name"]({box});'
         f'relation["natural"="massif"]["name"]({box});'
         f'way["place"="region"]["name"]({box});'
         f'relation["place"="region"]["name"]({box});'
         f'relation["boundary"="national_park"]["name"]({box});'
         f'relation["boundary"="protected_area"]["name"]["protect_class"~"^[1-6]$"]({box});'
         f");out tags bb;")
    d = overpass(q)
    if d is None:
        return None
    raus = []
    for el in d.get("elements", []):
        t = el.get("tags") or {}
        b = el.get("bounds") or {}
        if not t.get("name") or not b:
            continue
        if t.get("protect_class") in SCHUTZ_RAUSCHEN:
            continue
        raus.append({
            "id": el.get("id"), "typ": el.get("type"),
            "name": t["name"], "wikidata": t.get("wikidata"),
            "natural": t.get("natural"), "place": t.get("place"),
            "boundary": t.get("boundary"),
            "s": b["minlat"], "w": b["minlon"], "n": b["maxlat"], "e": b["maxlon"],
            "flaeche": (b["maxlat"] - b["minlat"]) * (b["maxlon"] - b["minlon"]),
        })
    cache[schluessel] = raus
    return raus


def ringe_bauen(segmente):
    """Setzt die Teilstuecke einer Multipolygon-Relation zu geschlossenen Ringen.

    DAS WAR DIE ZWEITE FALLE. Overpass liefert bei `out geom` fuer eine Relation
    ihre MITGLIEDER — offene Linienzuege, nicht fertige Ringe. Die "Allgaeuer
    Alpen" kamen als 48 Teilstuecke mit 5255 Punkten an; ein Strahlenschnitt auf
    ein offenes Segment ist bedeutungslos. Ergebnis: Nebelhorn lag angeblich in
    keinem einzigen Gebiet, obwohl die Flaeche vollstaendig vorlag.

    Die Enden passen exakt zusammen (OSM teilt sich die Knoten), deshalb reicht
    ein Vergleich auf Gleichheit — keine Toleranz noetig.
    """
    offen = [list(s) for s in segmente if len(s) >= 2]
    ringe = []
    while offen:
        akt = offen.pop(0)
        while akt[0] != akt[-1]:
            for i, s in enumerate(offen):
                if s[0] == akt[-1]:
                    akt.extend(s[1:]); offen.pop(i); break
                if s[-1] == akt[-1]:
                    akt.extend(reversed(s[:-1])); offen.pop(i); break
                if s[-1] == akt[0]:
                    akt = s[:-1] + akt; offen.pop(i); break
                if s[0] == akt[0]:
                    akt = list(reversed(s[1:])) + akt; offen.pop(i); break
            else:
                break          # kein Anschluss mehr — offener Zug, verwerfen
        if len(akt) >= 4 and akt[0] == akt[-1]:
            ringe.append(akt)
    return ringe


def im_polygon(lat, lon, ring):
    """Strahlenschnitt. `ring` ist eine Liste von (lat, lon)."""
    drin = False
    n = len(ring)
    for i in range(n):
        y1, x1 = ring[i]
        y2, x2 = ring[(i + 1) % n]
        if (y1 > lat) != (y2 > lat):
            x = (x2 - x1) * (lat - y1) / (y2 - y1) + x1
            if lon < x:
                drin = not drin
    return drin


def geometrie_holen(gruppe, flaechen):
    """Echte Umrisse fuer die Kandidaten eines Gebiets — EIN Abruf.

    WARUM NICHT DIE BOUNDING BOX. Der erste Versuch nahm die kleinste Box, die
    den Punkt enthaelt. Das Ergebnis sah plausibel aus und war falsch:
    Nebelhorn landete in den "Nordtiroler Kalkalpen" (es liegt in den Allgaeuer
    Alpen), Neuhausenbruecke im "Watzmannstock", das Seebad Utoquai in den
    "Swiss Alps" und das Kongressbad im "Wienerwald". Langgezogene Gebirgszuege
    haben Boxen, die weit ueber ihr Gebiet hinausreichen.

    Ein falscher Gebietsname ist schlimmer als keiner: Er klingt fundiert.
    """
    ids = [f["id"] for f in flaechen if f.get("id")][:60]
    if not ids:
        return {}
    schluessel = f"geom2:{gruppe}"
    if schluessel in cache:
        return {int(k): v for k, v in cache[schluessel].items()}
    wege = [str(i) for i, f in zip(ids, flaechen) if f["typ"] == "way"]
    rels = [str(i) for i, f in zip(ids, flaechen) if f["typ"] == "relation"]
    teile = []
    if wege:
        teile.append(f"way(id:{','.join(wege)});")
    if rels:
        teile.append(f"relation(id:{','.join(rels)});")
    d = overpass(f"[out:json][timeout:180];({''.join(teile)});out geom;")
    if d is None:
        return {}
    raus = {}
    for el in d.get("elements", []):
        if el.get("geometry"):
            # Ein einzelner Weg ist schon der Ring — sofern er geschlossen ist.
            r = [(pt["lat"], pt["lon"]) for pt in el["geometry"]]
            ringe = [r] if len(r) >= 4 and r[0] == r[-1] else []
        else:
            segmente = [[(pt["lat"], pt["lon"]) for pt in m["geometry"]]
                        for m in el.get("members", [])
                        if m.get("role") in (None, "", "outer") and m.get("geometry")]
            ringe = ringe_bauen(segmente)
        if ringe:
            raus[el["id"]] = ringe
    cache[schluessel] = {str(k): v for k, v in raus.items()}
    return raus


def name_kurz(n):
    """OSM fuehrt in Suedtirol dreisprachige Namen: "Puez Gruppe - Gruppo del
    Puez", "Grupa dl Sela - Gruppo del Sella - Sellagruppe". Auf einer Kachel
    ist das eine Zeile Rauschen; im Satz "Liegt in Puez Gruppe - Gruppo del
    Puez" wird es unlesbar. Die erste Variante genuegt."""
    for trenner in (" - ", " / ", " – "):
        if trenner in n:
            n = n.split(trenner)[0].strip()
    return n


def gebiet_waehlen(flaechen, z, geometrie=None):
    """Der Name, den ein Gast wiedererkennt — die KLEINSTE Flaeche, die passt.

    "Alps" enthaelt jedes Alpenziel und traegt dasselbe place=region wie
    "Berchtesgadener Alpen". Ohne das Groessenkriterium gewaenne durchgaengig
    "Alps" — ein Gast, der "Neuhausenbruecke, Alps" liest, weiss danach genau
    so viel wie vorher.
    """
    drin = [f for f in flaechen
            if f["s"] <= z["lat"] <= f["n"] and f["w"] <= z["lon"] <= f["e"]
            and (f["name"] or "").casefold() not in ZU_GROSS
            and (f["name"] or "").casefold() != (z["name"] or "").casefold()]
    # Und jetzt die eigentliche Pruefung: liegt der Punkt WIRKLICH drin?
    if geometrie:
        echt = []
        for f in drin:
            ringe = geometrie.get(f.get("id"))
            if ringe is None:
                continue          # ohne Umriss keine Behauptung
            if any(im_polygon(z["lat"], z["lon"], r) for r in ringe):
                echt.append(f)
        drin = echt
    nationalpark = min([f for f in drin if f.get("boundary") == "national_park"],
                       key=lambda f: f["flaeche"], default=None)
    fuer_gast = None
    for schluessel, wert in GEBIET_RANG:
        passend = [f for f in drin if f.get(schluessel) == wert]
        if passend:
            fuer_gast = min(passend, key=lambda f: f["flaeche"])
            break
    if not fuer_gast:
        rest = [f for f in drin if f.get("boundary") in ("protected_area", "national_park")]
        if rest:
            fuer_gast = min(rest, key=lambda f: f["flaeche"])
    return fuer_gast, nationalpark


KIEL_RADIUS_KM = 0.9


def kiel_lage(punkte):
    """Strand / Hafen / Bahnhof / See je Station — EIN Abruf fuer alle 30.

    Wie beim Gebiet: 30 Einzelabfragen haben die Overpass-Spiegel lahmgelegt.
    Ein Rechteck ueber die ganze Foerde kostet einen Abruf; die Zuordnung zur
    Station passiert danach hier, per Entfernung.
    """
    if "kiel:lage" in cache:
        gefunden = cache["kiel:lage"]
    else:
        lats = [z["lat"] for z in punkte]
        lons = [z["lon"] for z in punkte]
        box = f"{min(lats)-0.05},{min(lons)-0.05},{max(lats)+0.05},{max(lons)+0.05}"
        q = (f"[out:json][timeout:180];("
             f'node["railway"="station"]({box});'
             f'way["natural"="beach"]({box});'
             f'way["leisure"="marina"]({box});'
             f'way["natural"="water"]["name"]({box});'
             f");out center tags;")
        d = overpass(q)
        if d is None:
            return {}
        gefunden = []
        for el in d.get("elements", []):
            t = el.get("tags") or {}
            c = el.get("center") or el
            if c.get("lat") is None or c.get("lon") is None:
                continue
            art = ("bahnhof" if t.get("railway") == "station"
                   else "strand" if t.get("natural") == "beach"
                   else "hafen" if t.get("leisure") == "marina"
                   else "see" if t.get("natural") == "water" else None)
            if art:
                gefunden.append({"art": art, "lat": c["lat"], "lon": c["lon"]})
        cache["kiel:lage"] = gefunden

    raus = {}
    for z in punkte:
        lage = {g["art"] for g in gefunden
                if km((z["lat"], z["lon"]), (g["lat"], g["lon"])) <= KIEL_RADIUS_KM}
        if lage:
            raus[z["id"]] = sorted(lage)
    return raus


def lauf_overpass():
    print("\n=== Overpass: uebergeordnete Gebiete (ein Abruf je Gebiet) ===")
    ohne = []
    for g in sorted({z["gebiet"] for z in ziele["ziele"]}):
        flaechen = flaechen_holen(g)
        if flaechen is None:
            print(f"   {g:<18} Abruf fehlgeschlagen")
            continue
        cache_sichern()
        geometrie = geometrie_holen(g, flaechen)
        cache_sichern()
        teil = [z for z in ziele["ziele"] if z["gebiet"] == g]
        n = 0
        for z in teil:
            fuer_gast, nationalpark = gebiet_waehlen(flaechen, z, geometrie)
            if fuer_gast:
                z["info"]["gebiet"] = name_kurz(fuer_gast["name"])
                if fuer_gast.get("wikidata"):
                    z["info"]["gebiet_wikidata"] = fuer_gast["wikidata"]
                n += 1
            else:
                ohne.append(z["name"])
            if nationalpark:
                z["info"]["schutzgebiet"] = name_kurz(nationalpark["name"])
        beispiel = next((z["info"].get("gebiet") for z in teil if z["info"].get("gebiet")), "—")
        print(f"   {g:<18} {len(flaechen):>3} Flaechen, {len(geometrie)} mit Umriss"
              f"  ->  {n}/{len(teil)} Ziele   z. B. {beispiel}")
        time.sleep(2)
    cache_sichern()
    mit = sum(1 for z in ziele["ziele"] if z["info"].get("gebiet"))
    print(f"   {mit} von {len(ziele['ziele'])} Zielen haben ein Gebiet")
    if ohne:
        print(f"   ohne Gebiet ({len(ohne)}): {', '.join(ohne[:8])}"
              + (" …" if len(ohne) > 8 else ""))

    print("\n=== Overpass: Lage der Kieler Stationen ===")
    kiel = [z for z in ziele["ziele"] if z["gebiet"] == "kiel-foerde"]
    lagen = kiel_lage(kiel)
    cache_sichern()
    for z in kiel:
        if lagen.get(z["id"]):
            z["info"]["lage"] = lagen[z["id"]]
    zaehl = defaultdict(int)
    for z in kiel:
        for l in z["info"].get("lage", []):
            zaehl[l] += 1
    mit = sum(1 for z in kiel if z["info"].get("lage"))
    print(f"   {mit} von {len(kiel)} Stationen eingeordnet: {dict(zaehl)}")


# ================================================================ BayernCloud
# Touren im Umkreis. Eine Relation Parkplatz->Tour gibt es NICHT, und die
# Namenssuche ist unbrauchbar ("Wimbach" findet einen Rundweg 400 km entfernt).
# Es geht nur ueber Geo — und das funktioniert gut.
BCT_UMKREIS_M = 3000
BCT_MIN_KM = 1.5          # kuerzere "Touren" sind meist Spazierwege ohne Aussage


def bct_klassifikation(uuid, kopf):
    """Schwierigkeit & Co. stecken hinter einer eigenen Aufloesung. Cachen!"""
    s = f"bctcls:{uuid}"
    if s in cache:
        return cache[s]
    try:
        d = jhole(f"{BCT}/universal/{uuid}", kopf=kopf, timeout=60)
    except (urllib.error.HTTPError, urllib.error.URLError):
        cache[s] = None
        return None
    name = None
    for k in ("name", "dc:title", "title"):
        if isinstance(d.get(k), str):
            name = d[k]
            break
    cache[s] = name
    return name


SCHWER = {"leicht", "mittel", "schwer", "einfach", "schwierig"}

# POIs im Nahbereich. Die BayernCloud fuehrt 24 484 davon, und im Gegensatz zu
# den Touren decken sie auch Berchtesgaden ab (dort gibt es 0 Touren, aber
# 6 von 9 Zielen haben einen POI mit Beschreibungstext im Kilometer).
#
# Der beste Treffer ist der POI, der das ZIEL SELBST beschreibt: Fuer
# "Obermaiselstein-Grasgehren" liefert die Quelle "Parkplatz Grasgehren —
# Direkt im Wander- und Skigebiet Grasgehren unterhalb der Grasgehrenhuette
# mit Einstiegsmoeglichkeit fuer die Wanderung ...". Genau das will ein Gast
# wissen, und es steht dort woertlich.
POI_UMKREIS_M = 1200
POI_MAX_ZEICHEN = 240


def entzerrt(s):
    """Umlaute und Akzente weg — fuer den Namensabgleich mit den POIs."""
    s = (s or "").lower().replace("ä", "ae").replace("ö", "oe")
    s = s.replace("ü", "ue").replace("ß", "ss").replace("ë", "e")
    return re.sub(r"[^a-z0-9 ]", " ", s)


def text_sauber(t):
    t = re.sub(r"<[^>]+>", " ", t or "").replace("&nbsp;", " ").replace("&amp;", "&")
    t = re.sub(r"\s+", " ", t).strip()
    if len(t) > POI_MAX_ZEICHEN:
        # An der letzten Satzgrenze kappen — ein mitten im Wort abgeschnittener
        # Text wirkt kaputt, und das Modell wuerde ihn zu Ende erfinden.
        schnitt = t[:POI_MAX_ZEICHEN]
        punkt = max(schnitt.rfind(". "), schnitt.rfind("! "), schnitt.rfind("? "))
        t = (schnitt[:punkt + 1] if punkt > 80 else schnitt.rstrip() + " …")
    return t


def lauf_bct():
    print("\n=== BayernCloud: Touren im Umkreis ===")
    token = geheim("BAYERNCLOUD_TOKEN")
    kopf = {"Authorization": f"Bearer {token}"}
    bayern = [z for z in ziele["ziele"]
              if z["gebiet"] in ("allgaeu", "bayerischer-wald", "berchtesgaden")]
    print(f"   {len(bayern)} bayerische Ziele")

    treffer = 0
    for i, z in enumerate(bayern, 1):
        s = f"bct:{z['lat']:.5f},{z['lon']:.5f}"
        if s in cache:
            rohe = cache[s]
        else:
            u = (f"{BCT}/endpoints/list_tour?page[size]=40"
                 f"&filter[geo][in][perimeter][]={z['lon']}"
                 f"&filter[geo][in][perimeter][]={z['lat']}"
                 f"&filter[geo][in][perimeter][]={BCT_UMKREIS_M}")
            try:
                d = jhole(u, kopf=kopf, timeout=120)
            except (urllib.error.HTTPError, urllib.error.URLError) as e:
                print(f"   {z['name'][:30]:<30} Fehler {getattr(e, 'code', '?')}")
                continue
            rohe = []
            for o in d.get("@graph", []):
                laenge = o.get("dc:length")
                if not laenge:
                    continue
                rohe.append({
                    "name": o.get("name"),
                    "km": round(float(laenge) / 1000, 1),
                    "hm": int(float(o["dc:ascent"])) if o.get("dc:ascent") else None,
                    "min": int(float(o["dc:duration"])) if o.get("dc:duration") else None,
                    "cls": [c.get("@id") or c for c in (o.get("dc:classification") or [])
                            if isinstance(c, (str, dict))][:8],
                    "lizenz": o.get("cc:license") or o.get("sdLicense"),
                    "rund": bool(o.get("odta:circularTrail")),
                })
            cache[s] = rohe
            time.sleep(0.5)

        gute = [t for t in rohe if t["km"] >= BCT_MIN_KM]
        if not gute:
            continue
        # Die kuerzeste taugliche Tour: Wer am Parkplatz steht, will die Runde,
        # die von hier aus geht — nicht den laengsten Weitwanderweg der Region.
        t = min(gute, key=lambda x: x["km"])
        schwer = None
        for c in t.get("cls") or []:
            uuid = c if isinstance(c, str) else (c.get("@id") or "")
            uuid = uuid.rsplit("/", 1)[-1]
            if not uuid:
                continue
            name = bct_klassifikation(uuid, kopf)
            if name and name.lower() in SCHWER:
                schwer = name
                break
        z["info"]["tour"] = {k: v for k, v in {
            "name": t["name"], "km": t["km"], "hm": t["hm"], "min": t["min"],
            "schwierigkeit": schwer, "rund": t["rund"],
            "lizenz": t.get("lizenz"), "quelle": "BayernCloud Tourismus",
        }.items() if v is not None}
        treffer += 1
        if i % 20 == 0:
            print(f"   {i}/{len(bayern)} …")
            cache_sichern()
    cache_sichern()
    print(f"   {treffer} von {len(bayern)} bayerischen Zielen haben eine Tour")

    # --- POIs mit Beschreibungstext
    print("\n=== BayernCloud: POI-Beschreibungen im Nahbereich ===")
    poi_treffer = 0
    for i, z in enumerate(bayern, 1):
        s_ = f"poi:{z['lat']:.5f},{z['lon']:.5f}"
        if s_ in cache:
            rohe = cache[s_]
        else:
            u = (f"{BCT}/endpoints/list_poi?page[size]=25"
                 f"&filter[geo][in][perimeter][]={z['lon']}"
                 f"&filter[geo][in][perimeter][]={z['lat']}"
                 f"&filter[geo][in][perimeter][]={POI_UMKREIS_M}")
            try:
                d = jhole(u, kopf=kopf, timeout=120)
            except (urllib.error.HTTPError, urllib.error.URLError):
                continue
            rohe = []
            for o in d.get("@graph", []):
                t = text_sauber(o.get("description"))
                if not t:
                    continue
                rohe.append({
                    "name": o.get("name"), "text": t,
                    "lizenz": o.get("cc:license") or o.get("sdLicense"),
                })
            cache[s_] = rohe
            time.sleep(0.4)

        if not rohe:
            continue
        # Erst der POI, der das Ziel selbst beschreibt — sonst der erste beste.
        stamm = entzerrt(z["name"]).split()[-1] if z["name"] else ""
        eigen = next((r for r in rohe if stamm and stamm in entzerrt(r["name"] or "")), None)
        r = eigen or rohe[0]
        z["info"]["poi"] = {
            "name": r["name"], "text": r["text"],
            "lizenz": r.get("lizenz"), "quelle": "BayernCloud Tourismus",
            "eigen": bool(eigen),
        }
        poi_treffer += 1
        if i % 20 == 0:
            cache_sichern()
    cache_sichern()
    print(f"   {poi_treffer} von {len(bayern)} Zielen haben eine POI-Beschreibung")
    eigen = sum(1 for z in bayern if (z["info"].get("poi") or {}).get("eigen"))
    print(f"   davon {eigen} ueber das Ziel SELBST (nicht nur die Nachbarschaft)")
    for g in ("allgaeu", "bayerischer-wald", "berchtesgaden"):
        teil = [z for z in bayern if z["gebiet"] == g]
        n = sum(1 for z in teil if z["info"].get("tour"))
        print(f"      {g:<18} {n}/{len(teil)}")


# ===================================================================== Baeder
WIEN_WFS = ("https://data.wien.gv.at/daten/geo?service=WFS&request=GetFeature"
            "&version=1.1.0&typeName=ogdwien:SPORTSTAETTENOGD&srsName=EPSG:4326"
            "&outputFormat=json")
ZH_WFS = ("https://www.ogd.stadt-zuerich.ch/wfs/geoportal/Sport?SERVICE=WFS"
          "&REQUEST=GetFeature&VERSION=1.1.0&TYPENAME={layer}&SRSNAME=EPSG:4326"
          "&outputFormat=GeoJSON")
ZH_LAYER = {"poi_flussbad_view": "Flussbad", "poi_freibad_view": "Freibad",
            "poi_hallenbad_view": "Hallenbad", "poi_seebad_view": "Seebad"}
# Aus dem Freitext SPORTSTAETTEN_ART den Badtyp ziehen, Rest ist Ausstattung.
WIEN_TYPEN = ["Kombibad", "Hallenbad", "Sommerbad", "Familienbad", "Freibad", "Strandbad"]

# Badtyp -> Kategorie fuer die Filterleiste. Die Oberkategorie "see" bleibt
# IMMER daneben stehen: Sonst faende ein volles Hallenbad nie ein Freibad als
# Alternative, weil die Empfehlung ueber die Schnittmenge von `arten` geht.
BADTYP_ART = {
    "Hallenbad": "hallenbad",
    "Kombibad": "kombibad",
    "Familienbad": "familienbad",
    "Sommerbad": "sommerbad",
    "Freibad": "freibad",
    "Strandbad": "strandbad",
    "Flussbad": "flussbad",
    "Seebad": "seebad",
}


def badtyp_setzen(z, typ):
    """Badtyp eintragen UND als Kategorie fuehren, damit oben ein Filter steht."""
    z["info"]["badtyp"] = typ
    art = BADTYP_ART.get(typ)
    if not art:
        return
    z["art"] = art
    ober = [a for a in (z.get("arten") or []) if a not in BADTYP_ART.values()]
    z["arten"] = [art] + [a for a in ober if a != art]


def ausstattung_sauber(art):
    """Aus dem Freitext die Ausstattung ziehen.

    Der Wiener Datensatz mischt HTML hinein: "Familienbad<br />Tischtennis<br />
    Beachvolleyballplatz". Ungefiltert stand auf der Karte "<br />Tischtennis".
    """
    roh = re.sub(r"<[^>]+>", ",", art or "")
    teile = [t.strip(" .;") for t in re.split(r"[,;]", roh)]
    raus, gesehen = [], set()
    for t in teile:
        if len(t) < 3 or t in WIEN_TYPEN:
            continue
        k = t.casefold()
        if k in gesehen:
            continue
        gesehen.add(k)
        raus.append(t)
    return raus[:4]


def lauf_baeder():
    print("\n=== Wien: Badtyp und Ausstattung ===")
    d = jhole(WIEN_WFS, timeout=120)
    # Der Layer fuehrt ALLE 1543 Sportstaetten der Stadt. Ohne Filter waere die
    # naechstgelegene oft eine Sporthalle oder ein Fussballplatz — und das Bad
    # traege dann "Sporthalle (Badminton, Basketball …)" als Typ.
    orte = []
    for f in d.get("features", []):
        g = (f.get("geometry") or {}).get("coordinates")
        p = f.get("properties") or {}
        art = (p.get("SPORTSTAETTEN_ART") or "")
        if not g or "bad" not in art.lower():
            continue
        orte.append((g[1], g[0], p))
    print(f"   {len(orte)} von {len(d.get('features', []))} Sportstaetten sind Baeder")
    wien = [z for z in ziele["ziele"] if z["gebiet"] == "wien-baeder"]
    n = 0
    for z in wien:
        nah = [(km((z["lat"], z["lon"]), (la, lo)), p) for la, lo, p in orte]
        nah = [x for x in nah if x[0] < 0.15]
        if not nah:
            continue
        _, p = min(nah, key=lambda x: x[0])
        art = p["SPORTSTAETTEN_ART"]
        typ = next((t for t in WIEN_TYPEN if t.lower() in art.lower()), None)
        extra = ausstattung_sauber(art)
        if typ:
            badtyp_setzen(z, typ)
        if extra:
            z["info"]["ausstattung"] = extra
        if p.get("KATEGORIE_TXT"):
            z["info"]["drinnen"] = "indoor" in p["KATEGORIE_TXT"].lower()
        n += 1
    print(f"   {n} von {len(wien)} Wiener Baedern zugeordnet")

    print("\n=== Zuerich: Badtyp, Oeffnungszeiten ===")
    zh = [z for z in ziele["ziele"] if z["gebiet"] == "zuerich-baeder"]
    # Erst ALLE Kandidaten sammeln, dann je Bad den naechsten nehmen. Ein Bad
    # kann in zwei Layern stehen (ein Seebad mit Becken); wer beim ersten
    # Treffer zuschlaegt, bekommt den Typ des zufaellig zuerst geladenen Layers.
    kandidaten = []
    for layer, typ in ZH_LAYER.items():
        try:
            d = jhole(ZH_WFS.format(layer=layer), timeout=90)
        except (urllib.error.HTTPError, urllib.error.URLError) as e:
            print(f"   {layer}: Fehler {getattr(e, 'code', '?')}")
            continue
        for f in d.get("features", []):
            g = (f.get("geometry") or {}).get("coordinates")
            if not g:
                continue
            la, lo = (g[1], g[0]) if isinstance(g[0], (int, float)) else (g[0][1], g[0][0])
            kandidaten.append((la, lo, typ, f.get("properties") or {}))

    gefunden = 0
    for z in zh:
        nah = [(km((z["lat"], z["lon"]), (la, lo)), typ, p) for la, lo, typ, p in kandidaten]
        nah = [x for x in nah if x[0] < 0.25]
        if not nah:
            continue
        _, typ, p = min(nah, key=lambda x: x[0])
        badtyp_setzen(z, typ)
        tage = [p.get(f"oeffnungszeiten_gebaeude_{t}")
                for t in ("mo", "di", "mi", "do", "fr", "sa", "so")]
        if any(tage):
            z["info"]["oeffnung"] = tage
        if p.get("zvv_label"):
            z["info"]["haltestelle"] = p["zvv_label"]
        gefunden += 1
    print(f"   {gefunden} von {len(zh)} Zuercher Baedern zugeordnet")
    ohne = [z["name"] for z in zh if not z["info"].get("badtyp")]
    if ohne:
        print(f"   ohne Typ: {', '.join(ohne)}")


# ======================================================================= Lauf
if NUR in (None, "overpass"):
    lauf_overpass()
if NUR in (None, "bct"):
    lauf_bct()
if NUR in (None, "baeder"):
    lauf_baeder()

mit_info = sum(1 for z in ziele["ziele"] if z["info"])
print(f"\n{mit_info} von {len(ziele['ziele'])} Zielen haben mindestens eine Zusatzinfo")

if ZEIGEN:
    print("--zeigen: nichts geschrieben")
    sys.exit(0)

io.open(ZIELE, "w", encoding="utf-8").write(
    json.dumps(ziele, ensure_ascii=False, indent=2))
print(f"lib/ziele.json geschrieben ({os.path.getsize(ZIELE) / 1024:.0f} KB)")
