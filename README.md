# ServerFY backend (Express + MongoDB Atlas)

Standalone API for the contact / server-request form. Deploys to Render.

## Local run

```bash
cd backend
cp .env.example .env      # fill in MONGODB_URI and ADMIN_API_KEY
npm install
npm run dev
```

## Endpoints

| Method | Path                   | Auth              | Purpose                        |
| ------ | ---------------------- | ----------------- | ------------------------------ |
| GET    | `/health`              | public            | Health check for Render        |
| POST   | `/api/server-requests` | public, rate-limited | Store a server request      |
| GET    | `/api/server-requests` | `x-admin-key`     | List latest requests           |

## Security

- Secrets live only in `.env` (git-ignored) or Render's Environment tab — never in code.
- `helmet` security headers, JSON body capped at 100kb.
- CORS restricted to `CORS_ORIGINS`.
- Zod validation + hidden honeypot field, 10 submissions / 10 min per IP.
- Admin listing uses a constant-time comparison of `ADMIN_API_KEY`.

## Deploy to Render

1. Push this repo to GitHub.
2. Render > New > Web Service > pick the repo, Root Directory `backend`.
3. Build `npm install`, Start `npm start`, Health check `/health`.
4. Add env vars: `MONGODB_URI`, `MONGODB_DB`, `CORS_ORIGINS`, `ADMIN_API_KEY`.
5. In MongoDB Atlas > Network Access, allow `0.0.0.0/0` (or Render's static IPs).

## Connect the frontend

Set `VITE_API_URL=https://<your-service>.onrender.com` in the frontend env.

## Anonymous visitor analytics

No signup or login required — the frontend generates a random visitor id and
session id in the browser and batches events here.

- `POST /api/analytics/collect` — public, rate limited (120 req/min/IP).
  Accepts a batch of up to 50 events: `pageview`, `pageleave` (time on page +
  scroll depth), `click`, `scroll`, `session_start`, custom `event`.
  Also stores device type, screen/viewport, language, timezone, referrer,
  entry page, returning-vs-new, user agent and approximate country/city taken
  from proxy geo headers (Cloudflare / Vercel).
- `GET /api/analytics/summary?days=7` — admin only (`x-admin-key`): visitors,
  sessions, pageviews, total time, top pages, referrers, devices, countries,
  top custom events, top clicked elements.
- `GET /api/analytics/visitors/:visitorId` — admin only: full ordered journey
  for one anonymous visitor.

Raw events auto-expire after 180 days (TTL index).

## Admin console (added)

Environment variables:

| Name | Purpose |
| --- | --- |
| `JWT_SECRET` | signs admin login sessions (long random string) |
| `OWNER_EMAIL` / `OWNER_PASSWORD` / `OWNER_NAME` | the first (owner) admin, created automatically on first boot only |

`ADMIN_API_KEY` is no longer used — admin endpoints require `Authorization: Bearer <token>`
obtained from `POST /api/auth/login`.

New endpoints:
- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/change-password`
- `GET|POST /api/auth/admins`, `PATCH|DELETE /api/auth/admins/:id` (permission: `admins`)
- `POST /api/leads` (public popup), `GET /api/leads`, `PATCH /api/leads/:id`, `GET /api/leads/stats?range=day|week|month|year`
- `GET /api/analytics/timeseries?range=day|week|month|year`

MongoDB: two new collections are created automatically — `adminusers` and `leads`.
No manual Atlas changes are needed beyond the existing database user and network access.
