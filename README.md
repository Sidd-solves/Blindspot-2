# Blindspot

**The AI analyst for small businesses. See what your sales data is hiding.**

Small business owners make big decisions on gut feeling, because analysts and BI tools are built for big companies. Blindspot connects to a **Shopify store** or a **CSV/Excel file** and:

- **Finds** hidden risks: customer concentration, loss-making products, discount erosion, statistically significant declines, outliers, data gaps
- **Proves** each one with real numbers (Pareto/HHI, Welch t-tests, correlations), never guesses
- **Prices** what each problem costs and **simulates** what fixing it is worth
- **Tells** you what to do first, in plain English, with an exportable executive report

Every number comes from deterministic code. The AI (Claude, optional) only explains. Inspired by the publicly documented architecture of DashAgent (Tableau Hackathon 2025 grand prize); all code here is written independently.

## Architecture
```
 Tableau dashboard                         Claude Desktop / VS Code / any MCP client
 └─ Blindspot extension (.trex)            └─ services/mcp-server (stdio, 30 tools)
        │  WebSocket (token + origin checks,          │  BridgeClient (reconnect, heartbeat)
        │  request IDs, timeouts, heartbeat)          │
        └──────────────► services/api ◄───────────────┘
                         ├─ /bridge  BridgeHub (relays MCP requests to the extension)
                         ├─ /api     REST: tools, chat, dataset, events (SSE)
                         └─ serves apps/web (React) in production
                                 │
                 packages/tool-contracts  26 reference tools + 4 Blindspot tools, Zod in/out, guardrails
                 packages/analytics       deterministic engine: stats, Pareto/HHI, segments + Welch t,
                                          findings, scenarios, recommendations, audit, color science, reports
```

## Quick start

```bash
npm install
npm run dev          # API on :8787 (+ bridge ws://127.0.0.1:8787/bridge), web on :5173
```
Open http://127.0.0.1:5173. It loads a **clearly labeled synthetic dataset** with planted problems so every feature can be demoed without Tableau.

```bash
npm test             # 51 tests: analytics, all 30 tools, guardrails, real API + bridge + MCP stdio
npm run mcp          # MCP server over stdio (add to Claude Desktop / VS Code)
```

### Use with Claude Desktop (MCP)
```json
{ "mcpServers": { "blindspot": { "command": "npx", "args": ["tsx", "/ABSOLUTE/PATH/blindspot/services/mcp-server/src/index.ts"], "env": { "BRIDGE_URL": "ws://127.0.0.1:8787/bridge" } } } }
```

### Connect Tableau
1. `npm run dev` (API + bridge) and `npm run dev -w @blindspot/tableau-extension` (extension on :8765).
2. Tableau Desktop → dashboard → drag an **Extension** object → *Access Local Extensions* → `apps/tableau-extension/public/blindspot.trex`.
3. In Blindspot → Tableau Connection → load a worksheet. Filters and parameter changes stream back live.

If `BRIDGE_TOKEN` is set, open the extension with `?token=…` (edit the URL in the .trex).

## What is real vs. not yet verified
See [docs/FEATURE_MATRIX.md](docs/FEATURE_MATRIX.md). Short version: the analytics engine, all 30 tools, the API, bridge relay, MCP server, guardrails and web app are implemented and tested. **The Tableau extension has not been run against a real Tableau workbook yet**; it uses only documented Extensions API calls, and the bridge path is tested end to end with a simulated extension.

## Docs
- [Phase plan](docs/PHASE_PLAN.md) · [Feature matrix + limitations](docs/FEATURE_MATRIX.md) · [Deployment](docs/DEPLOYMENT.md)
- [8-minute presentation + demo script](docs/PRESENTATION.md) · [Devpost draft](docs/DEVPOST.md) · [AI-use disclosure](docs/AI_DISCLOSURE.md)
