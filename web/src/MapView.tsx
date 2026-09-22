import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Alert, Island, Storm, ThreatSnapshot } from "./types";
import IslandTabs from "./IslandTabs";

interface ZoneFeatureProps {
  id: string;
  name: string;
  island: Island;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const ISLAND_CENTER: Record<Island, [number, number]> = {
  Oahu: [21.47, -157.98],
  BigIsland: [19.59, -155.5],
  Maui: [20.8, -156.33],
};

export default function MapView({
  snapshot,
  alerts,
}: {
  snapshot: ThreatSnapshot;
  alerts: Alert[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const defaultIsland: Island =
    snapshot.currentIsland ?? snapshot.defaultForecastIsland;
  const [selectedIsland, setSelectedIsland] = useState<Island | null>(null);
  const displayIsland = selectedIsland ?? defaultIsland;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const [lat, lon] = ISLAND_CENTER[displayIsland];

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([lat, lon], 10);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);

    mapRef.current = map;
    layerGroupRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    let cancelled = false;

    (async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}zones.geojson`, {
        cache: "force-cache",
      });
      const geojson = (await res.json()) as GeoJSON.FeatureCollection;
      if (cancelled) return;

      layerGroup.clearLayers();

      // zone id -> event names of every alert covering it (usually just one,
      // but a zone can carry more than one active alert at once)
      const zoneAlerts = new Map<string, string[]>();
      for (const a of alerts) {
        for (const z of a.zones) {
          zoneAlerts.set(z, [...(zoneAlerts.get(z) ?? []), a.event]);
        }
      }

      const neutral = cssVar("--rule") || "#c9d4d4";
      const alerted = cssVar("--l2") || "#b85b15";
      const active = cssVar("--accent") || "#0b6e7a";

      const zonesLayer = L.geoJSON(geojson, {
        filter: (feature) =>
          (feature.properties as ZoneFeatureProps).island === displayIsland,
        style: (feature) => {
          const props = feature!.properties as ZoneFeatureProps;
          const hasAlert = zoneAlerts.has(props.id);
          return {
            color: hasAlert ? alerted : neutral,
            weight: hasAlert ? 2 : 1,
            fillColor: hasAlert ? alerted : neutral,
            fillOpacity: hasAlert ? 0.35 : 0.08,
          };
        },
        onEachFeature: (feature, layer) => {
          const props = feature.properties as ZoneFeatureProps;
          const events = zoneAlerts.get(props.id);
          const suffix = events ? ` — ${[...new Set(events)].join(", ")}` : " — brak alertów";
          layer.bindTooltip(`${props.name} (${props.id})${suffix}`);
        },
      }).addTo(layerGroup);

      const bounds = zonesLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [16, 16] });
      }

      if (displayIsland === snapshot.currentIsland) {
        const [clat, clon] = ISLAND_CENTER[displayIsland];
        L.circleMarker([clat, clon], {
          radius: 7,
          color: active,
          fillColor: active,
          fillOpacity: 1,
          weight: 2,
        })
          .bindTooltip("Jesteś tutaj dzisiaj")
          .addTo(layerGroup);
      }

      for (const storm of snapshot.storms as Storm[]) {
        if (storm.lat == null || storm.lon == null) continue;
        L.marker([storm.lat, storm.lon])
          .bindTooltip(
            `${storm.name} · ${storm.classification} · ${storm.intensityKmh ?? "?"} km/h`,
          )
          .addTo(layerGroup);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [snapshot, alerts, displayIsland]);

  return (
    <div>
      <IslandTabs
        segments={snapshot.tripSegments}
        selected={displayIsland}
        onSelect={setSelectedIsland}
      />
      <div ref={containerRef} className="map-view" />
    </div>
  );
}
