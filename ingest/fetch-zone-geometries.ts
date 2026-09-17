// One-off script: NWS zone boundaries barely ever change, so unlike the rest
// of the pipeline this isn't part of the recurring ingest — run manually
// (`npx tsx ingest/fetch-zone-geometries.ts`) and commit the resulting file.
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { TRIP_SEGMENTS } from "./trip.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, "..", "web", "public", "zones.geojson");
const USER_AGENT = "makani-watch/0.1 (rafal.lukasz.rostkowski@gmail.com)";

interface ZoneFeature {
  type: "Feature";
  id: string;
  properties: { id: string; name: string; island: string };
  geometry: unknown;
}

async function main() {
  const allZones = TRIP_SEGMENTS.flatMap((seg) =>
    seg.zones.map((z) => ({ zone: z, island: seg.island })),
  );

  const features: ZoneFeature[] = [];
  for (const { zone, island } of allZones) {
    const res = await fetch(`https://api.weather.gov/zones/forecast/${zone}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) {
      console.error(`skip ${zone}: HTTP ${res.status}`);
      continue;
    }
    const json = (await res.json()) as {
      geometry: unknown;
      properties: { name: string };
    };
    features.push({
      type: "Feature",
      id: zone,
      properties: { id: zone, name: json.properties.name, island },
      geometry: json.geometry,
    });
    console.log(`fetched ${zone} (${json.properties.name})`);
    // Be polite to a free government API.
    await new Promise((r) => setTimeout(r, 150));
  }

  const collection = { type: "FeatureCollection", features };
  await writeFile(OUT_PATH, JSON.stringify(collection), "utf-8");
  console.log(`wrote ${features.length} zone geometries to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
