import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { AiUnnamedSystem, Storm, TripSegment } from "./types";

const HAWAII_CENTER: [number, number] = [20.5, -157];

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Fixed on-map length for the movement-direction arrow, not scaled to actual
// speed — a slow storm's real hourly displacement would be imperceptible at
// basin zoom, and a fast one's would overshoot the frame.
const ARROW_LENGTH_KM = 350;

function destinationPoint(
  lat: number,
  lon: number,
  bearingDeg: number,
  distanceKm: number,
): [number, number] {
  const R = 6371;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const angDist = distanceKm / R;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angDist) + Math.cos(lat1) * Math.sin(angDist) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angDist) * Math.cos(lat1),
      Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2),
    );
  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}

export default function BasinMap({
  storms,
  tripSegments,
  aiUnnamedSystem,
}: {
  storms: Storm[];
  tripSegments: TripSegment[];
  aiUnnamedSystem: AiUnnamedSystem | null;
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
    const l0 = cssVar("--l0") || "#1f7a5c";
    const l1 = cssVar("--l1") || "#8e7200";
    const l2 = cssVar("--l2") || "#b85b15";
    const l3 = cssVar("--l3") || "#be3419";
    const radiusColor: Record<number, string> = { 34: l1, 50: l2, 64: l3 };

    // One color language for the whole map: how strong the storm itself is
    // (same 34/50/64kt scale as the wind-field rings, explained in the
    // legend) — not how far it is from the trip. A weaker, closer system
    // used to get the same "danger red" as a stronger, distant hurricane
    // just because it was nearer, which contradicted the wind-speed legend
    // right next to it.
    function intensityColor(intensityKmh: number | null): string {
      if (intensityKmh == null) return l1;
      const knots = intensityKmh / 1.852;
      if (knots >= 64) return l3;
      if (knots >= 50) return l2;
      if (knots >= 34) return l1;
      return l0;
    }

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

    // AI-estimated position of a system with no official NHC coordinates
    // yet (see ingest/sources/ai.ts) — deliberately drawn as a fuzzy,
    // dashed, unfilled-looking circle so it can never be mistaken for a
    // real tracked storm above.
    if (aiUnnamedSystem) {
      const aiColor = cssVar("--l5") || "#6b2a83";
      const center: [number, number] = [aiUnnamedSystem.approxLat, aiUnnamedSystem.approxLon];
      bounds.extend(center);
      L.circle(center, {
        radius: aiUnnamedSystem.uncertaintyKm * 1000,
        color: aiColor,
        weight: 1.5,
        dashArray: "4 5",
        opacity: 0.7,
        fillColor: aiColor,
        fillOpacity: 0.08,
      })
        .bindTooltip(
          `AI (przybliżenie, pewność: ${aiUnnamedSystem.confidence}) — ${aiUnnamedSystem.description}`,
        )
        .addTo(layerGroup);
      L.circleMarker(center, {
        radius: 4,
        color: aiColor,
        fillColor: aiColor,
        fillOpacity: 0.6,
        weight: 1,
        dashArray: "2 2",
      }).addTo(layerGroup);
    }

    for (const storm of storms) {
      if (storm.lat == null || storm.lon == null) continue;
      const point: [number, number] = [storm.lat, storm.lon];
      bounds.extend(point);
      const stormColor = intensityColor(storm.intensityKmh);

      // Real current wind-field extent from NHC's own advisory (not an
      // estimate) — draw widest/weakest (34kt) first so the 64kt core sits
      // on top. Sorted descending by knots so smaller rings draw last.
      for (const { knots, ring } of [...storm.windRadii].sort((a, b) => b.knots - a.knots)) {
        const color = radiusColor[knots] ?? l1;
        ring.forEach((p) => bounds.extend(p));
        L.polygon(ring, {
          color,
          weight: 1,
          opacity: 0.6,
          fillColor: color,
          fillOpacity: 0.12,
        })
          .bindTooltip(`${storm.name} — wiatr ${knots}+ kt w tym zasięgu`)
          .addTo(layerGroup);
      }

      // Fading trail: oldest observed positions smallest/faintest, growing
      // toward the current position (drawn separately, full size below).
      const trail = storm.track.slice(0, -1);
      trail.forEach((p, i) => {
        bounds.extend([p.lat, p.lon]);
        const t = (i + 1) / (trail.length + 1); // 0 (oldest) .. ~1 (newest)
        L.circleMarker([p.lat, p.lon], {
          radius: 3 + t * 4,
          color: stormColor,
          fillColor: stormColor,
          fillOpacity: 0.15 + t * 0.55,
          weight: 0,
        }).addTo(layerGroup);
      });
      if (storm.track.length > 1) {
        L.polyline(
          storm.track.map((p): [number, number] => [p.lat, p.lon]),
          { color: stormColor, weight: 1.5, opacity: 0.5, dashArray: "3 4" },
        ).addTo(layerGroup);
      }

      // Movement-direction arrow, straight from NHC's advisory — a fixed
      // visual length so it reads the same for a crawling and a fast storm.
      const bearing = storm.movementDir != null ? Number(storm.movementDir) : null;
      if (bearing != null && !Number.isNaN(bearing)) {
        const tip = destinationPoint(storm.lat, storm.lon, bearing, ARROW_LENGTH_KM);
        bounds.extend(tip);
        L.polyline([point, tip], { color: stormColor, weight: 2, opacity: 0.8 }).addTo(
          layerGroup,
        );
        L.marker(tip, {
          icon: L.divIcon({
            className: "",
            html: `<div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:11px solid ${stormColor};transform:rotate(${bearing}deg);"></div>`,
            iconSize: [10, 11],
            iconAnchor: [5, 6],
          }),
          interactive: false,
        }).addTo(layerGroup);
      }

      L.circleMarker(point, {
        radius: 7,
        color: stormColor,
        fillColor: stormColor,
        fillOpacity: 0.9,
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
  }, [storms, tripSegments, aiUnnamedSystem]);

  return <div ref={containerRef} className="basin-map" />;
}
