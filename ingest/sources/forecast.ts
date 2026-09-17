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

interface DailyBlock {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_sum: number[];
  wind_speed_10m_max: number[];
  wind_gusts_10m_max: number[];
  cloud_cover_mean: number[];
}

interface MarineDailyBlock {
  time: string[];
  wave_height_max: number[];
  wave_period_max: number[];
}

export async function fetchForecast(
  lat: number,
  lon: number,
): Promise<DailyForecast[]> {
  // No unit params: Open-Meteo's defaults are already metric (°C, km/h, mm, m).
  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,cloud_cover_mean` +
    `&forecast_days=7&timezone=Pacific%2FHonolulu`;
  const marineUrl =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&daily=wave_height_max,wave_period_max&forecast_days=7&timezone=Pacific%2FHonolulu`;

  const [forecastRes, marineRes] = await Promise.all([
    fetch(forecastUrl),
    fetch(marineUrl),
  ]);
  if (!forecastRes.ok) throw new Error(`open-meteo forecast: HTTP ${forecastRes.status}`);

  const forecastJson = (await forecastRes.json()) as { daily: DailyBlock };
  const daily = forecastJson.daily;

  // Marine API can be flaky for some coastal points; degrade gracefully rather
  // than losing the whole forecast over missing wave data.
  let marine: MarineDailyBlock | null = null;
  if (marineRes.ok) {
    const marineJson = (await marineRes.json()) as { daily: MarineDailyBlock };
    marine = marineJson.daily;
  }

  return daily.time.map((date, i) => ({
    date,
    weatherCode: daily.weather_code[i] ?? -1,
    tempMaxC: daily.temperature_2m_max[i] ?? null,
    tempMinC: daily.temperature_2m_min[i] ?? null,
    precipMm: daily.precipitation_sum[i] ?? null,
    windMaxKmh: daily.wind_speed_10m_max[i] ?? null,
    windGustMaxKmh: daily.wind_gusts_10m_max[i] ?? null,
    waveHeightMaxM: marine?.wave_height_max[i] ?? null,
    wavePeriodMaxS: marine?.wave_period_max[i] ?? null,
    cloudCoverPct: daily.cloud_cover_mean[i] ?? null,
  }));
}
