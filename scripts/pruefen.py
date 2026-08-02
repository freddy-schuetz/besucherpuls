"""Prueft die ausgelieferten Daten — nicht, ob etwas LAEUFT, sondern ob es STIMMT.

Genau daran ist die letzte Runde gescheitert: Es wurde gemeldet "103 Profile
importiert", ohne einen einzigen Wert anzusehen. Alpsee P1 stand danach ueber
alle 24 Stunden konstant auf 277 bei Kapazitaet 140.

Die Punkte entsprechen dem Verifikationsteil des Plans:

  1 Plausibilitaet   — kein Ziel, dessen Belegung die Kapazitaet uebersteigt
  2 Eine Wahrheit    — Ampel, Kurztext und Empfehlungslogik widersprechen sich nie
  3 Empfehlungen     — jede einzelne zum Nachlesen ausgegeben
  4 Erreichbarkeit   — kann jedes Gebiet ueberhaupt eine Empfehlung erzeugen?
                       Dafuer wird jedes Ziel testweise auf "voll" gesetzt; das
                       beantwortet die Frage auch morgens um acht, wenn real
                       nichts voll ist.
  5 Tagesverlauf     — jede gezeigte Kurve schwankt spuerbar

    python scripts/pruefen.py

Stand: 02.08.2026
"""
import io
import json
import math
import os
import re
import sys
import urllib.request

HIER = os.path.dirname(os.path.abspath(__file__))
ENVDATEI = os.path.join(HIER, "..", ".env.local")

FREI_BIS = 70
MAX_KM = {"bergbahn": 15, "wandern": 15, "nationalpark": 15, "klamm": 15,
          "see": 12, "rad": 5, "ort": 4, "stadt": 3, "anreise": 4, "sonstiges": 3}

fehler = []


def env(name):
    for z in io.open(ENVDATEI, encoding="utf-8"):
        m = re.match(rf"\s*{name}\s*=\s*(.+)", z)
        if m:
            return m.group(1).strip().strip('"').strip("'")
    sys.exit(f"{name} fehlt in .env.local")


def holen():
    u = f"{env('N8N_BASE')}/webhook/besucherpuls-status"
    r = urllib.request.Request(u, headers={"x-bp-secret": env("N8N_BP_SECRET")})
    return json.loads(urllib.request.urlopen(r, timeout=180).read())


def km(a, b):
    R, rad = 6371, math.pi / 180
    dlat, dlon = (b[1] - a[1]) * rad, (b[0] - a[0]) * rad
    s = math.sin(dlat / 2) ** 2 + math.cos(a[1] * rad) * math.cos(b[1] * rad) * math.sin(dlon / 2) ** 2
    return round(2 * R * math.asin(math.sqrt(s)), 1)


def hat_platz(z):
    """Muss der Regel im Workflow entsprechen (status_node.js, hatPlatz)."""
    if z["ampel"] != "gruen":
        return False
    if z.get("auslastung") is not None:
        return z["auslastung"] <= FREI_BIS
    return True


d = holen()
ziele = d["ziele"]
features = d["features"]
print(f"Stand {d['erzeugt']} — {len(features)} Zugaenge, {len(ziele)} Ziele\n")

# ------------------------------------------------------------------ 1
print("1 PLAUSIBILITAET")
schlimm = []
for f in features:
    p = f["properties"]
    a, k = p.get("auslastung"), p.get("kapazitaet")
    if a is not None and a > 105:
        schlimm.append(f"{p['name']}: {a} %")
    if a is not None and k and a > 100:
        schlimm.append(f"{p['name']}: {round(a/100*k)} von {k}")
print(f"  Zugaenge ueber 100 % Auslastung: {len(schlimm)}")
for s in schlimm[:10]:
    print(f"     {s}")
if schlimm:
    fehler.append(f"{len(schlimm)} Zugaenge melden mehr Belegte als Plaetze")

# ------------------------------------------------------------------ 2
print("\n2 EINE WAHRHEIT")
# Der Status kommt aus genau einer Funktion im Workflow. Geprueft wird, dass
# Ampel und Kurztext zueinander passen und dass die Ampel zur Auslastung passt.
ERWARTET = {
    "Voll": "rot", "Wird eng": "gelb", "Gut besucht": "gelb", "Viel Platz": "gruen",
    "Platz da": "gruen", "Voller als sonst": "rot", "Leerer als sonst": "gruen",
    "Wie üblich": "gelb", "Keine aktuellen Daten": "veraltet",
    "Geschlossen": "geschlossen", "Noch ohne Vergleich": "aufbau",
}
krumm = []
for f in features:
    p = f["properties"]
    st = p.get("status") or {}
    if not st:
        krumm.append(f"{p['name']}: kein status-Objekt")
        continue
    if st.get("ampel") != p.get("ampel"):
        krumm.append(f"{p['name']}: status.ampel={st.get('ampel')} != ampel={p.get('ampel')}")
    soll = ERWARTET.get(st.get("kurz"))
    if soll and soll != st.get("ampel"):
        krumm.append(f"{p['name']}: '{st.get('kurz')}' waere {soll}, ist {st.get('ampel')}")
    a = p.get("auslastung")
    if a is not None and st.get("ampel") in ("gruen",) and a >= 75:
        krumm.append(f"{p['name']}: gruen trotz {a} % belegt")
    if a is not None and a < 75 and st.get("kurz") == "Voll":
        krumm.append(f"{p['name']}: 'Voll' bei nur {a} %")
print(f"  Widersprueche in {len(features)} Zugaengen: {len(krumm)}")
for s in krumm[:10]:
    print(f"     {s}")
if krumm:
    fehler.append(f"{len(krumm)} Widersprueche zwischen Ampel und Text")

