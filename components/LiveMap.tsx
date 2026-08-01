"use client";

import { useEffect, useRef } from "react";
import maplibregl, { Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { AMPEL_FARBE, type StatusAntwort } from "@/lib/types";
import { gastStatus } from "@/lib/regionen";

/**
 * Karte fuer die Live-Punkte.
 *
 * Wichtig: Die Karteninstanz wird EINMAL erzeugt und danach nur ueber
 * source.setData() gefuettert. Wuerde man die Karte bei jeder Datenaenderung
 * neu aufbauen, sprAenge bei jedem Minuten-Refresh der Zoom des Nutzers zurueck.
 */
export default function LiveMap({
  daten,
  ausgewaehlt,
  onSelect,
  start,
}: {
  daten: StatusAntwort | null;
  ausgewaehlt: string | null;
  onSelect: (id: string) => void;
  /** Fester Startausschnitt (Schaufenster). Ohne diesen wird auf alle Punkte gezoomt. */
  start?: { mitte: [number, number]; zoom: number };
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MlMap | null>(null);
  const bereit = useRef(false);
  const ersteDaten = useRef(true);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // --- Karte einmalig aufbauen
  useEffect(() => {
    if (map.current || !container.current) return;

    const m = new maplibregl.Map({
      container: container.current,
      style: {
        version: 8,
        sources: {
          carto: {
            type: "raster",
            // Positron statt Voyager: eine fast farblose Grundkarte. Voyager bringt
            // eigene kraeftige Gruen- und Gelbtoene mit, gegen die sich die
            // Statuspunkte nicht durchsetzen — genau die sollen hier aber tragen.
            tiles: [
              "https://a.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png",
              "https://b.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png",
              "https://c.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
          },
        },
        layers: [{ id: "carto", type: "raster", source: "carto" }],
      },
      center: start ? start.mitte : [10.5, 48.5],
      zoom: start ? start.zoom : 4.6,
      attributionControl: false,
    });

    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    m.on("load", () => {
      m.addSource("sensoren", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Weicher Hof in der Statusfarbe — laesst die Punkte auf der hellen
      // Grundkarte plastisch wirken, ohne dass ein Schlagschatten noetig waere.
      m.addLayer({
        id: "sensoren-hof",
        type: "circle",
        source: "sensoren",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 15, 12, 22],
          "circle-color": ["get", "farbe"],
          "circle-opacity": 0.16,
        },
      });

      // Ring um den ausgewaehlten Punkt
      m.addLayer({
        id: "sensoren-halo",
        type: "circle",
        source: "sensoren",
        filter: ["==", ["get", "id"], "___keiner___"],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 17, 12, 24],
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#0c1a17",
          "circle-stroke-opacity": 0.75,
        },
      });

      m.addLayer({
        id: "sensoren-punkt",
        type: "circle",
        source: "sensoren",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 6, 8, 9, 12, 12],
          "circle-color": ["get", "farbe"],
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": [
            "case",
            ["in", ["get", "ampel"], ["literal", ["veraltet", "aufbau"]]],
            0.6,
            1,
          ],
        },
      });

      m.on("click", "sensoren-punkt", (e) => {
        const f = e.features?.[0];
        if (f?.properties?.id) onSelectRef.current(String(f.properties.id));
      });
      m.on("mouseenter", "sensoren-punkt", () => {
        m.getCanvas().style.cursor = "pointer";
      });
      m.on("mouseleave", "sensoren-punkt", () => {
        m.getCanvas().style.cursor = "";
      });

      bereit.current = true;
      map.current = m;
      // Falls Daten schon vor dem load-Event da waren
      m.fire("bp:bereit");
    });

    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      bereit.current = false;
    };
  }, []);

  // --- Daten einspielen, ohne die Karte neu zu bauen
  useEffect(() => {
    const m = map.current;
    if (!m || !daten) return;

    const einspielen = () => {
      const src = m.getSource("sensoren") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData({
        type: "FeatureCollection",
        features: daten.features.map((f) => {
          // Denselben abgeleiteten Status nehmen wie die Karten daneben. Vorher
          // faerbte die Landkarte nach dem ROHEN ampel-Feld — Wien und Kiel
          // standen dort komplett grau, obwohl jede Kachel gruen war, und ein
          // Parkplatz mit 210 freien Plaetzen leuchtete rot.
          const s = gastStatus(f.properties);
          return {
            ...f,
            properties: {
              ...f.properties,
              ampel: s.ampel,
              farbe: AMPEL_FARBE[s.ampel] ?? AMPEL_FARBE.unbekannt,
            },
          };
        }),
      } as GeoJSON.FeatureCollection);

      // Beim Schaufenster bleibt der vorgegebene Ausschnitt stehen — sonst
      // springt die Karte beim ersten Datensatz aus dem gemeinten Bildausschnitt.
      if (ersteDaten.current && daten.features.length && !start) {
        const b = new maplibregl.LngLatBounds();
        for (const f of daten.features) b.extend(f.geometry.coordinates);
        m.fitBounds(b, { padding: 60, maxZoom: 8, duration: 0 });
        ersteDaten.current = false;
      }
    };

    if (bereit.current) einspielen();
    else m.once("bp:bereit", einspielen);
  }, [daten, start]);

  // --- Auswahl hervorheben und anfliegen
  useEffect(() => {
    const m = map.current;
    if (!m || !bereit.current || !m.getLayer("sensoren-halo")) return;
    m.setFilter("sensoren-halo", ["==", ["get", "id"], ausgewaehlt ?? "___keiner___"]);

    // Ohne das Anfliegen passiert beim Klick auf einen Listeneintrag sichtbar
    // nichts, sobald der Sensor ausserhalb des Ausschnitts liegt — und die
    // Punkte liegen ueber vier Laender verteilt.
    if (!ausgewaehlt || !daten) return;
    const f = daten.features.find((x) => x.properties.id === ausgewaehlt);
    if (!f) return;
    const ziel = f.geometry.coordinates as [number, number];
    m.easeTo({
      center: ziel,
      zoom: Math.max(m.getZoom(), 9),
      duration: 700,
      // Platz fuer das Detailpanel rechts lassen
      padding: { top: 0, bottom: 0, left: 0, right: 0 },
    });
  }, [ausgewaehlt, daten]);

  return <div ref={container} className="h-full w-full" />;
}
