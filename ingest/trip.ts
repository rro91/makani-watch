import type { TripSegment } from "./types.js";

// Confirmed itinerary. LA legs before 2.10 and after 12.10 are intentionally
// absent — the app has nothing to say about Hawaii threats while you're not there.
export const TRIP_SEGMENTS: TripSegment[] = [
  {
    island: "Oahu",
    islandLabel: "Oahu",
    start: "2026-10-02",
    end: "2026-10-05",
    centroid: { lat: 21.47, lon: -157.98 },
    buoyStationId: "51201",
    buoyLabel: "Waimea Bay, Oahu",
    outageMapUrl: "https://www.hawaiianelectric.com/safety-and-outages/power-outages/oahu-outage-map",
    zones: [
      "HIZ006", // Waianae Coast
      "HIZ007", // Oahu North Shore
      "HIZ009", // Olomana
      "HIZ010", // Central Oahu
      "HIZ011", // Waianae Mountains
      "HIZ032", // East Honolulu
      "HIZ033", // Honolulu Metro
      "HIZ034", // Ewa Plain
      "HIZ035", // Koolau Windward
      "HIZ036", // Koolau Leeward
    ],
  },
  {
    island: "BigIsland",
    islandLabel: "Big Island",
    start: "2026-10-05",
    end: "2026-10-08",
    centroid: { lat: 19.59, lon: -155.5 },
    buoyStationId: "51206",
    buoyLabel: "Hilo, Big Island",
    outageMapUrl: "https://www.hawaiianelectric.com/safety-and-outages/power-outages/hawaii-island-outage-map",
    zones: [
      "HIZ023", // Kona
      "HIZ026", // Kohala
      "HIZ027", // Big Island Interior
      "HIZ028", // Big Island Summit
      "HIZ051", // Big Island South
      "HIZ052", // Big Island Southeast
      "HIZ053", // Big Island East
      "HIZ054", // Big Island North
    ],
  },
  {
    island: "Maui",
    islandLabel: "Maui",
    start: "2026-10-08",
    end: "2026-10-12",
    centroid: { lat: 20.8, lon: -156.33 },
    buoyStationId: "51205",
    buoyLabel: "Pauwela, Maui",
    outageMapUrl: "https://www.hawaiianelectric.com/safety-and-outages/power-outages/maui-county-outage-map",
    zones: [
      "HIZ017", // Maui Windward West
      "HIZ018", // Maui Leeward West
      "HIZ022", // Haleakala Summit
      "HIZ045", // Maui Central Valley North
      "HIZ046", // Maui Central Valley South
      "HIZ047", // Windward Haleakala
      "HIZ048", // Kipahulu
      "HIZ049", // South Maui/Upcountry
      "HIZ050", // South Haleakala
    ],
  },
];

export function findSegmentForDate(dateIso: string): TripSegment | null {
  return (
    TRIP_SEGMENTS.find((seg) => dateIso >= seg.start && dateIso < seg.end) ??
    null
  );
}
