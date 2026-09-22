// Client-side mirror of ingest/rules.ts, used to recompute the threat level
// from freshly-fetched alerts in the browser (see liveAlerts.ts) — because
// GitHub Actions' free-tier scheduler frequently delays or silently drops
// sub-hourly cron runs, so the committed snapshot can be stale for hours.
// Keep this in sync with ingest/rules.ts if the rule table changes.
import type {
  Alert,
  Island,
  Mode,
  Storm,
  ThreatLevel,
  TripSegment,
} from "./types";

const LEVEL_LABELS: Record<ThreatLevel, string> = {
  0: "Spokój",
  1: "Obserwacja",
  2: "Podwyższony",
  3: "Watch",
  4: "Warning",
  5: "Uderzenie",
};

const RECOMMENDATIONS: Record<Mode, Record<ThreatLevel, string>> = {
  "before-trip": {
    0: "Bez zmian. Nic nie musisz teraz robić.",
    1: "Coś może się tworzyć, ale to na razie dni i setki kilometrów od Waszej trasy. Sprawdzaj raz dziennie.",
    2: "Jest aktywne ostrzeżenie gdzieś na Hawajach — sprawdź niżej, czy dotyczy Waszych wysp i dat. Zwykle nic nie trzeba jeszcze zmieniać.",
    3: "Sytuacja poważnieje. Sprawdź szczegóły niżej i rozważ elastyczne rezerwacje na wypadek zmian przed wylotem.",
    4: "Poważne ostrzeżenie aktywne na Hawajach. Śledź rozwój sytuacji i miej kontakt z liniami lotniczymi, jeśli się nie uspokoi do wylotu.",
    5: "Sytuacja krytyczna na Hawajach. Zanim polecicie, sprawdźcie oficjalne komunikaty o stanie wyjątkowym.",
  },
  "on-location": {
    0: "Bez zmian. Plan dnia aktualny.",
    1: "Coś się tworzy, ale daleko. Sprawdzaj raz dziennie.",
    2: "Uważaj na wodę i drogi dzisiaj. Miej plan B na ten dzień.",
    3: "Zmień plan dnia. Sprawdź loty i rezerwacje.",
    4: "Zostań w bazie. Zapasy, woda, powerbank, gotówka.",
    5: "Tryb kryzysowy: schron, kontakty, PDF offline, radio.",
  },
  "outside-hawaii": {
    0: "Poza Hawajami — monitoring wstrzymany.",
    1: "Poza Hawajami — monitoring wstrzymany.",
    2: "Poza Hawajami — monitoring wstrzymany.",
    3: "Poza Hawajami — monitoring wstrzymany.",
    4: "Poza Hawajami — monitoring wstrzymany.",
    5: "Poza Hawajami — monitoring wstrzymany.",
  },
};

const EVENT_LEVEL: Array<{ pattern: RegExp; level: ThreatLevel; label: string }> = [
  { pattern: /hurricane warning/i, level: 5, label: "Hurricane Warning aktywne" },
  { pattern: /extreme wind warning/i, level: 5, label: "Extreme Wind Warning aktywne" },
  { pattern: /tropical storm warning/i, level: 4, label: "Tropical Storm Warning aktywne" },
  { pattern: /storm surge warning/i, level: 4, label: "Storm Surge Warning aktywne" },
  { pattern: /hurricane watch/i, level: 3, label: "Hurricane Watch aktywne" },
  { pattern: /tropical storm watch/i, level: 3, label: "Tropical Storm Watch aktywne" },
  { pattern: /flash flood warning/i, level: 3, label: "Flash Flood Warning aktywne" },
  { pattern: /tornado watch/i, level: 3, label: "Tornado Watch aktywne (precedens: 8.09.2026)" },
  { pattern: /tornado warning/i, level: 3, label: "Tornado Warning aktywne" },
  { pattern: /flood watch/i, level: 2, label: "Flood Watch aktywne" },
  { pattern: /high surf warning/i, level: 2, label: "High Surf Warning aktywne" },
  { pattern: /coastal flood watch/i, level: 2, label: "Coastal Flood Watch aktywne" },
  { pattern: /storm surge watch/i, level: 2, label: "Storm Surge Watch aktywne" },
  { pattern: /high surf advisory/i, level: 1, label: "High Surf Advisory aktywne" },
  { pattern: /small craft advisory/i, level: 1, label: "Small Craft Advisory aktywne" },
  { pattern: /beach hazard/i, level: 1, label: "Beach Hazards Statement aktywne" },
  { pattern: /wind advisory/i, level: 1, label: "Wind Advisory aktywne" },
  { pattern: /flood advisory/i, level: 1, label: "Flood Advisory aktywne" },
];

