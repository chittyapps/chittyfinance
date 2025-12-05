# ChittyFinance

A full‑stack TypeScript app combining an Express API and a React + Vite client. The server serves both API and client on port 5000.

## Quick Start

- Prerequisites:
  - Node.js 18+ (works on Node 20/22/25)
  - A Postgres database (Neon recommended)
- Setup:
  1. `cp .env.example .env`
  2. Set `DATABASE_URL` in `.env` to your Postgres connection string
  3. `npm install`
- Dev:
  - `npm run dev` (API + client on `http://localhost:5000`)
- Build:
  - `npm run build` (client to `dist/public`, server to `dist/system`)
- Run (production):
  - `npm start` (runs `node dist/system/index.js`)

## Environment

Required:
- `DATABASE_URL` — Neon/Postgres connection string

Optional (features degrade gracefully if unset):
- `OPENAI_API_KEY` — Enable AI assistant via OpenAI
- `STRIPE_SECRET_KEY`, `MERCURY_API_KEY`, `WAVE_API_TOKEN` — Integrations
- `GITHUB_TOKEN` — Enable GitHub repository widgets (stars, PRs, issues)

## API Smoke Tests

- `GET /api/session` — Demo user
- `GET /api/financial-summary`
- `GET /api/tasks`, `POST /api/tasks`
- `POST /api/ai-assistant/query` — Body: `{ "query": "..." }`

## Deploy

Cloudflare Workers config is in `deploy/system-wrangler.toml`.

- Routes:
  - `finance.chitty.cc/*` → ChittyFinance (this app)
  - `get.chitty.cc/*` → Registration service (external; not routed here)
  - `connect.chitty.cc/*` → ChittyConnect (external; this app links to it)

- Build: `npm run build` (uses `build:system`)
- Deploy: `npm run deploy`
  - Requires Cloudflare auth (`wrangler login`) and secrets set:
    - `wrangler secret put DATABASE_URL`
    - `wrangler secret put OPENAI_API_KEY` (optional)
    - `wrangler secret put CHITTYCONNECT_API_BASE` (e.g. `https://connect.chitty.cc/api`)
    - `wrangler secret put CHITTYCONNECT_API_TOKEN` (server-to-server auth to ChittyConnect)

## ChittyConnect (Mercury static IP + multi-account)

Server uses ChittyConnect when configured to fetch Mercury data via static egress and supports selecting multiple bank accounts.

- Env:
  - `CHITTYCONNECT_API_BASE`, `CHITTYCONNECT_API_TOKEN`, `CHITTY_CONNECT_URL`
  - `CHITTYCONNECT_KEEPALIVE_MINUTES` (default 50) — background refresh cadence
- Endpoints:
  - `GET /api/mercury/accounts` — list accounts via ChittyConnect
  - `POST /api/mercury/select-accounts` — persist selected account IDs
  - `GET /connect` — redirects to `CHITTY_CONNECT_URL` (default `https://connect.chitty.cc`)
- UI:
  - Settings → Integrations → Mercury
    - “Connect” opens ChittyConnect
    - “Manage accounts” scrolls to account selector
  - Tokens are proactively refreshed in the background when configured

Note: The server bundle targets Node ESM. The Workers config enables `node_compat`, but some Node/Express patterns may not be fully supported on Workers without additional adaptation. For traditional Node deploys, run `npm start` on a VM or container with Postgres access.
