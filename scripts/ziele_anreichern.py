"""Bestimmt je Parkplatz, WOFUER er da ist — und schreibt das in sensors.json.

WARUM. Die Empfehlung kannte bisher nur Nähe und Leere. Deshalb schickte sie
Gäste vom "Parkplatz Bahnhof Oberstaufen" 12,6 km zum "Parkplatz Alpsee P3" —
räumlich naheliegend, inhaltlich Unsinn. Ein Bahnhofsparkplatz ist kein Ersatz
für einen Badesee.

WORAUS. Ursprünglich war ein Durchlauf über die Beschreibungstexte geplant. Die
gibt es aber fast nicht: Von 198 bayerischen Objekten mit Zeitreihe haben nur 17
eine Beschreibung. Was ALLE haben, ist ein sprechender Name plus Koordinaten —
"Parkplatz Fellhornbahn Talstation", "Parkplatz Starzlachklamm", "Parkplatz
Waldhäuser Ausblick". Daraus lässt sich die Art des Ziels sauber ableiten.

Das Ergebnis wird eingefroren: Es landet als Feld `ziel` in lib/sensors.json,
ist versioniert, lesbar und von Hand korrigierbar. Zur Laufzeit läuft nichts
davon nochmal.

    python scripts/ziele_anreichern.py [--zeigen]

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
ZEIGEN = "--zeigen" in sys.argv

# Reihenfolge ist Rangfolge: Der erste Treffer gewinnt. Deshalb steht das
# Spezifische oben — "Alpseebahn" ist eine Bergbahn, kein See.
ARTEN = [
    ("bergbahn", [
        "bahn talstation", "seilbahn", "schwebebahn", "sesselbahn", "gondel",
        "bergbahn", "fellhorn", "ifenbahn", "nebelhorn", "soellereck", "söllereck",
        "kanzelwand", "hoernerbahn", "hörnerbahn", "alpspitzbahn", "breitenbergbahn",
        "kehlstein", "predigtstuhl", "jennerbahn", "hochschwarzeck", "kabinenbahn",
        "arberbergbahn", "silberberg", "walmendingerhorn", "hochgrat",
    ]),
    ("nationalpark", [
        "nationalpark", "lusen", "falkenstein", "igelbus", "wistlberg",
        "waldhaeuser", "waldhäuser", "zwieslerwaldhaus", "racheldiensthuette",
        "fredenbruecke", "fredenbrücke", "graupsaege", "graupsäge", "finsterau",
    ]),
    ("wasser", [
        "wasserfall", "klamm", "tobel", "schlucht", "see", "weiher", "bad",
        "therme", "strand", "wimbach", "thumsee", "alpsee", "koenigssee",
        "königssee", "hintersee", "eibsee", "staussee", "stausee",
    ]),
    ("wandern", [
        "wanderparkplatz", "wander", "alm", "huette", "hütte", "joch", "sattel",
        "aussicht", "panorama", "gipfel", "steig", "hoehe", "höh", "berg",
        "horn", "kopf", "spitze", "eck", "hirschbichl", "hinterbrand",
    ]),
    ("anreise", [
        "bahnhof", "p+r", "park and ride", "park+ride", "busbahnhof", "zob",
        "haltestelle", "bushof",
    ]),
    # Bewusst nur starke Signale. "strasse", "platz" oder "weg" standen hier
    # zuerst mit drin — damit landeten 56 von 119 Punkten als Ortsparkplatz,
    # darunter die Arberhochstrasse und die Halden Sonnenlifte. Was nicht sicher
    # zuzuordnen ist, wird lieber "sonstiges" und bleibt aus der Empfehlung raus.
    ("ort", [
        "rathaus", "zentrum", "marktplatz", "kurhaus", "kurpark", "innenstadt",
        "schulzentrum", "stadtwerke", "festplatz", "friedhof", "krankenhaus",
        "eissporthalle", "tiefgarage", "parkhaus", "hallenbad", "einkauf",
    ]),
]

ART_TEXT = {
    "bergbahn": "Bergbahn-Talstation",
    "nationalpark": "Nationalpark-Zugang",
    "wasser": "See, Bad oder Wasserfall",
    "wandern": "Wandereinstieg",
    "anreise": "Bahnhof / Park & Ride",
    "ort": "Ortsparkplatz",
    "sonstiges": "sonstiges Ziel",
}

# Nur zwischen diesen Arten darf ueberhaupt getauscht werden. Ein Wandereinstieg
# ersetzt einen anderen Wandereinstieg oder eine Talstation — aber niemals einen
# Bahnhof, und ein Ortsparkplatz ersetzt gar nichts.
TAUSCHBAR = {
    "bergbahn": {"bergbahn", "wandern"},
    "wandern": {"wandern", "bergbahn", "nationalpark"},
    "nationalpark": {"nationalpark", "wandern"},
    "wasser": {"wasser"},
    "anreise": {"anreise"},
    "ort": {"ort"},
    "sonstiges": set(),
}

# Zwei Parkplaetze naeher als das erschliessen dasselbe Ziel — dann ist der
# Wechsel kein Ausflug, sondern ein Schwenk auf den Nachbarplatz.
EINSTIEG_KM = 0.9


def entzerrt(s):
    s = s.lower().replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def art_von(name):
    n = entzerrt(name)
    for art, woerter in ARTEN:
        for w in woerter:
            if entzerrt(w) in n:
                return art
    return "sonstiges"


def km(a, b):
    R = 6371.0
    dlat = math.radians(b[0] - a[0])
    dlon = math.radians(b[1] - a[1])
    x = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlon / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(x))


daten = json.load(io.open(SENSORS, encoding="utf-8"))
sensoren = daten["sensoren"]

# Nur Parkplaetze — Baeder und Leihradstationen brauchen keine Zielart, dort ist
# die Gruppe selbst schon die Menge austauschbarer Ziele.
kandidaten = [s for s in sensoren if s.get("metrik") == "frei_plaetze"]
print(f"{len(kandidaten)} Parkplätze werden eingeordnet\n")

for s in kandidaten:
    s["ziel"] = {"art": art_von(s["name"]), "einstieg": None}

# Einstiegs-Gruppen: raeumlich dicht UND gleiche Art. Einfaches Verketten reicht
# hier — die Punkte liegen entweder klar zusammen oder klar auseinander.
nach_gruppe = defaultdict(list)
for s in kandidaten:
    nach_gruppe[s.get("gruppe")].append(s)

n_einstieg = 0
for gruppe, liste in nach_gruppe.items():
    offen = list(liste)
    while offen:
        kern = offen.pop(0)
        haufen = [kern]
        i = 0
        while i < len(offen):
            k = offen[i]
            if (k["ziel"]["art"] == kern["ziel"]["art"]
                    and any(km((k["lat"], k["lon"]), (h["lat"], h["lon"])) <= EINSTIEG_KM
                            for h in haufen)):
                haufen.append(offen.pop(i))
            else:
                i += 1
        # Nur zielartige Punkte buendeln. Zwei Ortsparkplaetze im selben Dorf
        # sind keine "zwei Zugaenge zum selben Ziel" — das erledigt Stufe 3.
        if len(haufen) > 1 and kern["ziel"]["art"] in ("bergbahn", "nationalpark", "wasser", "wandern"):
            # Interner Schluessel, keine Anzeige. Ein aus Namen zusammengesetzter
            # Titel ging daneben, sobald die Namen auseinanderliefen
            # ("Gruentenstrasse" landete unter "Vitalpark Wohnmobil").
            schluessel = f"{gruppe}-{n_einstieg}"
            for h in haufen:
                h["ziel"]["einstieg"] = schluessel
            n_einstieg += 1

verteilung = defaultdict(int)
for s in kandidaten:
    verteilung[s["ziel"]["art"]] += 1
print("Zielarten:")
for a, n in sorted(verteilung.items(), key=lambda x: -x[1]):
    print(f"   {ART_TEXT[a]:<28} {n:>4}")
print(f"\n{n_einstieg} gemeinsame Einstiege gefunden")

if ZEIGEN:
    print("\nZur Kontrolle — was wurde wie eingeordnet:")
    for s in sorted(kandidaten, key=lambda x: (x["ziel"]["art"], x["name"])):
        e = s["ziel"]["einstieg"]
        print(f"   {s['ziel']['art']:<13} {s['name'][:44]:<44} {('→ ' + e) if e else ''}")

daten["sensoren"] = sensoren
with open(SENSORS, "w", encoding="utf-8") as f:
    json.dump(daten, f, ensure_ascii=False, indent=2)
print(f"\nlib/sensors.json fortgeschrieben")
