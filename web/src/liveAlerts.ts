import type { Alert } from "./types";

// api.weather.gov is CORS-open (verified: access-control-allow-origin: *),
// so the browser can fetch this directly — no server round-trip needed, and
// no need to wait for the (unreliable, see App.tsx) GitHub Actions cron.
export async function fetchLiveAlertsHI(): Promise<Alert[]> {
  const res = await fetch("https://api.weather.gov/alerts/active?area=HI", {
    headers: { Accept: "application/geo+json" },
  });
  if (!res.ok) {
    throw new Error(`api.weather.gov alerts: HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    features: Array<{ properties: Record<string, unknown> }>;
  };

  return json.features.map((f) => {
    const p = f.properties as {
      id: string;
      event: string;
      severity: string;
      urgency: string;
      certainty: string;
      headline: string | null;
      description: string | null;
      instruction: string | null;
      areaDesc: string;
      effective: string | null;
      expires: string | null;
      senderName: string;
      geocode?: { UGC?: string[] };
    };
    return {
      id: p.id,
      event: p.event,
      severity: p.severity,
      urgency: p.urgency,
      certainty: p.certainty,
      headline: p.headline ?? p.event,
      description: p.description ?? "",
      instruction: p.instruction,
      areaDesc: p.areaDesc,
      zones: (p.geocode?.UGC ?? []).filter((z) => z.startsWith("HIZ")),
      effective: p.effective,
      expires: p.expires,
      senderName: p.senderName,
      sourceUrl: `https://api.weather.gov/alerts/${encodeURIComponent(p.id)}`,
    } satisfies Alert;
  });
}
