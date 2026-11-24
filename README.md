# Makani Watch

Hawaii weather/hazard watch. A TypeScript ingest pipeline builds a data snapshot that a Vite web app displays.

## Structure

- `ingest/` – data ingestion (sources, rules, trip logic); writes `data/snapshot.json`
- `web/` – Vite front-end
- `data/` – generated snapshot
- `plan.html` – project plan

## Usage

```sh
npm install
npm run ingest      # build data/snapshot.json
npm run typecheck

cd web
npm install
npm run dev
```

## Status: zakończony (listopad 2026)

Projekt służył do podróży na Hawaje (2–12.10.2026) i został zamknięty.
Strona https://rro91.github.io/makani-watch/ zostaje jako archiwum ostatnich danych —
nic się już automatycznie nie odświeża i nie korzysta z AI.
Żeby wznowić monitoring, przywróć harmonogram i krok `ingest` w
`.github/workflows/deploy.yml` (wersja z commita `b8918ce`).
