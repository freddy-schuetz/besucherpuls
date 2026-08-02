"""Baut die LinkedIn-Grafik: scripts/.ui/besucherpuls-linkedin.svg + .png

WARUM ALS SKRIPT. Die Zahlen und das Beispiel kommen aus dem LIVE-Endpunkt,
nicht aus dem Gedaechtnis. Eine Grafik, die "196 Messpunkte" behauptet, waehrend
es 150 sind, faellt genau demjenigen auf, den man erreichen will. Ein erneuter
Lauf zieht den Stand nach.

Die Schriften sind base64 eingebettet (Bricolage Grotesque und Inter, beide
variabel, zusammen rund 120 KB). Damit sieht die Grafik exakt aus wie die Seite
und braucht zum Rendern kein Netz.

    python scripts/grafik_bauen.py

Stand: 02.08.2026
"""
import base64
import io
import json
import os
import re
import sys
import urllib.request
from datetime import datetime

HIER = os.path.dirname(os.path.abspath(__file__))
ENVDATEI = os.path.join(HIER, "..", ".env.local")
SENSORS = os.path.join(HIER, "..", "lib", "sensors.json")
REGIONEN = os.path.join(HIER, "..", "lib", "regionen.ts")
SCHRIFTEN = os.path.join(HIER, ".schriften.json")
AUS = os.path.join(HIER, "..", "marketing")

# Farben aus app/globals.css — hier als Literale, weil SVG keine CSS-Variablen
# aus einer anderen Datei kennt.
TINTE, WEICH, ZART = "#0c1a17", "#43574f", "#7d8f87"
FLAECHE, KARTE, LINIE = "#f7f6f2", "#ffffff", "#e6e4dc"
FREI, FREI_W = "#0f9d63", "#e7f6ee"
MITTEL, MITTEL_W = "#cf7a1d", "#fdf1e2"
VOLL, VOLL_W = "#d43f4d", "#fdecec"

B, H = 1200, 1200          # LinkedIn-Feed: quadratisch nimmt am meisten Platz ein
RAND = 76


def env(name):
    for z in io.open(ENVDATEI, encoding="utf-8"):
        m = re.match(rf"\s*{name}\s*=\s*(.+)", z)
        if m:
            return m.group(1).strip().strip('"').strip("'")
    sys.exit(f"{name} fehlt in .env.local")


