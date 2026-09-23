import AdmZip from "adm-zip";

const USER_AGENT = "makani-watch/0.1 (rafal.lukasz.rostkowski@gmail.com)";

export interface WindRadiusRing {
  /** Sustained wind threshold this ring encloses, in knots (34/50/64). */
  knots: number;
  /** [lat, lon] pairs tracing the ring. */
  ring: [number, number][];
}

// NHC's "initial wind extent" KMZ is a real, current wind-field shape (not a
// forecast) — a zipped KML with one Placemark per wind-speed threshold, each
// a simple polygon. Regex is enough: the file is machine-generated and
// consistently formatted, and pulling in a full XML/DOM parser for one tag
// shape isn't worth it (see how ingest/sources/nhc.ts parses the CPHC
// outlook text the same way).
export async function fetchWindRadii(kmzUrl: string): Promise<WindRadiusRing[]> {
  const res = await fetch(kmzUrl, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`wind extent KMZ: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buf);
  const kmlEntry = zip.getEntries().find((e) => e.entryName.endsWith(".kml"));
  if (!kmlEntry) {
    throw new Error("wind extent KMZ: no .kml entry found");
  }
  const kml = kmlEntry.getData().toString("utf-8");

  const rings: WindRadiusRing[] = [];
  const placemarkRe = /<Placemark>.*?<name>(\d+)<\/name>.*?<coordinates>([^<]+)<\/coordinates>.*?<\/Placemark>/gs;
  for (const match of kml.matchAll(placemarkRe)) {
    const knots = Number(match[1]);
    const coordText = match[2]!.trim();
    const ring: [number, number][] = coordText
      .split(/\s+/)
      .map((pair) => {
        const [lon, lat] = pair.split(",").map(Number);
        return [lat!, lon!] as [number, number];
      })
      .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));
    if (ring.length >= 3) {
      rings.push({ knots, ring });
    }
  }
  return rings;
}
