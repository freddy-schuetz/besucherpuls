"""Baut die Zielebene: lib/ziele.json.

WARUM. Bisher war der Messpunkt das Grundobjekt — die Seite zeigte Parkplaetze
und schlug Parkplaetze vor. Ein Gast denkt aber in Zielen: Nebelhorn, Sellajoch,
Thumsee. Erst mit einer Zielebene funktionieren Kategorien, Zieleingabe und
Empfehlung zusammen: "Nebelhorn ist voll — Fellhorn ist auch eine Bergbahn,
8 km, dort ist Platz."

WIE. Ein Ziel entsteht aus einem oder mehreren Messpunkten, die denselben Ort
erschliessen. Erkannt wird das am Namensstamm (nach Abzug von "Parkplatz",
"P1", "Nord", "Talstation" …) plus raeumlicher Naehe. Die Zielart kommt aus
Stichwoertern — DEUTSCH UND ITALIENISCH, denn Groeden war zu 100 % "sonstiges",
weil meine Liste nur deutsche Woerter kannte.

Ein Ziel kann mehreren Kategorien angehoeren: Ein Nationalpark-Einstieg ist
auch Wandern. Genau daran fehlte im Bayerischen Wald die Kategorie "Wandern".

Das Ergebnis ist zum Durchsehen gedacht:

    python scripts/ziele_bauen.py --zeigen     # nur anzeigen
    python scripts/ziele_bauen.py              # schreiben

Stand: 02.08.2026
"""
import io
import json
import math
import os
import re
import sys
import unicodedata
from collections import defaultdict

HIER = os.path.dirname(os.path.abspath(__file__))
SENSORS = os.path.join(HIER, "..", "lib", "sensors.json")
ZIELE = os.path.join(HIER, "..", "lib", "ziele.json")
ZEIGEN = "--zeigen" in sys.argv

# Kategorien in Gaestesprache. Reihenfolge = Rangfolge fuer die Hauptart.
# `auch` sind zusaetzliche Kategorien, unter denen das Ziel ebenfalls auftaucht.
KATEGORIEN = [
    ("bergbahn", "Bergbahn", ["wandern"], [
        "talstation", "seilbahn", "schwebebahn", "sesselbahn", "gondel", "bergbahn",
        "kabinenbahn", "funivia", "cabinovia", "seggiovia", "lift", "sonnenlifte",
        "fellhorn", "ifen", "nebelhorn", "soellereck", "kanzelwand", "hoernerbahn",
        "alpspitzbahn", "breitenberg", "kehlstein", "predigtstuhl", "jenner",
        "hochschwarzeck", "arber", "silberberg", "walmendingerhorn", "hochgrat",
        "dantercepies", "seceda", "ciampinoi", "col rodella", "herzogstand",
    ]),
    ("klamm", "Klamm & Wasserfall", ["wandern"], [
        "klamm", "wasserfall", "tobel", "schlucht", "cascata", "starzlach",
        "buchenegger", "breitach", "scheidegger",
    ]),
    ("see", "See & Baden", [], [
        "see", "weiher", "lago", "badesee", "strandbad", "freibad", "thumsee",
        "alpsee", "eibsee", "hintersee", "stausee", "seeufer", "badeplatz",
    ]),
    ("nationalpark", "Nationalpark", ["wandern"], [
        "nationalpark", "lusen", "falkenstein", "igelbus", "wistlberg",
        "waldhaeuser", "zwieslerwaldhaus", "racheldiensthuette", "fredenbruecke",
        "graupsaege", "finsterau", "schoenebene", "wimbach", "hirschbichl",
    ]),
    ("wandern", "Wandern", [], [
        "wanderparkplatz", "wander", "alm", "malga", "huette", "rifugio", "joch",
        "passo", "pass", "sattel", "aussicht", "panorama", "gipfel", "steig",
        "hoehe", "berg", "horn", "kopf", "spitze", "vallunga", "monte", "gralba",
        "sella", "gardena", "pana", "autal", "stubenbach", "eckhalde", "himmelseck",
        "haldertobel", "prodel", "denneberg", "grasgehren", "paldingeralm",
        "neuhausenbruecke", "wachterl", "seeklause", "listsee",
    ]),
    ("rad", "Rad leihen & abgeben", [], ["__nie__"]),
    ("stadt", "In der Stadt unterwegs", [], ["__nie2__"]),
    ("anreise", "Anreise", [], [
        "bahnhof", "p+r", "park and ride", "park+ride", "busbahnhof", "zob",
        "haltestelle", "bushof",
    ]),
    ("ort", "Im Ort", [], [
        "rathaus", "zentrum", "marktplatz", "kurhaus", "kurpark", "innenstadt",
        "schulzentrum", "stadtwerke", "festplatz", "friedhof", "krankenhaus",
        "eissporthalle", "tiefgarage", "parkhaus", "hallenbad", "einkauf",
        "terme", "plaza",
    ]),
]
KAT_TEXT = {k: t for k, t, _, _ in KATEGORIEN}
KAT_AUCH = {k: a for k, _, a, _ in KATEGORIEN}

