import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Storm, TripSegment } from "./types";

const HAWAII_CENTER: [number, number] = [20.5, -157];

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Storms this far or closer actually matter to the rule engine (see
// ingest/rules.ts) — color the marker accordingly so distance reads at a
// glance instead of requiring a click.
const NEAR_KM = 1600;

export default function BasinMap({
  storms,
  tripSegments,
}: {
  storms: Storm[];
  tripSegments: TripSegment[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(HAWAII_CENTER, 5);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 10,
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

    // This map usually mounts below the fold, so Leaflet can measure a
    // stale/zero container size at init time — without this, fitBounds
    // silently computes zoom 0 (the whole world) instead of the real area.
    map.invalidateSize();

    layerGroup.clearLayers();

    const accent = cssVar("--accent") || "#0b6e7a";
    const near = cssVar("--l3") || "#be3419";
    const far = cssVar("--l1") || "#8e7200";

    L.circleMarker(HAWAII_CENTER, {
      radius: 9,
      color: accent,
      fillColor: accent,
      fillOpacity: 1,
      weight: 2,
    })
      .bindTooltip(`Hawaje (${tripSegments.map((s) => s.islandLabel).join(", ")})`, {
        permanent: true,
        direction: "top",
      })
      .addTo(layerGroup);

    const bounds = L.latLngBounds([HAWAII_CENTER]);

    for (const storm of storms) {
      if (storm.lat == null || storm.lon == null) continue;
      const point: [number, number] = [storm.lat, storm.lon];
      bounds.extend(point);
      const isNear = storm.distanceKmToTrip != null && storm.distanceKmToTrip <= NEAR_KM;

      L.circleMarker(point, {
        radius: 7,
        color: isNear ? near : far,
        fillColor: isNear ? near : far,
        fillOpacity: 0.85,
        weight: 2,
      })
        .bindTooltip(
          `${storm.name} · ${storm.classificationLabel}${
            storm.category != null ? ` (kat. ${storm.category})` : ""
          } · ${storm.intensityKmh ?? "?"} km/h` +
            (storm.distanceKmToTrip != null
              ? ` · ~${storm.distanceKmToTrip.toLocaleString("pl-PL")} km od Hawajów`
              : ""),
        )
        .addTo(layerGroup);
    }

    if (storms.some((s) => s.lat != null && s.lon != null)) {
      map.fitBounds(bounds, { padding: [30, 30] });
    } else {
      map.setView(HAWAII_CENTER, 5);
    }
  }, [storms, tripSegments]);

  return <div ref={containerRef} className="basin-map" />;
}
