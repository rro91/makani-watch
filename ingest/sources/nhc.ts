import type { Storm } from "../types.js";

const USER_AGENT = "makani-watch/0.1 (rafal.lukasz.rostkowski@gmail.com)";

// Live schema differs from NHC's own 2019 PDF reference doc: numbers arrive
// as strings, and the numeric coordinate fields are camelCase
// (latitudeNumeric), not snake_case (latitude_numeric) as documented.
// Verified against a live pull on 2026-09-22.
interface RawStorm {
  id: string;
  binNumber: string | null;
  name: string;
  classification: string;
  intensity: string | null;
  pressure: string | null;
  latitudeNumeric: number | null;
  longitudeNumeric: number | null;
  movementDir: number | null;
  movementSpeed: number | null;
  lastUpdate: string | null;
  publicAdvisory: { url: string } | null;
}

const CLASSIFICATION_LABELS: Record<string, string> = {
  TD: "Depresja tropikalna",
  STD: "Subtropikalna depresja",
  TS: "Sztorm tropikalny",
  HU: "Huragan",
  STS: "Sztorm subtropikalny",
  PTC: "Potencjalny cyklon tropikalny",
  PC: "Cyklon post-tropikalny",
  TY: "Tajfun",
};

// Saffir-Simpson scale (knots), only meaningful once NHC calls it a hurricane.
function saffirSimpsonCategory(classification: string, knots: number): number | null {
  if (classification !== "HU") return null;
  if (knots >= 137) return 5;
  if (knots >= 113) return 4;
  if (knots >= 96) return 3;
  if (knots >= 83) return 2;
  if (knots >= 64) return 1;
  return null;
}

export async function fetchCurrentStorms(): Promise<Storm[]> {
  const res = await fetch("https://www.nhc.noaa.gov/CurrentStorms.json", {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`CurrentStorms.json: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { activeStorms: RawStorm[] };

  // Atlantic ("al...") storms are a different ocean and cannot physically
  // affect Hawaii; only show Eastern/Central Pacific systems.
  const pacificStorms = json.activeStorms.filter(
    (s) => /^(ep|cp)/i.test(s.id),
  );

  return pacificStorms.map((s) => {
    const knots = s.intensity != null ? Number(s.intensity) : null;
    return {
      id: s.id,
      binNumber: s.binNumber,
      name: s.name,
      classification: s.classification,
      classificationLabel: CLASSIFICATION_LABELS[s.classification] ?? s.classification,
      category: knots != null ? saffirSimpsonCategory(s.classification, knots) : null,
      intensityKmh: knots != null ? Math.round(knots * 1.852) : null,
      pressureMb: s.pressure != null ? Number(s.pressure) : null,
      lat: s.latitudeNumeric,
      lon: s.longitudeNumeric,
      movementDir: s.movementDir != null ? String(s.movementDir) : null,
      movementMph: s.movementSpeed,
      lastUpdate: s.lastUpdate,
      publicAdvisoryUrl: s.publicAdvisory?.url ?? null,
      distanceKmToTrip: null, // filled in by the rule engine once trip context is known
      track: [], // filled in by run.ts, which merges in prior-run history
    } satisfies Storm;
  });
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