# Was am Namen weggeschnitten wird, um den Ortsstamm zu finden.
VORSILBEN = ["parkplatz", "parkplattz", "wanderparkplatz", "parcheggio", "garage",
             "p+r", "tfg", "tg", "parkhaus", "tiefgarage"]
NACHSILBEN = [r"\bp\s?\d+\b", r"\bnord\b", r"\bsued\b", r"\bsüd\b", r"\bwest\b",
              r"\bost\b", r"\btalstation\b", r"\bbergstation\b", r"\bzufahrt\b",
              r"\b\d+\b", r"\brichtung .*$", r"\bmax\..*$"]

EIN_ZIEL_KM = 2.5      # so nah duerfen zwei Zugaenge desselben Ziels auseinanderliegen


def entzerrt(s):
    s = s.lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    s = s.replace("ë", "e").replace("è", "e").replace("é", "e").replace("à", "a")
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


# Endungsregeln. Im Deutschen traegt die Endung die Bedeutung: Was auf -bahn
# endet, ist eine Bahn; was auf -weg endet, ein Weg. Ohne diese Regeln landeten
# "Ossi-Reichert-Bahn" und "Lappachweg" unter "Sonstiges" — auf der Kachel stand
# dann ein Wort, das nichts sagt, und der Kategoriefilter fand sie nicht.
# Zuerst gepruefte Stichwoerter, dann diese Regeln: Ein Treffer in der Liste ist
# immer der genauere.
ENDUNGEN = [
    (r"(bahn|lift)$", "bergbahn"),
    (r"(weg|steig|pfad|runde|schleife)$", "wandern"),
    (r"(tal|alpe|alm|hoeh|blick|eck|ries|au)$", "wandern"),
    (r"(faelle|fall|bach|ache)$", "klamm"),
    (r"(bad|aquaria|therme|badi)$", "see"),
    (r"(strasse|platz|gasse|weiler|dorf|hof|halle|garten|haus|schule|kirche)$", "ort"),
]


def kategorie_von(name):
    n = entzerrt(name)
    for k, _, _, woerter in KATEGORIEN:
        for w in woerter:
            if entzerrt(w) in n:
                return k
    # Endung des letzten BEDEUTUNGSTRAGENDEN Wortes. Auf dem Rohnamen greift das
    # nicht: "Parkplatz Achtal P2" endet auf "p2". Deshalb erst das Parkplatz-
    # Vokabular und die Nummerierung abziehen (stamm) und dann pruefen —
    # "Berg Hansmarte-Weg" endet auf "weg", "Haus des Gastes" nicht auf "haus".
    kern = stamm(name).strip()
    letztes = re.split(r"\s+", kern)[-1] if kern else ""
    for muster, k in ENDUNGEN:
        if re.search(muster, letztes):
            return k
    return "sonstiges"


def stamm(name):
    """Ortsstamm: Name ohne Parkplatz-Vokabular und ohne Nummerierung."""
    n = entzerrt(name)
    for v in VORSILBEN:
        n = re.sub(rf"^{re.escape(v)}\b", " ", n)
        n = n.replace(f" {v} ", " ")
    for muster in NACHSILBEN:
        n = re.sub(muster, " ", n)
    n = re.sub(r"[^a-z ]", " ", n)
    return " ".join(n.split()).strip()


