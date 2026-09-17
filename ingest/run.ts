import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  BuoyReading,
  DailyForecast,
  Island,
  Mode,
  SourceHealth,
  Storm,
  ThreatSnapshot,
} from "./types.js";
import { TRIP_SEGMENTS, findSegmentForDate } from "./trip.js";
import { fetchActiveAlertsHI } from "./sources/nws.js";
import { fetchCurrentStorms, fetchCpacOutlook } from "./sources/nhc.js";
import { fetchForecast } from "./sources/forecast.js";
import { fetchBuoy } from "./sources/buoy.js";
import { computeThreatLevel } from "./rules.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATHS = [
  join(__dirname, "..", "data", "snapshot.json"),
  join(__dirname, "..", "web", "public", "snapshot.json"),
];

async function withHealth<T>(
  source: string,
  fn: () => Promise<T>,
): Promise<{ value: T | null; health: SourceHealth }> {
  const startedAt = new Date();
  try {
    const value = await fn();
    return {
      value,
      health: {
        source,
        ok: true,
        fetchedAt: startedAt.toISOString(),
        ageSeconds: 0,
      },
    };
  } catch (err) {
    return {
      value: null,
      health: {
        source,
        ok: false,
        fetchedAt: startedAt.toISOString(),
        ageSeconds: 0,
        error: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

async function main() {
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);

  const activeSegment = findSegmentForDate(todayIso);
  const mode: Mode = activeSegment
    ? "on-location"
    : todayIso < (TRIP_SEGMENTS[0]?.start ?? "9999-12-31")
      ? "before-trip"
      : "outside-hawaii";

  // Before departure there's no "current" island yet, so default the
  // selection to the first leg (Oahu) rather than showing an empty card —
  // but fetch forecast + buoy for all three islands so the UI can switch.
  const defaultForecastIsland: Island =
    activeSegment?.island ?? TRIP_SEGMENTS[0]?.island ?? "Oahu";

  const [alertsResult, stormsResult, outlookResult, ...perIslandResults] =
    await Promise.all([
      withHealth("api.weather.gov/alerts", fetchActiveAlertsHI),
      withHealth("nhc.noaa.gov/CurrentStorms.json", fetchCurrentStorms),
      withHealth("nhc.noaa.gov/index-cp.xml", fetchCpacOutlook),
      ...TRIP_SEGMENTS.flatMap((seg) => [
        withHealth(`open-meteo (${seg.islandLabel})`, () =>
          fetchForecast(seg.centroid.lat, seg.centroid.lon),
        ),
        withHealth(`ndbc buoy (${seg.islandLabel})`, () =>
          fetchBuoy(seg.buoyStationId, seg.buoyLabel),
        ),
      ]),
    ]);

  const alerts = alertsResult.value ?? [];
  const storms: Storm[] = stormsResult.value ?? [];
  const outlook = outlookResult.value;

  const forecastByIsland = {} as Record<Island, DailyForecast[]>;
  const buoyByIsland = {} as Record<Island, BuoyReading | null>;
  const perIslandHealth: SourceHealth[] = [];
  TRIP_SEGMENTS.forEach((seg, i) => {
    const forecastResult = perIslandResults[i * 2] as {
      value: DailyForecast[] | null;
      health: SourceHealth;
    };
    const buoyResult = perIslandResults[i * 2 + 1] as {
      value: BuoyReading | null;
      health: SourceHealth;
    };
    forecastByIsland[seg.island] = forecastResult.value ?? [];
    buoyByIsland[seg.island] = buoyResult.value ?? null;
    perIslandHealth.push(forecastResult.health, buoyResult.health);
  });

  const rule = computeThreatLevel({
    mode,
    currentIsland: activeSegment?.island ?? null,
    activeSegment,
    alerts,
    storms,
    outlookFormation7day: outlook?.formation7day ?? null,
  });

  const snapshot: ThreatSnapshot = {
    computedAt: now.toISOString(),
    mode,
    currentIsland: activeSegment?.island ?? null,
    level: rule.level,
    levelLabel: rule.levelLabel,
    recommendation: rule.recommendation,
    scopeLabel: rule.scopeLabel,
    reasons: rule.reasons,
    alerts:
      mode === "on-location" && activeSegment
        ? alerts.filter((a) =>
            a.zones.some((z) => activeSegment.zones.includes(z)),
          )
        : alerts,
    storms: rule.storms,
    outlookFormation48h: outlook?.formation48h ?? null,
    outlookFormation7day: outlook?.formation7day ?? null,
    outlookText: outlook?.text ?? null,
    sources: [
      alertsResult.health,
      stormsResult.health,
      outlookResult.health,
      ...perIslandHealth,
    ],
    tripSegments: TRIP_SEGMENTS,
    defaultForecastIsland,
    forecastByIsland,
    buoyByIsland,
  };

  for (const path of OUT_PATHS) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(snapshot, null, 2), "utf-8");
  }

  console.log(
    `[makani-watch] mode=${mode} island=${snapshot.currentIsland ?? "-"} level=${snapshot.level} (${snapshot.levelLabel})`,
  );
  console.log(`[makani-watch] reasons: ${rule.reasons.join(" | ")}`);
  for (const s of snapshot.sources) {
    console.log(
      `[makani-watch] source ${s.source}: ${s.ok ? "ok" : `FAILED (${s.error})`}`,
    );
  }
}

main().catch((err) => {
  console.error("[makani-watch] fatal:", err);
  process.exit(1);
});
