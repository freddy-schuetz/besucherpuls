"use client";

import { useEffect, useRef } from "react";
import maplibregl, { Map as MlMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { AMPEL_FARBE, type ZielProps } from "@/lib/types";

/**
 * Karte fuer die Ziele.
 *
 * Zwei Dinge, die vorher falsch waren:
 *
 * 1. Die Karte faerbte nach dem ROHEN ampel-Feld, waehrend die Kacheln daneben
 *    einen anders berechneten Status zeigten. Wien und Kiel standen deshalb
 *    komplett grau, obwohl jede Kachel gruen war. Jetzt kommt der Status
 *    fertig aus dem Workflow und wird hier nur noch eingefaerbt.
 *
 * 2. Ein Kategoriefilter wirkte nur auf die Liste. Wer "Bergbahn" waehlte, sah
 *    unten neun Eintraege und auf der Karte weiterhin alle 52 Punkte. Die Karte
 *    bekommt jetzt dieselbe gefilterte Menge wie die Liste.
 *
 * Die Karteninstanz wird EINMAL erzeugt und danach nur ueber source.setData()
 * gefuettert — sonst spraenge bei jedem Minuten-Refresh der Zoom des Nutzers
 * zurueck.
 */
export default function LiveMap({
  ziele,
  ausgewaehlt,
  onSelect,
  start,
}: {
  ziele: ZielProps[];
  ausgewaehlt: string | null;
  onSelect: (id: string) => void;
  /** Fester Startausschnitt. Ohne diesen wird auf alle Punkte gezoomt. */
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
      m.addSource("ziele", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Weicher Hof in der Statusfarbe — laesst die Punkte auf der hellen
      // Grundkarte plastisch wirken, ohne dass ein Schlagschatten noetig waere.
      m.addLayer({
        id: "ziele-hof",
        type: "circle",
        source: "ziele",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 15, 12, 22],
          "circle-color": ["get", "farbe"],
          "circle-opacity": 0.16,
        },
      });

      m.addLayer({
        id: "ziele-halo",
        type: "circle",
        source: "ziele",
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
        id: "ziele-punkt",
        type: "circle",
        source: "ziele",
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

      // Name am Punkt, sobald man nah genug ist. Ohne Beschriftung muss man
      // jeden Punkt antippen, um zu wissen, was er ist — bei einer Karte, die
      // Ziele zeigt statt Messstellen, ist der Name die halbe Information.
      m.addLayer({
        id: "ziele-schrift",
        type: "symbol",
        source: "ziele",
        minzoom: 10.5,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 12,
          "text-offset": [0, 1.5],
          "text-anchor": "top",
          "text-max-width": 9,
          "text-allow-overlap": false,
          "text-optional": true,
        },
        paint: {
          "text-color": "#2b3a35",
          "text-halo-color": "#ffffff",
          "text-halo-width": 1.6,
        },
      });

      m.on("click", "ziele-punkt", (e) => {
        const f = e.features?.[0];
        if (f?.properties?.id) onSelectRef.current(String(f.properties.id));
      });
      m.on("mouseenter", "ziele-punkt", () => {
        m.getCanvas().style.cursor = "pointer";
      });
      m.on("mouseleave", "ziele-punkt", () => {
        m.getCanvas().style.cursor = "";
      });

      bereit.current = true;
      map.current = m;
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
    if (!m) return;

    const einspielen = () => {
      const src = m.getSource("ziele") as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      src.setData({
        type: "FeatureCollection",
        features: ziele.map((z) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [z.lon, z.lat] },
          properties: {
            id: z.id,
            name: z.name,
            ampel: z.ampel,
            farbe: AMPEL_FARBE[z.ampel] ?? AMPEL_FARBE.unbekannt,
          },
        })),
      } as GeoJSON.FeatureCollection);

      if (ersteDaten.current && ziele.length && !start) {
        const b = new maplibregl.LngLatBounds();
        for (const z of ziele) b.extend([z.lon, z.lat]);
        m.fitBounds(b, { padding: 60, maxZoom: 8, duration: 0 });
        ersteDaten.current = false;
      }
    };

    if (bereit.current) einspielen();
    else m.once("bp:bereit", einspielen);
  }, [ziele, start]);

  // --- Auswahl hervorheben und anfliegen
  useEffect(() => {
    const m = map.current;
    if (!m || !bereit.current || !m.getLayer("ziele-halo")) return;
    m.setFilter("ziele-halo", ["==", ["get", "id"], ausgewaehlt ?? "___keiner___"]);

    if (!ausgewaehlt) return;
    const z = ziele.find((x) => x.id === ausgewaehlt);
    if (!z) return;
    m.easeTo({ center: [z.lon, z.lat], zoom: Math.max(m.getZoom(), 11), duration: 700 });
  }, [ausgewaehlt, ziele]);

  // data-ziele traegt die Zahl der eingespielten Punkte nach aussen. Die Karte
  // zeichnet auf Canvas — ohne diesen Wert laesst sich von aussen nicht pruefen,
  // ob der Kategoriefilter wirklich auf der Karte ankommt oder nur in der Liste
  // (genau dieser Unterschied war der Fehler). Kostet nichts und macht die
  // Zusicherung nachweisbar statt behauptet.
  return <div ref={container} data-ziele={ziele.length} className="h-full w-full" />;
}