def xml(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def umbrechen(text, zeichen):
    """Zeilenumbruch nach Zeichenzahl — SVG bricht Text nicht selbst um."""
    worte, zeilen, akt = text.split(), [], ""
    for w in worte:
        if len(akt) + len(w) + 1 <= zeichen:
            akt = f"{akt} {w}".strip()
        else:
            zeilen.append(akt)
            akt = w
    if akt:
        zeilen.append(akt)
    return zeilen


# ---------------------------------------------------------------- Daten holen
r = urllib.request.Request(f"{env('N8N_BASE')}/webhook/besucherpuls-status",
                           headers={"x-bp-secret": env("N8N_BP_SECRET")})
d = json.loads(urllib.request.urlopen(r, timeout=200).read())
sensoren = json.load(io.open(SENSORS, encoding="utf-8"))["sensoren"]

# Gezaehlt wird, was ein Besucher SIEHT — nicht, was im Datensatz liegt.
#
# Der Workflow liefert 150 Ziele aus 10 Gruppen und 8 Quellen; die Seite zeigt
# davon 7 Regionen. Luzern, Meran, die Suedtiroler Leihraeder und nextbike
# haben keine Region und tauchen nirgends auf. „150 Ziele" neben „7 Regionen"
# zu stellen, waere also das Aufsummieren zweier verschiedener Mengen — die
# Zahl stimmte formal und liesse sich auf der Seite trotzdem nicht nachzaehlen.
quelltext = io.open(REGIONEN, encoding="utf-8").read()
sichtbar = set(re.findall(r'gruppe: "([a-z-]+)"', quelltext))
# Die vier Leerzeichen Einzug trennen die Regionseintraege von der
# Typdeklaration und vom Dach-Eintrag „bayern".
anz_regionen = len(re.findall(r'^    slug: "', quelltext, re.M))
if not 3 <= anz_regionen <= 40 or not sichtbar:
    sys.exit(f"Regionszaehlung unplausibel ({anz_regionen}) — regionen.ts geaendert?")

gezeigt = [z for z in d["ziele"] if z["gebiet"] in sichtbar]
sensor_von = {s["id"]: s for s in sensoren}
punkte = [g["id"] for z in gezeigt for g in z["zugaenge"]]
anz_ziele = len(gezeigt)
anz_punkte = len(punkte)
anz_quellen = len({z["quelle"] for z in gezeigt})
anz_laender = len({sensor_von[m]["land"] for m in punkte if m in sensor_von})

# Die Quellennennung ist Lizenzpflicht, keine Deko — und sie muss zu der Zahl
# passen, die daneben steht. Darum aus denselben Zielen abgeleitet.
QUELLE_NAME = {
    "bayern": "BayernCloud Tourismus", "st_parken": "Open Data Hub Südtirol",
    "st_rad": "Open Data Hub Südtirol", "wien_baeder": "Stadt Wien",
    "kiel_gbfs": "SprottenFlotte KielRegion", "zh_baeder": "Stadt Zürich",
    "luzern": "Stadt Luzern", "gbfs": "nextbike",
}
fehlt = {z["quelle"] for z in gezeigt} - QUELLE_NAME.keys()
if fehlt:
    sys.exit(f"Unbenannte Quelle(n): {fehlt} — QUELLE_NAME ergaenzen.")
# Reihenfolge nach Gewicht, damit die groesste Quelle vorn steht.
nach_gewicht = sorted({z["quelle"] for z in gezeigt},
                      key=lambda q: -sum(1 for z in gezeigt if z["quelle"] == q))
namen, gesehen = [], set()
for q in nach_gewicht:
    if QUELLE_NAME[q] not in gesehen:
        gesehen.add(QUELLE_NAME[q])
        namen.append(QUELLE_NAME[q])
namen.append("© OpenStreetMap-Mitwirkende")

# Das Beispiel wird nach GENAU DER ZAHL gewaehlt, die danach auf der Grafik
# steht: dem Anteil freier Plaetze.
#
# Der erste Entwurf nahm den groessten absoluten Gewinn an freien Plaetzen und
# landete bei „27 von 80 frei" → „108 von 465 frei". Beide Zahlen stimmen, und
# der Rat stimmt auch — die Ampel folgt dem leersten Zugang, und dort sind
# wirklich 108 Plaetze frei. Nur rechnet ein Leser 27/80 = 34 % gegen
# 108/465 = 23 % und sieht eine Empfehlung ins Vollere. Wer eine Grafik baut,
# muss die Rechnung mitliefern, die der Betrachter im Kopf macht.
#
# Also: mindestens 15 Punkte mehr freier Anteil — dieselbe Schwelle, die
# status_node.js unter MIN_ABSTAND fuer die Empfehlung selbst benutzt.
MIN_ABSTAND = 15


def frei_anteil(x):
    return x["frei_plaetze"] / x["kapazitaet"] * 100


paare = []
von_id = {z["id"]: z for z in d["ziele"]}
for z in gezeigt:                  # nur Ziele, die auf der Seite auffindbar sind
    a = z.get("alternative")
    if not a or not z.get("kapazitaet") or not a.get("kapazitaet"):
        continue
    if (von_id.get(a["id"]) or {}).get("gebiet") not in sichtbar:
        continue
    if a.get("frei_plaetze") is None or z.get("frei_plaetze") is None:
        continue
    # Kiel zaehlt Raeder und Docks, nicht Plaetze — „von 30 Plätzen frei" waere
    # dort schlicht die falsche Einheit.
    if "Plätze" not in (z.get("einheit") or ""):
        continue
    if frei_anteil(a) - frei_anteil(z) < MIN_ABSTAND:
        continue
    paare.append((a["frei_plaetze"] - z["frei_plaetze"], z, a))
if not paare:
    sys.exit("Gerade kein Paar, dessen Zahlen fuer sich sprechen — spaeter erneut.")
# Unter den ehrlichen Paaren das mit dem groessten Gewinn; bei Gleichstand das
# mit einem echten Begruendungssatz (der Regelsatz „Im Gebiet X." zaehlt nicht).
paare.sort(key=lambda p: (p[0], len(p[2].get("begruendung") or "")), reverse=True)
_, quelle, ziel = paare[0]
zielobj = von_id[ziel["id"]]
# Ein Satz, der nur das Gebiet wiederholt, das schon in der Unterzeile steht,
# ist keine Information. Dann traegt die Karte die Balken allein.
satz = (ziel.get("begruendung") or "").strip()
if len(satz) < 45 or satz.rstrip(".").endswith((zielobj.get("info") or {}).get("gebiet") or "\0"):
    satz = ""

print(f"Sichtbar: {anz_regionen} Regionen · {anz_laender} Länder · {anz_ziele} Ziele · "
      f"{anz_punkte} Messpunkte · {anz_quellen} Quellen "
      f"(Datensatz gesamt: {d['zusammenfassung']['ziele']} Ziele, "
      f"{d['zusammenfassung']['sensoren']} Messpunkte)")
print(f"Quellen: {' · '.join(namen)}")
print(f"Beispiel: {quelle['name']} ({quelle['frei_plaetze']}/{quelle['kapazitaet']}, "
      f"{frei_anteil(quelle):.0f}% frei) -> {ziel['name']} "
      f"({ziel['frei_plaetze']}/{ziel['kapazitaet']}, {frei_anteil(ziel):.0f}% frei, "
      f"{ziel['km']} km) | Satz: {satz or '—'}")

def unterzeile(z):
    """Gebiet und Ort — beide Karten nach derselben Regel, sonst sieht es aus,
    als wisse die Seite über das eine Ziel mehr als über das andere."""
    teile = [(z.get("info") or {}).get("gebiet"), z.get("ort")]
    gesehen, raus = set(), []
    for t in teile:
        if t and t not in gesehen:
            gesehen.add(t)
            raus.append(t)
    return " · ".join(raus)


q_unter, z_unter = unterzeile(quelle), unterzeile(zielobj)

# ---------------------------------------------------------------- Schriften
schriften = json.load(io.open(SCHRIFTEN, encoding="utf-8"))
# Beide sind VARIABLE Schriften — Google liefert fuer alle Schnitte dieselbe
# Datei. Einmal einbetten genuegt, das spart zwei Drittel der Groesse.
b_display = schriften["Bricolage"][0][1]
b_text = schriften["Inter"][0][1]

stil = f"""
@font-face {{ font-family: 'BP Display'; font-weight: 100 900;
  src: url(data:font/woff2;base64,{b_display}) format('woff2'); }}
@font-face {{ font-family: 'BP Text'; font-weight: 100 900;
  src: url(data:font/woff2;base64,{b_text}) format('woff2'); }}
text {{ font-family: 'BP Text', system-ui, sans-serif; fill: {TINTE}; }}
.d {{ font-family: 'BP Display', system-ui, sans-serif; letter-spacing: -0.022em; }}
.zahl {{ font-variant-numeric: tabular-nums; }}
"""

PULS = ("M0 11.5h6.5l3-2.2 3.2-7.8 3.4 11.4 2.6-5.2 2.8 3.8 3-6.6 "
        "3.4 8.4 3-4.6 3 2.6H40")

t = []
a = t.append

a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{B}" height="{H}" '
  f'viewBox="0 0 {B} {H}" font-size="16">')
