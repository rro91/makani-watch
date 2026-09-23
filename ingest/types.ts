export type ThreatLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type Island = "Oahu" | "BigIsland" | "Maui";

export type Mode = "before-trip" | "on-location" | "outside-hawaii";

export interface TripSegment {
  island: Island;
  islandLabel: string;
  /** ISO date (UTC), inclusive */
  start: string;
  /** ISO date (UTC), exclusive */
  end: string;
  zones: string[];
  centroid: { lat: number; lon: number };
  buoyStationId: string;
  buoyLabel: string;
  outageMapUrl: string;
}

export interface DailyForecast {
  date: string;
  weatherCode: number;
  tempMaxC: number | null;
  tempMinC: number | null;
  precipMm: number | null;
  windMaxKmh: number | null;
  windGustMaxKmh: number | null;
  waveHeightMaxM: number | null;
  wavePeriodMaxS: number | null;
  cloudCoverPct: number | null;
}

export interface BuoyReading {
  stationId: string;
  stationLabel: string;
  seasM: number | null;
  peakPeriodSec: number | null;
  waterTempC: number | null;
  observedAt: string | null;
}

export interface Alert {
  id: string;
  event: string;
  severity: string;
  urgency: string;
  certainty: string;
  headline: string;
  description: string;
  instruction: string | null;
  areaDesc: string;
  zones: string[];
  effective: string | null;
  expires: string | null;
  senderName: string;
  sourceUrl: string;
}

export interface StormTrackPoint {
  lat: number;
  lon: number;
  capturedAt: string;
}

export interface WindRadiusRing {
  knots: number;
  ring: [number, number][];
}

export interface Storm {
  id: string;
  binNumber: string | null;
  name: string;
  classification: string;
  classificationLabel: string;
  category: number | null;
  intensityKmh: number | null;
  pressureMb: number | null;
  lat: number | null;
  lon: number | null;
  movementDir: string | null;
  movementMph: number | null;
  lastUpdate: string | null;
  publicAdvisoryUrl: string | null;
  distanceKmToTrip: number | null;
  /** Last few observed positions (oldest first), accumulated across ingest
   * runs — NHC's live feed only gives current position, not history. */
  track: StormTrackPoint[];
  /** Real current wind-field extent from NHC's own advisory (not a guess);
   * empty when NHC hasn't published one for this storm. */
  windRadii: WindRadiusRing[];
}

export interface SourceHealth {
  source: string;
  ok: boolean;
  fetchedAt: string;
  ageSeconds: number;
  error?: string;
}

export interface ThreatSnapshot {
  computedAt: string;
  mode: Mode;
  currentIsland: Island | null;
  level: ThreatLevel;
  levelLabel: string;
  recommendation: string;
  scopeLabel: string;
  reasons: string[];
  alerts: Alert[];
  storms: Storm[];
  outlookFormation48h: number | null;
  outlookFormation7day: number | null;
  outlookText: string | null;
  sources: SourceHealth[];
  tripSegments: TripSegment[];
  defaultForecastIsland: Island;
  forecastByIsland: Record<Island, DailyForecast[]>;
  buoyByIsland: Record<Island, BuoyReading | null>;
  /** AI-generated explanation of the (already rule-computed) level — null
   * when no ANTHROPIC_API_KEY is configured or the call failed. */
  aiBriefing: string | null;
  aiUnnamedSystem: AiUnnamedSystem | null;
}

export interface AiUnnamedSystem {
  description: string;
  approxLat: number;
  approxLon: number;
  uncertaintyKm: number;
  confidence: "low" | "medium" | "high";
}
