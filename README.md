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