a(f"<style>{stil}</style>")
a(f'<rect width="{B}" height="{H}" fill="{FLAECHE}"/>')

# Kopf ------------------------------------------------------------------
a(f'<rect width="{B}" height="118" fill="{KARTE}"/>')
a(f'<rect y="117" width="{B}" height="1" fill="{LINIE}"/>')
a(f'<text class="d" x="{RAND}" y="72" font-size="34" font-weight="800">Besucher</text>')
a(f'<g transform="translate({RAND + 168} 50)">'
  f'<path d="{PULS}" fill="none" stroke="{FREI}" stroke-width="3.2" '
  f'stroke-linecap="round" stroke-linejoin="round"/></g>')
a(f'<text class="d" x="{RAND + 216}" y="72" font-size="34" font-weight="800">puls</text>')
a(f'<text x="{B - RAND}" y="62" text-anchor="end" font-size="17" fill="{ZART}">'
  f'besucherpuls.friedemann-schuetz.de</text>')
a(f'<text class="zahl" x="{B - RAND}" y="86" text-anchor="end" font-size="14" fill="{ZART}">'
  f'Live-Stand {datetime.now():%d.%m.%Y, %H:%M} Uhr</text>')

# Ueberschrift ----------------------------------------------------------
a(f'<text x="{RAND}" y="196" font-size="15" font-weight="600" fill="{FREI}" '
  f'letter-spacing="2.2">BESUCHERLENKUNG AUS OFFENEN DATEN</text>')
