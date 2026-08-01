"""Legt den Workflow besucherpuls-verdichten an (oder aktualisiert ihn).

Dieser Workflow fehlte im Aufbau komplett: Der Sammler schrieb in den Ringpuffer,
aber nichts ueberfuehrte die Werte in die Vergleichsbasis. Sensoren ohne
mitgelieferte Historie standen deshalb dauerhaft auf "im Aufbau".

Er laeuft stuendlich zur Minute 5 und verdichtet die zuletzt abgeschlossene Stunde
zu genau EINEM Tageswert je Sensor.

    python scripts/deploy_verdichten.py [--dry] [--aktivieren]

Stand: 01.08.2026
"""
import io
import json
import os
import sys
import urllib.error
import urllib.request

HIER = os.path.dirname(os.path.abspath(__file__))
CODE = os.path.join(HIER, "verdichten_node.js")
REPO_ROOT = os.path.join(HIER, "..", "..", "..")

NAME = "besucherpuls-verdichten"
PUFFER = "nVawEogJkPNKOCHp"
PROFIL = "OPyMv8bkUvAwtMCc"
TROCKEN = "--dry" in sys.argv
AKTIVIEREN = "--aktivieren" in sys.argv


def n8n():
    mcp = json.load(io.open(os.path.join(REPO_ROOT, ".mcp.json"), encoding="utf-8"))
    env = mcp["mcpServers"]["n8n-mcp"]["env"]
    base = (env.get("N8N_API_URL") or env.get("N8N_URL")).rstrip("/")
    if not base.endswith("/api/v1"):
        base += "/api/v1"
    return base, {"X-N8N-API-KEY": env["N8N_API_KEY"], "Content-Type": "application/json"}


BASE, H = n8n()


def api(pfad, daten=None, methode="GET"):
    r = urllib.request.Request(
        f"{BASE}{pfad}", headers=H, method=methode,
        data=json.dumps(daten).encode("utf-8") if daten is not None else None)
    return json.loads(urllib.request.urlopen(r, timeout=120).read() or b"{}")


def tabelle(tid):
    return {"__rl": True, "mode": "id", "value": tid}


code = io.open(CODE, encoding="utf-8").read()
for platz, wert in (("/*__API_BASE__*/", BASE), ("/*__API_KEY__*/", H["X-N8N-API-KEY"])):
    if platz not in code:
        sys.exit(f"Platzhalter {platz} fehlt in verdichten_node.js")
    code = code.replace(platz, wert)

nodes = [
    {
        "id": "trg", "name": "Stündlich", "type": "n8n-nodes-base.scheduleTrigger",
        "typeVersion": 1.2, "position": [0, 0],
        # Minute 5, damit die Zielstunde sicher abgeschlossen und im Puffer ist.
        "parameters": {"rule": {"interval": [{"field": "cronExpression",
                                              "expression": "5 * * * *"}]}},
    },
    {
        # Liest Puffer und Profil selbst ueber die API — der Data-Table-Knoten
        # wiederholt beim Lesen die erste Seite und liefert damit die falsche Stunde.
        "id": "code", "name": "Zellen fortschreiben", "type": "n8n-nodes-base.code",
        "typeVersion": 2, "position": [260, 0],
        "parameters": {"jsCode": code},
    },
    {
        "id": "up", "name": "Profil schreiben", "type": "n8n-nodes-base.dataTable",
        "typeVersion": 1.1, "position": [520, 0],
        "parameters": {
            "resource": "row", "operation": "upsert",
            "dataTableId": tabelle(PROFIL),
            # Match je Sensor — ohne diese Bedingung verweigert n8n die Aktivierung.
            "filters": {"conditions": [{
                "keyName": "sensor_id", "condition": "eq",
                "keyValue": "={{ $json.sensor_id }}",
            }]},
            "columns": {"mappingMode": "autoMapInputData", "value": {},
                        "matchingColumns": ["sensor_id"], "schema": []},
        },
    },
]

connections = {
    "Stündlich": {"main": [[{"node": "Zellen fortschreiben", "type": "main", "index": 0}]]},
    "Zellen fortschreiben": {"main": [[{"node": "Profil schreiben", "type": "main", "index": 0}]]},
}

nutzlast = {"name": NAME, "nodes": nodes, "connections": connections,
            "settings": {"executionOrder": "v1"}}

vorhanden = None
for w in api("/workflows?limit=250").get("data", []):
    if w.get("name") == NAME:
        vorhanden = w
        break

print(f"Code {len(code)/1024:.1f} KB, {len(nodes)} Knoten")
print("vorhanden" if vorhanden else "wird neu angelegt")

if TROCKEN:
    print("--dry: nichts geschrieben")
    sys.exit(0)

try:
    if vorhanden:
        r = api(f"/workflows/{vorhanden['id']}", nutzlast, "PUT")
    else:
        r = api("/workflows", nutzlast, "POST")
    wid = r.get("id")
    print(f"OK: {r.get('name')} id={wid} aktiv={r.get('active')}")
    if AKTIVIEREN and not r.get("active"):
        api(f"/workflows/{wid}/activate", {}, "POST")
        print("aktiviert")
except urllib.error.HTTPError as e:
    sys.exit(f"FEHLER {e.code}: {e.read()[:600].decode('utf-8','replace')}")
