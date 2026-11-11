# Deployment

The bridge needs a **persistent WebSocket server**, so Blindspot deploys as one long-running Node service (web + API + bridge). Serverless platforms (Vercel/Netlify functions) cannot hold the bridge connections, so do not put the API there.

## Recommended: one service on Render, Railway or Fly.io
1. Push the repo to GitHub.
2. Create a web service from the repo using the included `Dockerfile` (or build `npm ci && npm run build -w @blindspot/web`, start `npx tsx services/api/src/index.ts`).
3. Set environment variables:
   - `NODE_ENV=production`
   - `BRIDGE_TOKEN` (long random string) and `ADMIN_TOKEN` (long random string)
   - `ALLOWED_ORIGINS=https://<your-service-domain>` (plus your Tableau extension origin)
   - optional: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `TABLEAU_*`
4. Health check path: `/api/health`.

The app is then at `https://<domain>/`, the bridge at `wss://<domain>/bridge`.

## Optional split: static web on Vercel/Netlify
Build `apps/web` and deploy `dist/`. Add a rewrite from `/api/*` to the Node service. The bridge still lives on the Node service.

## Tableau extension in production
- Host `apps/tableau-extension` over HTTPS (Tableau requires HTTPS for non-localhost extensions).
- Change `<source-location><url>` in `blindspot.trex` to that HTTPS URL, and pass `?bridge=wss://<domain>/bridge&token=<BRIDGE_TOKEN>`.
- On Tableau Cloud/Server, an admin must allow the extension's URL.

## Status
- Production mode was smoke-tested locally (static serving, deep links, admin gate, CORS).
- The Dockerfile and a hosted deploy have **not** been run yet.