def km(a, b):
    R = 6371.0
    dlat, dlon = math.radians(b[0] - a[0]), math.radians(b[1] - a[1])
    x = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlon / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(x))


def titel(name):
    """Anzeigename des Ziels: Parkplatz-Vokabular weg, Rest im Original."""
    t = name
    for v in ("Wanderparkplatz ", "Parkplatz ", "Parkplattz ", "Parcheggio + Garage ",
              "Parcheggio ", "Garage ", "P+R ", "TFG ", "TG "):
        if t.startswith(v):
            t = t[len(v):]
    t = re.sub(r"\s+P\s?\d+$", "", t)
    t = re.sub(r"\s+(Nord|Süd|Sued|West|Ost)$", "", t)
    t = re.sub(r"\s+Talstation$", "", t)
    # Bruchstuecke wie "an der Breitenbergbahn" oder "des Freibades Am Kleinen
    # Alpsee" entstehen, wenn nur "Parkplatz " abgeschnitten wird.
    t = re.sub(r"^(an der|an dem|am|an|des|der|die|das|beim|bei|zur|zum|vor der)\s+", "", t, flags=re.I)
    # Reste wie "Philippsreut -" oder "Breitenbergbahn Parkplatz" bleiben sonst
    # stehen, weil das Wort nicht am Anfang stand.
    t = re.sub(r"\s+(Parkplatz|Parkplaetze|Parkfläche)$", "", t, flags=re.I)
    t = t.strip(' -–"„“')
    return t.strip() or name


daten = json.load(io.open(SENSORS, encoding="utf-8"))
sensoren = daten["sensoren"]

ziele = []
for gruppe in sorted({s.get("gruppe") for s in sensoren if s.get("gruppe")}):
    punkte = [s for s in sensoren if s.get("gruppe") == gruppe]

    # Baeder und Leihradstationen sind selbst schon das Ziel — ein Bad hat keine
    # "Zugaenge", es IST der Ort. Nur Parkplaetze werden gebuendelt.
    if punkte[0].get("metrik") != "frei_plaetze":
        # Die Art kommt aus der QUELLE, nicht aus der Metrik. Vorher galten
        # Luzerns Fussgaengerzaehler als "Baden" und alle 30 Kieler
        # Leihradstationen als "Anreise" — beides schlicht falsch.
        art = {
            "zh_baeder": "see", "wien_baeder": "see",
            "kiel_gbfs": "rad", "st_rad": "rad", "gbfs": "rad",
            "luzern": "stadt",
        }.get(punkte[0]["quelle"], "sonstiges")
        for s in punkte:
            ziele.append({
                "id": s["id"], "name": s["name"], "gebiet": gruppe,
                "art": art, "arten": [art], "ort": s.get("ort") or "",
                "lat": s["lat"], "lon": s["lon"], "zugaenge": [s["id"]],
            })
        continue

    # ORTSPARKPLAETZE JE GEMEINDE BUENDELN.
    #
    # 33 der 81 bayerischen Ziele hiessen Feuerwehrhaus, Dorf, Halde, Klause
    # oder Bechen 2 — fuer einen Gast nichtssagend, und als 33 einzelne Kacheln
    # erschlagen sie die touristischen Ziele daneben. Zusammengefasst wird
    # ausschliesslich ueber die KATEGORIE, nie ueber die Gemeinde als solche:
    # Sonst verschwaenden Nebelhorn, Fellhorn, Ifen und Soellereck in einer
    # Kachel "Oberstdorf" mit 11 km Durchmesser — also genau die Ziele, um die
    # es geht. Die Zugaenge stehen einzeln mit Entfernung in der Kachel; in
    # Pfronten liegen Kappel und Steinach 4,96 km auseinander, das darf die
    # Sammelzahl nicht verschweigen.
    offen = []
    je_gemeinde = defaultdict(list)
    for s in punkte:
        if kategorie_von(s["name"]) in ("ort", "sonstiges") and s.get("ort"):
            je_gemeinde[s["ort"]].append(s)
        else:
            offen.append(s)
    for gemeinde, gruppe_p in je_gemeinde.items():
        if len(gruppe_p) < 2:
            offen.extend(gruppe_p)          # eine einzelne Kachel bleibt einzeln
            continue
        ziele.append({
            "id": "z-ort-" + re.sub(r"[^a-z0-9]+", "-", entzerrt(gemeinde)).strip("-")[:32],
            "name": gemeinde,
            "gebiet": gruppe,
            "art": "ort",
            "arten": ["ort"],
            "ort": gemeinde,
            "lat": round(sum(h["lat"] for h in gruppe_p) / len(gruppe_p), 6),
            "lon": round(sum(h["lon"] for h in gruppe_p) / len(gruppe_p), 6),
            "zugaenge": [h["id"] for h in gruppe_p],
            "ortsziel": True,
        })

    while offen:
        kern = offen.pop(0)
        k_stamm, k_art = stamm(kern["name"]), kategorie_von(kern["name"])
        haufen = [kern]
        i = 0
        while i < len(offen):
            k = offen[i]
            # Gleicher Stamm ODER einer steckt im anderen: "Nebelhorn" und
            # "Nebelhorn Oybele" sind dasselbe Ziel, ebenso "Breitenbergbahn
            # Parkplatz" und "an der Breitenbergbahn".
            k_st = stamm(k["name"])
            verwandt = k_st == k_stamm or (
                len(k_st) >= 5 and len(k_stamm) >= 5
                and (k_st in k_stamm or k_stamm in k_st))
            gleich = (verwandt and k_stamm != ""
                      and km((k["lat"], k["lon"]), (kern["lat"], kern["lon"])) <= EIN_ZIEL_KM)
            if gleich:
                haufen.append(offen.pop(i))
            else:
                i += 1
        arten = [k_art] + [a for a in KAT_AUCH.get(k_art, []) if a != k_art]
        ziele.append({
            "id": "z-" + re.sub(r"[^a-z0-9]+", "-", entzerrt(titel(kern["name"]))).strip("-")[:38]
                  + ("" if len(haufen) == 1 else ""),
            "name": titel(kern["name"]),
            "gebiet": gruppe,
            "art": k_art,
            "arten": arten,
            # Die Gemeinde. Wo die Kategorie "sonstiges" bleibt, steht auf der
            # Kachel sonst ein Wort, das nichts sagt — der Ortsname dagegen ist
            # echte Information.
            "ort": kern.get("ort") or "",
            "lat": round(sum(h["lat"] for h in haufen) / len(haufen), 6),
            "lon": round(sum(h["lon"] for h in haufen) / len(haufen), 6),
            "zugaenge": [h["id"] for h in haufen],
        })

