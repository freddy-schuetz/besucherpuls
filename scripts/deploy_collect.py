"""Spielt scripts/collect_node.js in den Workflow besucherpuls-collect ein.

Gleicher Weg wie deploy_status.py: MCP updateNode schreibt jsCode still nicht.
Zusaetzlich wird hier der Luzern-Zugangsschluessel aus .env.local injiziert —
er steht damit im laufenden Workflow, aber nicht in einer Repo-Datei.

    python scripts/deploy_collect.py [--dry]

Stand: 01.08.2026
"""
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request

HIER = os.path.dirname(os.path.abspath(__file__))
SENSORS = os.path.join(HIER, "..", "lib", "sensors.json")
CODE = os.path.join(HIER, "collect_node.js")
ENVDATEI = os.path.join(HIER, "..", ".env.local")
REPO_ROOT = os.path.join(HIER, "..", "..", "..")

WF_ID = "3xXJXZdeqshbyerv"
CODE_NODE = "Quellen abrufen"
PRUNE_NODE = "Puffer beschneiden"
# Der Puffer haelt bewusst nur noch zwei Stunden statt 72. Grund ist eine
# gemessene Eigenheit des Data-Table-Knotens: Er gibt hoechstens rund 2500 Zeilen
# aus, beginnt dabei bei den AELTESTEN, und weder sortBy noch der Zeitfilter
# aendern daran etwas. Bei 72 h Inhalt lieferte er deshalb tagealte Werte als
# "aktuell" und liess die neuen Quellen ganz weg. Passt die ganze Tabelle unter
# den Deckel, ist die Reihenfolge gleichgueltig. Die Historie liegt ohnehin im
# Profil — der Puffer braucht nur den letzten Wert und einen kurzen Verlauf.
PUFFER_STUNDEN = 2
TROCKEN = "--dry" in sys.argv


def n8n():
    mcp = json.load(io.open(os.path.join(REPO_ROOT, ".mcp.json"), encoding="utf-8"))
    env = mcp["mcpServers"]["n8n-mcp"]["env"]
    base = (env.get("N8N_API_URL") or env.get("N8N_URL")).rstrip("/")
    if not base.endswith("/api/v1"):
        base += "/api/v1"
    return base, {"X-N8N-API-KEY": env["N8N_API_KEY"], "Content-Type": "application/json"}


def luzern_key():
    k = os.environ.get("LUZERN_API_KEY")
    if k:
        return k.strip()
    if os.path.exists(ENVDATEI):
        for z in io.open(ENVDATEI, encoding="utf-8"):
            m = re.match(r"\s*LUZERN_API_KEY\s*=\s*(.+)", z)
            if m:
                return m.group(1).strip().strip('"').strip("'")
    sys.exit("LUZERN_API_KEY weder in der Umgebung noch in .env.local gefunden")


BASE, H = n8n()

sensoren = json.load(io.open(SENSORS, encoding="utf-8"))["sensoren"]
# Der Sammler braucht nur vier Felder je Sensor. Kurze Schluessel, weil der
# Code-Node sonst unnoetig gross wird.
schmal = [{"i": s["id"], "q": s["quelle"], "r": s.get("quelle_id") or s["name"],
           "m": s["metrik"], "k": s.get("kapazitaet")} for s in sensoren]

code = io.open(CODE, encoding="utf-8").read()
for platzhalter in ("/*__SENSOREN__*/[]", "/*__LUZERN_KEY__*/"):
    if platzhalter not in code:
        sys.exit(f"Platzhalter {platzhalter} fehlt in collect_node.js")
code = code.replace("/*__SENSOREN__*/[]",
                    json.dumps(schmal, ensure_ascii=False, separators=(",", ":")))
code = code.replace("/*__LUZERN_KEY__*/", luzern_key())
print(f"{len(sensoren)} Sensoren injiziert, Code {len(code)/1024:.1f} KB")

quellen = {}
for s in schmal:
    quellen[s["q"]] = quellen.get(s["q"], 0) + 1
print("  " + ", ".join(f"{k}={v}" for k, v in sorted(quellen.items())))

wf = json.loads(urllib.request.urlopen(
    urllib.request.Request(f"{BASE}/workflows/{WF_ID}", headers=H), timeout=60).read())

treffer = 0
for n in wf["nodes"]:
    if n["name"] == CODE_NODE:
        alt = len(n["parameters"].get("jsCode", ""))
        n["parameters"]["jsCode"] = code
        print(f"  {CODE_NODE}: {alt/1024:.1f} KB -> {len(code)/1024:.1f} KB")
        treffer += 1
    elif n["name"] == PRUNE_NODE:
        n["parameters"]["filters"] = {"conditions": [{
            "keyName": "ts", "condition": "lt",
            "keyValue": f"={{{{ new Date(Date.now() - {PUFFER_STUNDEN}*3600*1000).toISOString() }}}}",
        }]}
        print(f"  {PRUNE_NODE}: behaelt {PUFFER_STUNDEN} h "
              f"(~{PUFFER_STUNDEN*12*len(sensoren)} Zeilen)")
        treffer += 1
if treffer != 2:
    sys.exit(f"Nur {treffer} von 2 Knoten gefunden — Abbruch")

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
