"""Spielt scripts/status_node.js in den Workflow besucherpuls-status ein.

Warum ein eigenes Skript: MCP updateNode schreibt jsCode still nicht — der Aufruf
meldet Erfolg, der Code bleibt der alte. Deshalb der Weg ueber die REST-API.
Ausserdem wird die Sensorliste aus lib/sensors.json in den Code injiziert, damit
sie nur an EINER Stelle gepflegt wird.

Der PUT akzeptiert ausschliesslich name, nodes, connections und settings —
alles andere quittiert n8n mit 400.

    python scripts/deploy_status.py [--dry]

Stand: 01.08.2026
"""
import io
import json
import os
import sys
import urllib.error
import urllib.request

HIER = os.path.dirname(os.path.abspath(__file__))
SENSORS = os.path.join(HIER, "..", "lib", "sensors.json")
ZIELE = os.path.join(HIER, "..", "lib", "ziele.json")
CODE = os.path.join(HIER, "status_node.js")
REPO_ROOT = os.path.join(HIER, "..", "..", "..")

WF_ID = "k72uhdProlgW0R1X"
CODE_NODE = "GeoJSON bauen"
PUFFER_NODE = "Puffer lesen"
PROFIL_NODE = "Profil lesen"
MINUTEN = 30             # Zeitfenster des Verlaufs (siehe Kommentar unten)
PUFFER_LIMIT = 2500      # der Knoten liefert nie mehr, egal was hier steht
PROFIL_LIMIT = 2500      # 300 ergab nur 50 Zeilen — der Knoten braucht einen grossen Wert
TROCKEN = "--dry" in sys.argv

# Felder, die der Code je Sensor braucht. Bewusst schmal gehalten: der Code-Node
# wird sonst unnoetig gross und n8n zaeh im Editor.
FELDER = ("id", "name", "ort", "land", "lat", "lon", "einheit", "metrik",
          "kapazitaet", "hinweis", "quelle", "quelle_url", "gruppe", "bezirk", "ziel")


def n8n():
    mcp = json.load(io.open(os.path.join(REPO_ROOT, ".mcp.json"), encoding="utf-8"))
    env = mcp["mcpServers"]["n8n-mcp"]["env"]
    base = (env.get("N8N_API_URL") or env.get("N8N_URL")).rstrip("/")
    if not base.endswith("/api/v1"):
        base += "/api/v1"
    return base, {"X-N8N-API-KEY": env["N8N_API_KEY"], "Content-Type": "application/json"}


BASE, H = n8n()

sensoren = json.load(io.open(SENSORS, encoding="utf-8"))["sensoren"]
schmal = [{k: s.get(k) for k in FELDER if k in s or k == "gruppe"} for s in sensoren]

vorlage = io.open(CODE, encoding="utf-8").read()
if "/*__SENSOREN__*/[]" not in vorlage:
    sys.exit("Platzhalter /*__SENSOREN__*/[] fehlt in status_node.js")
code = vorlage.replace("/*__SENSOREN__*/[]",
                       json.dumps(schmal, ensure_ascii=False, separators=(",", ":")))

# Die Zielebene. Sie ist der Grund, warum die Empfehlung ueberhaupt Sinn ergibt:
# Der Code lenkt zwischen ZIELEN, nicht zwischen Parkplaetzen.
ziele = json.load(io.open(ZIELE, encoding="utf-8"))["ziele"]
if "/*__ZIELE__*/[]" not in code:
    sys.exit("Platzhalter /*__ZIELE__*/[] fehlt in status_node.js")
code = code.replace("/*__ZIELE__*/[]",
                    json.dumps(ziele, ensure_ascii=False, separators=(",", ":")))
mehrfach = sum(1 for z in ziele if len(z["zugaenge"]) > 1)
print(f"{len(ziele)} Ziele injiziert ({mehrfach} mit mehreren Zugaengen)")
# Der Code liest die Tabellen selbst ueber die API — der Data-Table-Knoten liefert
# beim Lesen wiederholte Seiten statt der ganzen Tabelle. Zugang wird hier
# injiziert und steht damit im Workflow, nicht im Repo.
for platz, wert in (("/*__API_BASE__*/", BASE), ("/*__API_KEY__*/", H["X-N8N-API-KEY"])):
    if platz not in code:
        sys.exit(f"Platzhalter {platz} fehlt in status_node.js")
    code = code.replace(platz, wert)
print(f"{len(sensoren)} Sensoren injiziert, Code {len(code)/1024:.1f} KB")

wf = json.loads(urllib.request.urlopen(
    urllib.request.Request(f"{BASE}/workflows/{WF_ID}", headers=H), timeout=60).read())

treffer = 0
for n in wf["nodes"]:
    if n["name"] == CODE_NODE:
        alt = len(n["parameters"].get("jsCode", ""))
        n["parameters"]["jsCode"] = code
        print(f"  {CODE_NODE}: {alt/1024:.1f} KB -> {len(code)/1024:.1f} KB")
        treffer += 1

if treffer != 1:
    sys.exit(f"Knoten '{CODE_NODE}' nicht gefunden — Abbruch")

