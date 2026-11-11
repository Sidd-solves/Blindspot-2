# Blindspot

**The AI analyst for small businesses. See what your sales data is hiding.**

Live: **https://blindspot-8lr1.onrender.com** · Fact check: [docs/FACT_CHECK.md](docs/FACT_CHECK.md)

Small business owners make big decisions on gut feeling, because analysts and BI tools are built for big companies. Blindspot connects to a **Shopify store** or a **CSV / Excel file** and, in seconds:

- **Cleans** the data: duplicates, returns, fees, orders reversed within 2 days, sales with no customer
- **Finds** what's costing money: customer dependence, loss-making products, returns, lost best customers, products that stopped selling, shrinking orders, seasonality
- **Scans the rest**: each sizeable product and country compared with the business as a whole, year over year, testing weekly revenue share and adjusting for many comparisons
- **Tests ideas**: business hypotheses (built-in or proposed by AI) labeled supported, not supported, small effect or not enough evidence, with the one-sided p-value each verdict was decided on
- **Plans the fix**: what each problem costs, what fixing it could be worth (labeled estimates), a roadmap and a one-page report

Every number comes from deterministic code. The AI (Claude) explains results and suggests ideas; the code checks them.

## Tested on real data
UCI **Online Retail II**: a real UK online gift shop, 1,067,371 sales lines (Dec 2009 – Dec 2011), CC BY 4.0. Blindspot found, among others: a best-selling product down 51% while the shop grew 5%, 42 best customers who stopped ordering (£301K a year), new customers coming back less (49% → 40%), 1,978 orders reversed within 2 days, and 34,335 duplicate lines. **Seven headline numbers were recomputed by independent Python code; all match** ([docs/FACT_CHECK.md](docs/FACT_CHECK.md)). The live demo runs on a 25% customer sample whose trend matches the full data.

## Architecture
```
 apps/web (React, Vite, Tailwind, Framer Motion, Recharts)
   ├─ Showcase site: Home · How it works · Features · Real results
   └─ App: Overview · Data Sources · AI Analyst · Risk · Simulator · Audit · Reports · Settings
          │  REST + SSE, private per-visitor sessions
 services/api (Express) ── Shopify Admin API (client credentials or token), Claude (Sonnet 5.5 default)
          │
 packages/tool-contracts  34 Zod-validated tools, guardrails, session state
 packages/analytics       cleaning, stats, Pareto/HHI, Welch t-tests, driver analysis, anomaly scan,
                          store checks, hypothesis engine, query engine, scenarios, reports
 services/mcp-server      the same 34 tools over MCP (Claude Desktop / VS Code)
 apps/tableau-extension   optional Tableau bridge (beta, unverified in Tableau)
```

## Run it
```bash
npm install
npm run dev     # API on :8787, web on :5173
npm test        # 187 tests: statistics, file reading (incl. real PDFs), analytics, all 34 tools, sessions, API + MCP
```
Add `ANTHROPIC_API_KEY=` to `.env` for Claude answers (optional; without it the analyst answers common questions with real queries). Production: see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Docs
[Feature matrix and limitations](docs/FEATURE_MATRIX.md) · [Fact check](docs/FACT_CHECK.md) · [Deployment](docs/DEPLOYMENT.md) · [Phase plan](docs/PHASE_PLAN.md) · [Devpost draft](docs/DEVPOST.md) · [Presentation](docs/PRESENTATION.md) · [AI disclosure](docs/AI_DISCLOSURE.md)