# Doppelte IDs entschaerfen (zwei Ziele gleichen Namens in verschiedenen Gemeinden)
gesehen = defaultdict(int)
for z in ziele:
    gesehen[z["id"]] += 1
    if gesehen[z["id"]] > 1:
        z["id"] = f"{z['id']}-{gesehen[z['id']]}"

print(f"{len(sensoren)} Messpunkte  ->  {len(ziele)} Ziele\n")
for gruppe in sorted({z["gebiet"] for z in ziele}):
    g = [z for z in ziele if z["gebiet"] == gruppe]
    kat = defaultdict(int)
    for z in g:
        kat[z["art"]] += 1
    mehrfach = sum(1 for z in g if len(z["zugaenge"]) > 1)
    print(f"  {gruppe:<18} {len(g):>3} Ziele, {mehrfach} mit mehreren Zugängen")
    print(f"     {dict(sorted(kat.items(), key=lambda x: -x[1]))}")

if ZEIGEN:
    print("\nZur Kontrolle — jedes Ziel mit seinen Zugängen:")
    for gruppe in sorted({z["gebiet"] for z in ziele}):
        print(f"\n--- {gruppe} ---")
        for z in sorted([x for x in ziele if x["gebiet"] == gruppe], key=lambda x: (x["art"], x["name"])):
            zug = "" if len(z["zugaenge"]) == 1 else f"  ({len(z['zugaenge'])} Zugänge)"
            print(f"   {KAT_TEXT.get(z['art'], z['art']):<20} {z['name'][:42]:<42}{zug}")
    sys.exit(0)

with open(ZIELE, "w", encoding="utf-8") as f:
    json.dump({"anzahl": len(ziele), "ziele": ziele}, f, ensure_ascii=False, indent=2)
print(f"\nlib/ziele.json geschrieben")
