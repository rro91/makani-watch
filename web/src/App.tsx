import { useEffect, useState } from "react";
import type { Alert, Island, Mode, ThreatLevel, ThreatSnapshot } from "./types";
import MapView from "./MapView";
import BasinMap from "./BasinMap";
import IslandTabs from "./IslandTabs";
import { distanceColor, gustColor, outageRisk, precipColor, waveColor, windColor } from "./risk";
import { fetchLiveAlertsHI } from "./liveAlerts";
import { computeThreatLevel } from "./rules";

interface LiveOverride {
  level: ThreatLevel;
  levelLabel: string;
  recommendation: string;
  scopeLabel: string;
  reasons: string[];
  alerts: Alert[];
  fetchedAt: string;
}

const LEVEL_COLOR: Record<ThreatLevel, string> = {
  0: "var(--l0)",
  1: "var(--l1)",
  2: "var(--l2)",
  3: "var(--l3)",
  4: "var(--l4)",
  5: "var(--l5)",
};

const LEVEL_BG: Record<ThreatLevel, string> = {
  0: "var(--l0-bg)",
  1: "var(--l1-bg)",
  2: "var(--l2-bg)",
  3: "var(--l3-bg)",
  4: "var(--l4-bg)",
  5: "var(--l5-bg)",
};

const MODE_LABEL: Record<Mode, string> = {
  "before-trip": "Przed wyjazdem",
  "on-location": "Na miejscu",
  "outside-hawaii": "Poza Hawajami",
};

function hst(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Pacific/Honolulu",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(iso)) + " HST";
}

// Strip the AFOS/WMO product header and forecaster sign-off from a raw NWS
// text bulletin, keeping the actual forecast prose. Deliberately light-touch
// (not a full parser) — the exact wording of these bulletins shifts as a
// system develops, so we show the whole remaining text rather than trying
// to regex out "just the Hawaii part," which would silently go blank the
// day NHC phrases it differently.
function cleanOutlookText(raw: string): string {
  const lines = raw.split("\n");
  // NWS text products always open with a fixed header block (sequence
  // number, WMO/AWIPS codes) followed by a blank line before the real
  // bulletin — skip past that first blank line rather than trying to match
  // the header codes themselves, which vary.
  const blankIndex = lines.findIndex((l) => l.trim() === "");
  const body = blankIndex >= 0 ? lines.slice(blankIndex + 1) : lines;
  return body.join("\n").replace(/\$\$[\s\S]*$/, "").trim();
}

function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "przed chwilą";
  if (min < 60) return `${min} min temu`;
  const h = Math.round(min / 60);
  return `${h} h temu`;
}

