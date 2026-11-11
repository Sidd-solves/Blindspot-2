# Deployment

One persistent Node service runs the site, the app and the API. It is live on **Render** (free plan, Ohio) with auto-deploy on every push to `main`: https://blindspot-8lr1.onrender.com

## Render settings
- Runtime: **Docker** (uses the repo `Dockerfile`), region Ohio, instance Free
- Health check path: `/api/health`
- Environment: `NODE_ENV=production`, `BRIDGE_TOKEN` and `ADMIN_TOKEN` (generated), `ANTHROPIC_MODEL=claude-sonnet-5-5`, `ANTHROPIC_API_KEY` (optional)

On boot the server loads the case study and pre-computes the analysis **before** opening the port, so visitors never hit a half-ready server. The heap is capped at 400 MB for the 512 MB plan.

## Why not Vercel
Blindspot keeps each visitor's data in server memory during their session. Serverless functions shut down between requests and would lose it.