# Und dieselbe Pruefung fuer die Zielebene gegen ihren Hauptzugang
zkrumm = []
von_id = {f["properties"]["id"]: f["properties"] for f in features}
for z in ziele:
    h = von_id.get(z["haupt_zugang"])
    if h and z["ampel"] != h["ampel"]:
        zkrumm.append(f"{z['name']}: Ziel {z['ampel']} != Hauptzugang {h['ampel']}")
print(f"  Ziel gegen Hauptzugang: {len(zkrumm)} Abweichungen")
if zkrumm:
    fehler.append(f"{len(zkrumm)} Ziele weichen von ihrem Hauptzugang ab")

# ------------------------------------------------------------------ 3
print("\n3 EMPFEHLUNGEN (jede zum Nachlesen)")
mit = [z for z in ziele if z.get("alternative")]
if not mit:
    print("  gerade keine — real ist nichts voll")
for z in mit:
    a = z["alternative"]
    hier = (f"{z['frei_plaetze']} von {z['kapazitaet']} frei"
            if z.get("kapazitaet") else f"Rang {z.get('quote')}")
    dort = (f"{a['frei_plaetze']} von {a['kapazitaet']} frei"
            if a.get("kapazitaet") else f"Rang {a.get('quote')}")
    print(f"  {z['name']} ({z['art']}, {hier}, {z['status']['kurz']})")
    print(f"     -> {a['name']} ({a['art']}, {dort}, {a['status']['kurz']}, {a['km']} km)")
    if a.get("auslastung") is not None and a["auslastung"] > FREI_BIS:
        fehler.append(f"Empfehlung {z['name']} -> {a['name']}: Ziel ist selbst zu {a['auslastung']} % belegt")
    if a["km"] > MAX_KM.get(z["art"], 3):
        fehler.append(f"Empfehlung {z['name']} -> {a['name']}: {a['km']} km ueberschreitet die Grenze")

for z in ziele:
    if z.get("zugang_tipp"):
        t = z["zugang_tipp"]
        print(f"  [Zugang] {z['name']}: {t['von']} voll -> {t['nach']} ({t['km']} km)")

# ------------------------------------------------------------------ 4
print("\n4 ERREICHBARKEIT je Gebiet (jedes Ziel testweise auf voll)")
gebiete = {}
for z in ziele:
    gebiete.setdefault(z["gebiet"], []).append(z)

for g, zs in sorted(gebiete.items()):
    moeglich, beispiel = 0, None
    # Wieviele Ziele haetten ueberhaupt einen raeumlich und fachlich passenden
    # Partner — unabhaengig davon, wie voll er gerade ist? Ohne diese Zahl kann
    # man "kann gerade nicht" nicht von "kann grundsaetzlich nicht" trennen.
    paare = 0
    for z in zs:
        passend = [o for o in zs
                   if o["id"] != z["id"]
                   and set(o.get("arten") or []) & set(z.get("arten") or [])
                   and km((z["lon"], z["lat"]), (o["lon"], o["lat"])) <= MAX_KM.get(z["art"], 3)]
        if passend:
            paare += 1
        kand = [o for o in passend if hat_platz(o)]
        if kand:
            moeglich += 1
            if beispiel is None:
                b = min(kand, key=lambda o: (o.get("auslastung") if o.get("auslastung") is not None
                                             else o.get("quote", 50))
                        + km((z["lon"], z["lat"]), (o["lon"], o["lat"])) * 10)
                beispiel = f"{z['name']} -> {b['name']} ({km((z['lon'],z['lat']),(b['lon'],b['lat']))} km)"

    messbar = sum(1 for z in zs if z["ampel"] in ("gruen", "gelb", "rot"))
    if moeglich:
        grund, marke, schlimm = "", "OK ", False
    elif not paare:
        grund = "keine vergleichbaren Ziele in Reichweite — hier waere jede Empfehlung falsch"
        marke, schlimm = "-  ", False
    elif messbar < 2:
        grund = f"nur {messbar} Ziele mit Messwert (Rest im Aufbau oder ohne Meldung)"
        marke, schlimm = "wart", False
    else:
        grund = "passende Ziele da und messbar, trotzdem keine Empfehlung"
        marke, schlimm = "FEHL", True

    print(f"  {marke} {g:<18} {moeglich:>3} von {len(zs):>3} Zielen lenkbar"
          f"   (raeumlich passend: {paare}, messbar: {messbar})")
    if beispiel:
        print(f"       z. B. {beispiel}")
    if grund:
        print(f"       {grund}")
    if schlimm:
        fehler.append(f"Gebiet {g}: {grund}")

# ------------------------------------------------------------------ 5
print("\n5 TAGESVERLAUF")
kurven = [(z["name"], z["tagesgang"]) for z in ziele if z.get("tagesgang")]
flach = []
for name, k in kurven:
    echt = [v for v in k if v is not None]
    if echt and max(echt) - min(echt) < 5:
        flach.append((name, round(max(echt) - min(echt), 1)))
print(f"  Ziele mit Kurve: {len(kurven)}, davon flach: {len(flach)}")
for n, s in flach[:10]:
    print(f"     {n}: Spanne {s}")
if flach:
    fehler.append(f"{len(flach)} flache Kurven werden als Tagesverlauf gezeigt")
for name, k in kurven[:5]:
    echt = [v for v in k if v is not None]
    print(f"     {name[:32]:<32} {min(echt):>5.0f} .. {max(echt):>5.0f}")

# ------------------------------------------------------------------ Fazit
print("\n" + "=" * 62)
if fehler:
    print(f"{len(fehler)} BEFUNDE:")
    for f_ in fehler:
        print(f"  - {f_}")
    sys.exit(1)
print("Alle Pruefpunkte sauber.")
