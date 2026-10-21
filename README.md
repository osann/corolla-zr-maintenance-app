# Corolla ZR detailing guide

A personal detailing kit, technique and maintenance tracker for a 2025 Toyota Corolla Hatch Hybrid ZR (Australia), built around the Bowden's Own range. Live at **https://corolla.jhosan.top**.

It covers:
- a wash log with streaks and reminders
- customisable wash routines
- a mechanical maintenance schedule
- product inventory with depletion forecasts
- a kit purchase checklist
- live AUD prices from Australian retailers, with sale and threshold alerts via email or TickTick

## How it fits together

| Part | Tech | Hosted on |
|---|---|---|
| Frontend (`index.html`, `js/`, `styles.css`) | Vanilla JS ES modules, no build step | GitHub Pages |
| API proxy (`cloudflare/`) | Cloudflare Worker on `/api/*` | Cloudflare (pasted manually) |
| Backend (`backend/`) | Node 22, Hono, Drizzle, node-cron | Render |
| Database | Turso (libSQL) | Turso |
| Photos | Cloudflare R2 | Cloudflare |
| Price scrapers | Playwright / fetch | GitHub Actions + a self-hosted runner + Render cron |

The frontend works without the backend. Signing in adds sync across devices, live prices, photos, weather and notifications.

## Running locally

Frontend: serve the repo root over HTTP, e.g. `npx serve .` or `python -m http.server`. It uses ES modules, so opening `index.html` as a file won't work. With the `__BACKEND_URL__` placeholder in `js/config.js` unreplaced, it runs in standalone mode.

Backend:

```bash
cd backend
npm install          # also installs Playwright's Chromium
npm run db:init && npm run seed
npm run dev          # http://localhost:3000, SQLite at backend/db.sqlite
npm run typecheck    # tsc --noEmit
npm test             # Vitest smoke tests
```

Environment variables are listed in [CLAUDE.md](CLAUDE.md#environment-variables).

## Deploying

- **Frontend:** pushing to `main` publishes `index.html`, `js/`, `styles.css` and `CNAME` to GitHub Pages.
- **Backend:** Render deploys from `main`.
- **Worker:** the Cloudflare Worker is updated by hand in the dashboard.

## More

- [CLAUDE.md](CLAUDE.md): architecture, conventions and gotchas.
- [docs/decisions.md](docs/decisions.md): why things are the way they are.
- [SCRAPER-LEARNING.md](SCRAPER-LEARNING.md): retailer scraping lessons.
- [TASKS.md](TASKS.md): backlog.
