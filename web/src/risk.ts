// Shared risk-coloring for raw numbers (wind, waves, rain) so they read at a
// glance instead of as bare digits. Reuses the same 0-3 palette as the main
// threat level for one consistent visual language across the app.
const LEVEL_VAR = ["--l0", "--l1", "--l2", "--l3"] as const;

function levelFromBreakpoints(value: number, breakpoints: [number, number, number]): 0 | 1 | 2 | 3 {
  if (value < breakpoints[0]) return 0;
  if (value < breakpoints[1]) return 1;
  if (value < breakpoints[2]) return 2;
  return 3;
}

export function windColor(kmh: number): string {
  return `var(${LEVEL_VAR[levelFromBreakpoints(kmh, [20, 40, 63])]})`; // 63 km/h ~= 34kt, tropical-storm force
}

export function gustColor(kmh: number): string {
  return `var(${LEVEL_VAR[levelFromBreakpoints(kmh, [35, 65, 100])]})`;
}

export function waveColor(m: number): string {
  return `var(${LEVEL_VAR[levelFromBreakpoints(m, [1, 1.5, 2.5])]})`;
}

export function precipColor(mm: number): string {
  return `var(${LEVEL_VAR[levelFromBreakpoints(mm, [5, 20, 50])]})`;
}

const OUTAGE_LABELS = ["niskie", "umiarkowane", "wysokie", "bardzo wysokie"] as const;

// A rough estimate, not measured outage data — no Hawaii utility publishes a
// free/public live outage-count API, so this is derived from forecast wind
// gusts (the thing that actually snaps power lines and drops trees on them).
// Lower distance = more red. 1600 km is the same cutoff the rule engine uses
// to bump the threat level, so "green" here really does mean "not a factor".
export function distanceColor(km: number): string {
  const level = 3 - levelFromBreakpoints(km, [800, 1600, 3000]);
  return `var(${LEVEL_VAR[level as 0 | 1 | 2 | 3]})`;
}

export function outageRisk(gustKmh: number): { level: 0 | 1 | 2 | 3; label: string; color: string } {
  const level = levelFromBreakpoints(gustKmh, [40, 70, 110]);
  return { level, label: OUTAGE_LABELS[level], color: `var(${LEVEL_VAR[level]})` };
}
