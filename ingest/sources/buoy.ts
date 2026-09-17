export interface BuoyReading {
  stationId: string;
  stationLabel: string;
  seasM: number | null;
  peakPeriodSec: number | null;
  waterTempC: number | null;
  observedAt: string | null;
}

const FT_TO_M = 0.3048;
const round1 = (n: number) => Math.round(n * 10) / 10;
const fToC = (f: number) => round1(((f - 32) * 5) / 9);

const USER_AGENT = "makani-watch/0.1 (rafal.lukasz.rostkowski@gmail.com)";

export async function fetchBuoy(
  stationId: string,
  stationLabel: string,
): Promise<BuoyReading> {
  const res = await fetch(
    `https://www.ndbc.noaa.gov/data/latest_obs/${stationId}.txt`,
    { headers: { "User-Agent": USER_AGENT } },
  );
  if (!res.ok) {
    throw new Error(`NDBC ${stationId}: HTTP ${res.status}`);
  }
  const text = await res.text();

  const seas = /Seas:\s*([\d.]+)\s*ft/i.exec(text);
  const period = /Peak Period:\s*(\d+)\s*sec/i.exec(text);
  const temp = /Water Temp:\s*([\d.]+)/i.exec(text);
  const gmt = /(\d{2})(\d{2}) GMT (\d{2})\/(\d{2})\/(\d{2})/.exec(text);

  let observedAt: string | null = null;
  if (gmt) {
    const [, hh, mm, MM, DD, YY] = gmt;
    observedAt = `20${YY}-${MM}-${DD}T${hh}:${mm}:00Z`;
  }

  return {
    stationId,
    stationLabel,
    seasM: seas ? round1(Number(seas[1]) * FT_TO_M) : null,
    peakPeriodSec: period ? Number(period[1]) : null,
    waterTempC: temp ? fToC(Number(temp[1])) : null,
    observedAt,
  };
}