# Die beiden Data-Table-Lese-Knoten entfallen: sie lieferten wiederholte Seiten.
# Der Code-Node holt die Tabellen jetzt selbst. Webhook -> Secret -> Code.
wf["nodes"] = [n for n in wf["nodes"] if n["name"] not in (PUFFER_NODE, PROFIL_NODE)]
wf["connections"]["Secret prüfen"] = {"main": [
    [{"node": CODE_NODE, "type": "main", "index": 0}],
    [{"node": "Abweisen", "type": "main", "index": 0}],
]}
for weg in (PUFFER_NODE, PROFIL_NODE):
    wf["connections"].pop(weg, None)
print(f"  Lese-Knoten entfernt, Kette: Webhook -> Secret pruefen -> {CODE_NODE}")

# ---------------------------------------------------------------- KI-Begruendung
# Drei Knoten hinter dem Sammler: Auftraege bilden -> Modell -> einsetzen.
#
# Der Modellaufruf MUSS ein HTTP-Knoten sein: Code-Nodes haben in n8n keinen
# Zugriff auf Credentials. Der Schluessel liegt damit in n8n, nicht im Repo.
#
# `onError: continueRegularOutput` und `alwaysOutputData` sind nicht Kosmetik —
# ohne sie bricht bei einer Zeitueberschreitung des Modells die ganze Kette ab
# und der Webhook antwortet gar nicht. Die Seite faellt stattdessen still auf
# den Regelsatz zurueck.
KI_CRED = "XWSWbWfP0BbrDriD"          # "Anthropic API" (httpHeaderAuth)
KI_MODELL = "claude-haiku-4-5-20251001"


def code_knoten(name, datei, x, y):
    quelle = io.open(os.path.join(HIER, datei), encoding="utf-8").read()
    for platz, wert in (("/*__API_BASE__*/", BASE), ("/*__API_KEY__*/", H["X-N8N-API-KEY"])):
        quelle = quelle.replace(platz, wert)
    return {
        "id": name.lower().replace(" ", "-"),
        "name": name,
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x, y],
        "parameters": {"mode": "runOnceForAllItems", "jsCode": quelle},
    }


ki_knoten = [
    code_knoten("Texte vorbereiten", "texte_vor_node.js", 1180, -90),
    {
        "id": "ki-text",
        "name": "KI-Text",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [1420, -90],
        "alwaysOutputData": True,
        "retryOnFail": True,
        "maxTries": 2,
        "waitBetweenTries": 1500,
        "onError": "continueRegularOutput",
        "parameters": {
            "method": "POST",
            "url": "https://api.anthropic.com/v1/messages",
            "authentication": "genericCredentialType",
            "genericAuthType": "httpHeaderAuth",
            "sendHeaders": True,
            "headerParameters": {"parameters": [
                {"name": "anthropic-version", "value": "2023-06-01"},
                {"name": "content-type", "value": "application/json"},
            ]},
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": (
                '={{ $json.leerlauf ? JSON.stringify({model:"' + KI_MODELL + '",'
                'max_tokens:16,messages:[{role:"user",content:"ok"}]}) : '
                'JSON.stringify({model:"' + KI_MODELL + '",max_tokens:120,'
                'messages:[{role:"user",content:$json.prompt}]}) }}'
            ),
            "options": {"timeout": 12000},
        },
        "credentials": {"httpHeaderAuth": {"id": KI_CRED, "name": "Anthropic API"}},
    },
    code_knoten("Texte einsetzen", "texte_ein_node.js", 1660, -90),
]

wf["nodes"] = [n for n in wf["nodes"]
               if n["name"] not in ("Texte vorbereiten", "KI-Text", "Texte einsetzen")]
wf["nodes"].extend(ki_knoten)
wf["connections"][CODE_NODE] = {"main": [[{"node": "Texte vorbereiten", "type": "main", "index": 0}]]}
wf["connections"]["Texte vorbereiten"] = {"main": [[{"node": "KI-Text", "type": "main", "index": 0}]]}
wf["connections"]["KI-Text"] = {"main": [[{"node": "Texte einsetzen", "type": "main", "index": 0}]]}
print("  KI-Kette: GeoJSON bauen -> Texte vorbereiten -> KI-Text -> Texte einsetzen")

nutzlast = {
    "name": wf["name"],
    "nodes": wf["nodes"],
    "connections": wf["connections"],
    "settings": {k: v for k, v in (wf.get("settings") or {}).items()
                 if k in ("executionOrder", "timezone")} or {"executionOrder": "v1"},
}

if TROCKEN:
    print("--dry: nichts geschrieben")
    sys.exit(0)

try:
    r = urllib.request.urlopen(urllib.request.Request(
        f"{BASE}/workflows/{WF_ID}", data=json.dumps(nutzlast).encode("utf-8"),
        headers=H, method="PUT"), timeout=120).read()
    print("PUT ok:", json.loads(r).get("name"), "| updatedAt", json.loads(r).get("updatedAt"))
except urllib.error.HTTPError as e:
    sys.exit(f"FEHLER {e.code}: {e.read()[:500].decode('utf-8','replace')}")