a(f'<text class="d" x="{RAND}" y="264" font-size="52" font-weight="700">'
  f'Die meisten Seiten zeigen,</text>')
a(f'<text class="d" x="{RAND}" y="326" font-size="52" font-weight="700">'
  f'wo es voll ist. Diese sagt,</text>')
a(f'<text class="d" x="{RAND}" y="388" font-size="52" font-weight="700" fill="{FREI}">'
  f'wohin sonst.</text>')

# Die beiden Karten -------------------------------------------------------
# Von UNTEN gestapelt: die Mechanik-Zeile liegt fest, alles darueber waechst
# nach oben. Sonst schiebt ein zweizeiliger Begruendungssatz die Karte in das
# Zahlenband — ein Fehler, den man erst im fertigen PNG sieht.
saetze = umbrechen(satz, 74)[:2] if satz else []
h1, yw = 176, 940              # yw = Grundlinie der Mechanik-Zeile
# Passt der Satz nicht mehr unter die Ueberschrift, faellt lieber eine Zeile
# weg als dass der Block ins Zahlenband waechst. Lieber knapp als kaputt.
while True:
    h2 = 220 + len(saetze) * 30
    y2 = yw - 44 - h2
    ym = y2 - 62               # Pfeilzeile
    y1 = ym - h1
    if y1 >= 424 or not saetze:
        break
    saetze.pop()
if y1 < 424:
    sys.exit(f"Mittelblock passt nicht (y1={y1}) — Layout pruefen.")

BALKEN = 300                   # Breite der Auslastungsspur


def karte(y, h, z, unter, farbe, weich, gefuellt, kicker=None):
    """Eine Zielkarte. Links die Worte, rechts das Bild davon.

    Der Balken ist der eigentliche Grund fuer diese Grafik: „112 von 500 frei"
    muss man lesen und rechnen, zwei verschieden weit gefuellte Spuren sieht
    man in einem Wimpernschlag."""
    a(f'<rect x="{RAND}" y="{y}" width="{B - 2*RAND}" height="{h}" rx="24" '
      f'fill="{KARTE if not gefuellt else weich}" stroke="{LINIE if not gefuellt else farbe}"'
      f'{"" if not gefuellt else " stroke-opacity=\'0.22\'"}/>')
    a(f'<rect x="{RAND}" y="{y}" width="6" height="{h}" rx="3" fill="{farbe}"/>')

    # Der Kicker schiebt den ganzen Textblock nach unten, damit die Karte der
    # Alternative dieselbe Innengeometrie behaelt wie die darueber.
    v = 0
    if kicker:
        v = 44
        a(f'<text x="{RAND + 40}" y="{y + 42}" font-size="15" font-weight="600" '
          f'fill="{farbe}" letter-spacing="2">{xml(kicker)}</text>')

    # Statuspille
    kurz = z["status"]["kurz"]
    bw = len(kurz) * 11 + 44
    a(f'<rect x="{B - RAND - bw - 40}" y="{y + v + 34}" width="{bw}" height="42" rx="21" '
      f'fill="{weich if not gefuellt else KARTE}"/>')
    a(f'<text x="{B - RAND - 40 - bw/2}" y="{y + v + 61}" text-anchor="middle" '
      f'font-size="18" font-weight="600" fill="{farbe}">{xml(kurz)}</text>')

    # Auslastungsbalken — der Anteil, den die Zeile daneben nennt
    anteil = z["frei_plaetze"] / z["kapazitaet"]
    bx = B - RAND - 40 - BALKEN
    by = y + v + 108
    a(f'<rect x="{bx}" y="{by}" width="{BALKEN}" height="14" rx="7" fill="{LINIE}"/>')
    a(f'<rect x="{bx}" y="{by}" width="{max(6, BALKEN * (1 - anteil)):.1f}" height="14" '
      f'rx="7" fill="{farbe}"/>')
    a(f'<text class="zahl" x="{B - RAND - 40}" y="{by + 38}" text-anchor="end" '
      f'font-size="17" fill="{ZART}">{(1 - anteil) * 100:.0f} % belegt</text>')

    # Worte
    a(f'<text class="d" x="{RAND + 40}" y="{y + v + 62}" font-size="30" font-weight="600">'
      f'{xml(z["name"])}</text>')
    a(f'<text x="{RAND + 40}" y="{y + v + 94}" font-size="18" fill="{ZART}">'
      f'{xml(unter)}</text>')
    a(f'<text class="zahl" x="{RAND + 40}" y="{y + v + 132}" font-size="22" '
      f'font-weight="600" fill="{farbe if gefuellt else WEICH}">'
      f'{z["frei_plaetze"]} von {z["kapazitaet"]} Plätzen frei</text>')


