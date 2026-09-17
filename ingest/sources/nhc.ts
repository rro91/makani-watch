import type { Storm } from "../types.js";

const USER_AGENT = "makani-watch/0.1 (rafal.lukasz.rostkowski@gmail.com)";

// Schema: NHC Tropical Cyclone Status JSON File Reference (nhc.noaa.gov, 2019).
interface RawStorm {
  id: string;
  binNumber: string | null;
  name: string;
  classification: string;
  intensity: number | null;
  pressure: number | null;
  latitude: string | null;
  longitude: string | null;
  latitude_numeric: number | null;
  longitude_numeric: number | null;
  movementDir: number | null;
  movementSpeed: number | null;
  lastUpdate: string | null;
  publicAdvisory: { url: string } | null;
}

export async function fetchCurrentStorms(): Promise<Storm[]> {
  const res = await fetch("https://www.nhc.noaa.gov/CurrentStorms.json", {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`CurrentStorms.json: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { activeStorms: RawStorm[] };

  return json.activeStorms.map((s) => ({
    id: s.id,
    binNumber: s.binNumber,
    name: s.name,
    classification: s.classification,
    intensityKmh: s.intensity != null ? Math.round(s.intensity * 1.852) : null,
    pressureMb: s.pressure,
    lat: s.latitude_numeric,
    lon: s.longitude_numeric,
    movementDir: s.movementDir != null ? String(s.movementDir) : null,
    movementMph: s.movementSpeed,
    lastUpdate: s.lastUpdate,
    publicAdvisoryUrl: s.publicAdvisory?.url ?? null,
    distanceKmToTrip: null, // filled in by the rule engine once trip context is known
  } satisfies Storm));
}

export interface CpacOutlook {
  formation48h: number | null;
  formation7day: number | null;
  text: string | null;
}

export async function fetchCpacOutlook(): Promise<CpacOutlook> {
  const res = await fetch("https://www.nhc.noaa.gov/index-cp.xml", {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`index-cp.xml: HTTP ${res.status}`);
  }
  const xml = await res.text();

  const match = /<title>\s*Central North Pacific Tropical Weather Outlook\s*<\/title>[\s\S]*?<description>\s*<!\[CDATA\[([\s\S]*?)\]\]>/i.exec(
    xml,
  );
  if (!match) {
    return { formation48h: null, formation7day: null, text: null };
  }
  const raw = match[1] ?? "";
  const text = raw.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();

  const h48 = /through 48 hours\.{0,3}\s*\w+\.{0,3}\s*(\d+)\s*percent/i.exec(text);
  const h7 = /through 7 days\.{0,3}\s*\w+\.{0,3}\s*(\d+)\s*percent/i.exec(text);

  return {
    formation48h: h48 ? Number(h48[1]) : null,
    formation7day: h7 ? Number(h7[1]) : null,
    text,
  };
}
