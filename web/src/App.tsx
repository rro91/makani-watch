import { useEffect, useState } from "react";
import type { Island, Mode, ThreatLevel, ThreatSnapshot } from "./types";
import MapView from "./MapView";
import IslandTabs from "./IslandTabs";
import { gustColor, outageRisk, precipColor, waveColor, windColor } from "./risk";

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

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}snapshot.json`, { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: ThreatSnapshot) => setSnapshot(data))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

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
          background: LEVEL_BG[snapshot.level],
          color: LEVEL_COLOR[snapshot.level],
        }}
      >
        <span className="num">{snapshot.level}</span>
        <span className="label">{snapshot.levelLabel}</span>
        <span className="rec" style={{ color: "var(--ink)" }}>
          {snapshot.recommendation}
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
          Zakres: {snapshot.scopeLabel}
        </span>
      </div>

      <div className="section">
        <details className="reasons">
          <summary>Dlaczego ten poziom</summary>
          <ul>
            {snapshot.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </details>
      </div>

      <div className="dashboard">
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
          <MapView snapshot={snapshot} />
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

      <div className="dashboard">
        <div className="section span-3">
          <h2>
            Aktywne alerty ({snapshot.alerts.length})
          </h2>
          {snapshot.alerts.length === 0 ? (
            <div className="empty">Brak aktywnych alertów NWS.</div>
          ) : (
            snapshot.alerts.map((a) => (
              <div className="alert-card" key={a.id}>
                <span className="event">{a.event}</span>
                <span className="meta">
                  {a.zones.length} stref · wydano {hst(a.effective)} · pełny czas
                  obowiązywania w treści poniżej
                </span>
                <span className="desc">{a.description}</span>
                {a.instruction && <span className="instruction">{a.instruction}</span>}
                <a href={a.sourceUrl} target="_blank" rel="noreferrer">
                  oryginał NWS →
                </a>
              </div>
            ))
          )}
        </div>

        <div className="section span-3">
          <h2>Cyklony ({snapshot.storms.length})</h2>
          {snapshot.outlookFormation7day != null && (
            <p
              style={{
                margin: "-0.3rem 0 0.7rem",
                fontSize: "0.78rem",
                color: "var(--ink-3)",
                lineHeight: 1.5,
              }}
            >
              Szansa, że w ciągu 7 dni w tym rejonie Pacyfiku uformuje się nowy
              cyklon (wg codziennej prognozy CPHC): {snapshot.outlookFormation7day}%
            </p>
          )}
          {snapshot.storms.length === 0 ? (
            <div className="empty">Brak aktywnych cyklonów w basenie.</div>
          ) : (
            snapshot.storms.map((s) => (
              <div className="alert-card" key={s.id}>
                <span className="event">
                  {s.name} · {s.classification} · {s.intensityKmh ?? "?"} km/h
                </span>
                <span className="meta">
                  {s.distanceKmToTrip != null ? `~${s.distanceKmToTrip} km od trasy` : ""}
                </span>
              </div>
            ))
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
          <span>snapshot obliczony</span>
          <span>{ageLabel(snapshot.computedAt)}</span>
        </div>
      </div>
    </div>
  );
}