karte(y1, h1, quelle, q_unter, MITTEL, MITTEL_W, False)

# Pfeil -------------------------------------------------------------------
a(f'<g transform="translate({B/2} {ym + 30})">'
  f'<path d="M0 -14 V14 M-11 3 L0 14 L11 3" fill="none" stroke="{ZART}" '
  f'stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>')
a(f'<text x="{B/2 + 30}" y="{ym + 37}" font-size="18" font-weight="600" fill="{ZART}">'
  f'{str(ziel["km"]).replace(".", ",")} km entfernt</text>')

karte(y2, h2, zielobj, z_unter, FREI, FREI_W, True, kicker="HEUTE BESSER DORTHIN")
for i, zeile in enumerate(saetze):
    a(f'<text x="{RAND + 40}" y="{y2 + 228 + i*30}" font-size="19" fill="{WEICH}">'
      f'{xml(zeile)}</text>')

# Wie es zustande kommt ------------------------------------------------------
# Fuellt die Luecke unter den Karten mit dem, was die Zielgruppe auf LinkedIn
# eigentlich wissen will: nicht nur was herauskommt, sondern woraus.
schritte = ["Offene Schnittstellen", "n8n, alle 5 Minuten",
            "Rang gegen 30 Tage Historie", "Ampel + Empfehlung"]
x = RAND
for i, s in enumerate(schritte):
    a(f'<text x="{x}" y="{yw}" font-size="17" font-weight="500" fill="{WEICH}">'
      f'{xml(s)}</text>')
    x += len(s) * 8.9 + 14
    if i < len(schritte) - 1:
        a(f'<path d="M{x} {yw - 6} h16 m-5 -5 l5 5 l-5 5" fill="none" stroke="{ZART}" '
          f'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>')
        x += 32

# Zahlenband ----------------------------------------------------------------
yz = 1002
a(f'<rect x="{RAND}" y="{yz}" width="{B - 2*RAND}" height="1" fill="{LINIE}"/>')
zahlen = [
    (str(anz_regionen), "Regionen"), (str(anz_laender), "Länder"),
    (str(anz_ziele), "Ziele"), (str(anz_punkte), "Messpunkte"),
    (str(anz_quellen), "offene Quellen"),
]
breite = (B - 2*RAND) / len(zahlen)
for i, (wert, wofuer) in enumerate(zahlen):
    x = RAND + breite * i + breite / 2
    a(f'<text class="d zahl" x="{x}" y="{yz + 68}" text-anchor="middle" font-size="42" '
      f'font-weight="700">{wert}</text>')
    a(f'<text x="{x}" y="{yz + 98}" text-anchor="middle" font-size="17" fill="{ZART}">'
      f'{wofuer}</text>')

# Fuss ----------------------------------------------------------------------
# Die Quellen sind Lizenzpflicht, keine Deko — CC BY und ODbL verlangen die
# Nennung auch dann, wenn die Grafik ausserhalb der Seite auftaucht.
a(f'<text x="{B/2}" y="{H - 46}" text-anchor="middle" font-size="15" fill="{ZART}">'
  f'Daten: {xml(" · ".join(namen))}</text>')
a("</svg>")

os.makedirs(AUS, exist_ok=True)
pfad = os.path.join(AUS, "besucherpuls-linkedin.svg")
io.open(pfad, "w", encoding="utf-8").write("\n".join(t))
print(f"{pfad} geschrieben ({os.path.getsize(pfad)/1024:.0f} KB)")