export default function App() {
  const [snapshot, setSnapshot] = useState<ThreatSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forecastIslandSel, setForecastIslandSel] = useState<Island | null>(null);
  const [live, setLive] = useState<LiveOverride | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}snapshot.json`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: ThreatSnapshot) => setSnapshot(data))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  // The committed snapshot only refreshes when GitHub Actions' cron happens
  // to fire (unreliable for sub-hourly schedules — see deploy.yml). Alerts
  // are the most time-critical piece and api.weather.gov is CORS-open, so
  // fetch them fresh on every visit and recompute the level from that,
  // instead of waiting on the snapshot for the thing that matters most.
  useEffect(() => {
    if (!snapshot) return;
    const activeSegment =
      snapshot.tripSegments.find((s) => s.island === snapshot.currentIsland) ?? null;
    fetchLiveAlertsHI()
      .then((alerts) => {
        const result = computeThreatLevel({
          mode: snapshot.mode,
          currentIsland: snapshot.currentIsland,
          activeSegment,
          alerts,
          storms: snapshot.storms,
          outlookFormation7day: snapshot.outlookFormation7day,
        });
        setLive({
          level: result.level,
          levelLabel: result.levelLabel,
          recommendation: result.recommendation,
          scopeLabel: result.scopeLabel,
          reasons: result.reasons,
          alerts: result.relevantAlerts,
          fetchedAt: new Date().toISOString(),
        });
      })
      .catch((err) => setLiveError(err instanceof Error ? err.message : String(err)));
  }, [snapshot]);

  if (error) {
    return (
      <div className="app">
        <div className="error">
          Nie udało się wczytać snapshotu ({error}).<br />
          Uruchom <code>npm run ingest</code> w katalogu głównym.
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="app">
        <div className="loading">Ładowanie…</div>
      </div>
    );
  }

  const activeForecastIsland = forecastIslandSel ?? snapshot.defaultForecastIsland;
  const activeForecast = snapshot.forecastByIsland[activeForecastIsland] ?? [];
  const activeBuoy = snapshot.buoyByIsland[activeForecastIsland] ?? null;

  const displayLevel = live?.level ?? snapshot.level;
  const displayLevelLabel = live?.levelLabel ?? snapshot.levelLabel;
  const displayRecommendation = live?.recommendation ?? snapshot.recommendation;
  const displayScopeLabel = live?.scopeLabel ?? snapshot.scopeLabel;
  const displayReasons = live?.reasons ?? snapshot.reasons;
  const displayAlerts = live?.alerts ?? snapshot.alerts;

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">Makani Watch</span>
        <span className="mode">
          {MODE_LABEL[snapshot.mode]}
          {snapshot.currentIsland ? ` · ${snapshot.currentIsland}` : ""}
        </span>
      </div>

      <div
        className="level-band"
        style={{
          background: LEVEL_BG[displayLevel],
          color: LEVEL_COLOR[displayLevel],
        }}
      >
        <span className="num">{displayLevel}</span>
        <span className="label">{displayLevelLabel}</span>
        <span className="rec" style={{ color: "var(--ink)" }}>
          {displayRecommendation}
        </span>
        <span
          className="scope"
          style={{
            fontFamily: "IBM Plex Mono, monospace",
            fontSize: "0.72rem",
            letterSpacing: "0.02em",
            color: "var(--ink-2)",
          }}
        >
          Zakres: {displayScopeLabel}
        </span>
        <span
          className="scope"
          style={{
            fontFamily: "IBM Plex Mono, monospace",
            fontSize: "0.72rem",
            letterSpacing: "0.02em",
            color: "var(--ink-2)",
          }}
        >
          {live
            ? `Ostatnia aktualizacja: ${ageLabel(live.fetchedAt)} (alerty na żywo)`
            : liveError
              ? `Ostatnia aktualizacja: ${ageLabel(snapshot.computedAt)} (dane na żywo niedostępne — ${liveError})`
              : `Ostatnia aktualizacja: ${ageLabel(snapshot.computedAt)}`}
        </span>
      </div>

      {snapshot.aiBriefing && (
        <div className="section">
          <div className="ai-briefing">
            <span className="ai-briefing-label">Podsumowanie AI</span>
            <p>{snapshot.aiBriefing}</p>
            <span className="ai-briefing-note">
              Wygenerowane automatycznie z tych samych danych, które widzisz niżej —
              nie ustala poziomu zagrożenia, tylko go tłumaczy.
            </span>
          </div>
        </div>
      )}

      <div className="section">
        <details className="reasons">
          <summary>Dlaczego ten poziom</summary>
          <ul>
            {displayReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </details>
      </div>

      <div className="dashboard">
        <div className="section span-6">
          <h2>Aktywne alerty ({displayAlerts.length})</h2>
          {displayAlerts.length === 0 ? (
            <div className="empty">Brak aktywnych alertów NWS.</div>
          ) : (
            <div className="alert-list">
              {displayAlerts.map((a) => (
                <details className="alert-card alert-collapsible" key={a.id}>
                  <summary>
                    <span className="summary-text">
                      <span className="event">{a.event}</span>
                      <span className="meta">
                        {a.zones.length} stref · wydano {hst(a.effective)}
                      </span>
                    </span>
                  </summary>
                  <div className="alert-body">
                    <span className="desc">{a.description}</span>
                    {a.instruction && <span className="instruction">{a.instruction}</span>}
                    <a href={a.sourceUrl} target="_blank" rel="noreferrer">
                      oryginał NWS →
                    </a>
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>

        <div className="section span-2">
          <h2>Twoja trasa</h2>
            <div className="trip-strip">
              {snapshot.tripSegments.map((seg) => (
                <div
                  key={seg.island}
                  className={
                    "trip-seg" + (seg.island === snapshot.currentIsland ? " active" : "")
                  }
                >
                  <span className="island">{seg.islandLabel}</span>
                  <span className="dates">
                    {seg.start.slice(5).replace("-", ".")}–{seg.end.slice(5).replace("-", ".")}
                  </span>
                </div>
              ))}
            </div>
          </div>

        <div className="section span-4">
          <h2>Mapa stref</h2>
          <MapView snapshot={snapshot} alerts={displayAlerts} />
        </div>

        <div className="section span-6">
          <h2>Cyklony ({snapshot.storms.length})</h2>
          {snapshot.outlookText && (
            <details
              className="alert-card alert-collapsible outlook-callout"
              open={snapshot.outlookFormation7day != null && snapshot.outlookFormation7day >= 40}
              style={{ marginBottom: "0.9rem" }}
            >
              <summary>
                <span className="summary-text">
                  <span className="event">
                    Prognoza formowania CPHC
                    {snapshot.outlookFormation7day != null &&
                      ` — ${snapshot.outlookFormation7day}% w 7 dni`}
                  </span>
                  <span className="meta">
                    Systemy bez własnej nazwy i pozycji nie pojawiają się na mapie
                    poniżej — kliknij, żeby przeczytać pełny tekst
                  </span>
                </span>
              </summary>
              <div className="alert-body">
                <span className="desc" style={{ whiteSpace: "pre-line" }}>
                  {cleanOutlookText(snapshot.outlookText)}
                </span>
              </div>
            </details>
          )}
          {snapshot.storms.length === 0 ? (
            <div className="empty">Brak aktywnych cyklonów na Pacyfiku Wschodnim/Centralnym.</div>
          ) : (
            <div className="storm-grid">
              {[...snapshot.storms]
                .sort((a, b) => (a.distanceKmToTrip ?? Infinity) - (b.distanceKmToTrip ?? Infinity))
                .map((s) => (
                  <div className="alert-card" key={s.id}>
                    <span className="event">
                      {s.name} · {s.classificationLabel}
                      {s.category != null ? ` (kategoria ${s.category})` : ""} ·{" "}
                      {s.intensityKmh ?? "?"} km/h wiatru
                    </span>
                    <span className="meta">
                      {s.distanceKmToTrip != null ? (
                        <>
                          <b style={{ color: distanceColor(s.distanceKmToTrip) }}>
                            ~{s.distanceKmToTrip.toLocaleString("pl-PL")} km
                          </b>{" "}
                          od Waszej trasy
                          {s.distanceKmToTrip > 1600 && " — za daleko, by bezpośrednio zagrażać"}
                        </>
                      ) : (
                        "odległość nieznana"
                      )}
                    </span>
                    {s.publicAdvisoryUrl && (
                      <a href={s.publicAdvisoryUrl} target="_blank" rel="noreferrer">
                        oficjalny komunikat NHC →
                      </a>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="section span-6">
          <h2>Mapa basenu — Hawaje i cyklony</h2>
          <div className="legend">
            <span><i style={{ background: "var(--l1)" }} /> wiatr 34+ kt</span>
            <span><i style={{ background: "var(--l2)" }} /> wiatr 50+ kt</span>
            <span><i style={{ background: "var(--l3)" }} /> wiatr huraganowy 64+ kt</span>
            {snapshot.aiUnnamedSystem && (
              <span><i style={{ background: "var(--l5)" }} /> pozycja AI (przybliżona)</span>
            )}
          </div>
          <BasinMap
            storms={snapshot.storms}
            tripSegments={snapshot.tripSegments}
            aiUnnamedSystem={snapshot.aiUnnamedSystem}
          />
        </div>

        <div className="section span-6">
          <h2>Prognoza 7 dni</h2>
            <IslandTabs
              segments={snapshot.tripSegments}
              selected={activeForecastIsland}
              onSelect={setForecastIslandSel}
            />
            <div className="legend">
              <span><i style={{ background: "var(--l0)" }} /> spokojnie</span>
              <span><i style={{ background: "var(--l1)" }} /> umiarkowanie</span>
              <span><i style={{ background: "var(--l2)" }} /> mocno</span>
              <span><i style={{ background: "var(--l3)" }} /> niebezpiecznie</span>
            </div>
            {activeForecast.length === 0 ? (
              <div className="empty">Brak danych prognozy.</div>
            ) : (
              <div className="forecast-list">
                {activeForecast.map((d) => (
                  <div className="forecast-row" key={d.date}>
                    <span className="day">
                      {new Intl.DateTimeFormat("pl-PL", { weekday: "short" }).format(
                        new Date(d.date + "T12:00:00Z"),
                      )}
                    </span>
                    <span className="stats">
                      wiatr{" "}
                      <b style={{ color: d.windMaxKmh != null ? windColor(d.windMaxKmh) : undefined }}>
                        {d.windMaxKmh ?? "?"} km/h
                      </b>{" "}
                      (porywy{" "}
                      <b style={{ color: d.windGustMaxKmh != null ? gustColor(d.windGustMaxKmh) : undefined }}>
                        {d.windGustMaxKmh ?? "?"}
                      </b>
                      ) · opady{" "}
                      <b style={{ color: d.precipMm != null ? precipColor(d.precipMm) : undefined }}>
                        {d.precipMm ?? 0} mm
                      </b>{" "}
                      · fala{" "}
                      <b style={{ color: d.waveHeightMaxM != null ? waveColor(d.waveHeightMaxM) : undefined }}>
                        {d.waveHeightMaxM != null ? `${d.waveHeightMaxM.toFixed(1)} m` : "?"}
                      </b>
                    </span>
                    <span className="temp">
                      {d.tempMaxC != null ? Math.round(d.tempMaxC) : "?"}° /{" "}
                      {d.tempMinC != null ? Math.round(d.tempMinC) : "?"}°
                      {d.cloudCoverPct != null && (
                        <>
                          {" "}
                          <span style={{ color: "var(--ink-3)" }}>
                            · zachm. {Math.round(d.cloudCoverPct)}%
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
        </div>

        {(() => {
          const todayGust = activeForecast[0]?.windGustMaxKmh;
          const segment = snapshot.tripSegments.find(
            (s) => s.island === activeForecastIsland,
          );
          if (todayGust == null || !segment) return null;
          const risk = outageRisk(todayGust);
          return (
            <div className="section span-3">
              <h2>Ryzyko przerw w prądzie</h2>
                <div className="buoy-card" style={{ borderLeftColor: risk.color }}>
                  <span className="label" style={{ color: risk.color }}>
                    {risk.label} ({todayGust} km/h porywów dziś)
                  </span>
                  <span className="stats" style={{ color: "var(--ink-2)" }}>
                    Szacunek na podstawie prognozowanych porywów wiatru — Hawajskie
                    firmy energetyczne nie publikują publicznych danych o awariach
                    na żywo. Silne porywy zrywają linie i przewracają drzewa na
                    przewody (tak straciła prąd 92% Kauai przy Lowell).
                  </span>
                  <a
                    href={segment.outageMapUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: "0.72rem", color: "var(--accent)" }}
                  >
                    oficjalna mapa awarii ({segment.islandLabel}) →
                  </a>
                </div>
              </div>
            );
          })()}

          <div className="section span-3">
            <h2>Stan oceanu — boja NDBC</h2>
            {activeBuoy ? (
              <div className="buoy-card">
                <span className="label">{activeBuoy.stationLabel}</span>
                <span className="stats">
                  Fale:{" "}
                  <b style={{ color: activeBuoy.seasM != null ? waveColor(activeBuoy.seasM) : undefined }}>
                    {activeBuoy.seasM ?? "?"} m
                  </b>{" "}
                  · okres {activeBuoy.peakPeriodSec ?? "?"} s · temp. wody{" "}
                  {activeBuoy.waterTempC ?? "?"}°C
                </span>
                <span className="meta" style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: "0.7rem", color: "var(--ink-3)" }}>
                  pomiar {ageLabel(activeBuoy.observedAt ?? snapshot.computedAt)}
                </span>
              </div>
            ) : (
              <div className="empty">Brak danych z boi.</div>
            )}
          </div>
      </div>

      <div className="sources">
        {snapshot.sources.map((s) => (
          <div className="source-row" key={s.source}>
            <span>
              <span
                className="dot"
                style={{ background: s.ok ? "var(--l0)" : "var(--l3)" }}
              />
              {s.source}
            </span>
            <span>{s.ok ? ageLabel(s.fetchedAt) : `błąd: ${s.error}`}</span>
          </div>
        ))}
        <div className="source-row">
          <span>snapshot obliczony (serwer, co kilka godzin)</span>
          <span>{ageLabel(snapshot.computedAt)}</span>
        </div>
        <div className="source-row">
          <span>
            <span
              className="dot"
              style={{ background: live ? "var(--l0)" : "var(--l3)" }}
            />
            alerty NWS (na żywo, przy otwarciu)
          </span>
          <span>
            {live ? ageLabel(live.fetchedAt) : liveError ? `błąd: ${liveError}` : "ładowanie…"}
          </span>
        </div>
      </div>
    </div>
  );
}