function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface RuleContext {
  mode: Mode;
  currentIsland: Island | null;
  activeSegment: TripSegment | null;
  alerts: Alert[];
  storms: Storm[];
  outlookFormation7day: number | null;
}

export interface RuleResult {
  level: ThreatLevel;
  levelLabel: string;
  recommendation: string;
  scopeLabel: string;
  reasons: string[];
  storms: Storm[];
  relevantAlerts: Alert[];
}

export function computeThreatLevel(ctx: RuleContext): RuleResult {
  const reasons: string[] = [];
  let level: ThreatLevel = 0;

  const relevantZones = new Set(ctx.activeSegment?.zones ?? []);
  const relevantAlerts =
    ctx.mode === "on-location" && relevantZones.size > 0
      ? ctx.alerts.filter((a) => a.zones.some((z) => relevantZones.has(z)))
      : ctx.mode === "before-trip"
        ? ctx.alerts
        : [];

  for (const alert of relevantAlerts) {
    for (const rule of EVENT_LEVEL) {
      if (rule.pattern.test(alert.event)) {
        if (rule.level > level) level = rule.level;
        const zoneNote = alert.zones.length ? ` (${alert.zones.join(", ")})` : "";
        reasons.push(`${rule.label}${zoneNote} — "${alert.headline}"`);
        break;
      }
    }
    if (alert.severity === "Extreme" && level < 5) {
      level = 5;
      reasons.push(`Alert o severity Extreme — "${alert.headline}"`);
    }
  }

  const monitoringActive = ctx.mode !== "outside-hawaii";
  const originPoint =
    ctx.activeSegment?.centroid ?? { lat: 21.3, lon: -157.86 };

  const stormsWithDistance = ctx.storms.map((s) => {
    if (s.lat == null || s.lon == null) {
      return { ...s, distanceKmToTrip: null };
    }
    const distanceKm = Math.round(haversineKm(originPoint, { lat: s.lat, lon: s.lon }));
    return { ...s, distanceKmToTrip: distanceKm };
  });

  if (monitoringActive) {
    for (const storm of stormsWithDistance) {
      if (storm.distanceKmToTrip == null) continue;
      if (storm.distanceKmToTrip <= 1600) {
        if (level < 2) level = 2;
        reasons.push(
          `Aktywny cyklon ${storm.name} (${storm.classification}) ~${storm.distanceKmToTrip} km od trasy`,
        );
      }
    }

    if (ctx.outlookFormation7day != null && ctx.outlookFormation7day >= 40) {
      if (level < 1) level = 1;
      reasons.push(
        `Prognoza CPHC: ${ctx.outlookFormation7day}% szans na nowy cyklon w ciągu 7 dni`,
      );
    }
  }

  if (reasons.length === 0) {
    reasons.push(
      monitoringActive
        ? "Brak cyklonów w zasięgu i brak aktywnych alertów NWS dla trasy."
        : "Poza Hawajami — monitoring wstrzymany do powrotu.",
    );
  }

  let scopeLabel: string;
  if (ctx.mode === "outside-hawaii") {
    scopeLabel = "Poza zasięgiem monitoringu (Los Angeles)";
  } else if (ctx.mode === "on-location" && ctx.activeSegment) {
    scopeLabel = `${ctx.activeSegment.islandLabel} — ${ctx.activeSegment.zones.length} stref NWS na trasie dnia`;
  } else {
    scopeLabel = "Cała Hawaje — 43 strefy NWS (jeszcze nie zawężone do Waszej trasy)";
  }

  return {
    level,
    levelLabel: LEVEL_LABELS[level],
    recommendation: RECOMMENDATIONS[ctx.mode][level],
    scopeLabel,
    reasons,
    storms: stormsWithDistance,
    relevantAlerts,
  };
}
