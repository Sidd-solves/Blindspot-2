# Blindspot: Devpost draft (DataNova 2026, track DN-OP-01 Open Innovation)

**Tagline:** The AI analyst for small businesses. See what your sales data is hiding.
**Demo:** https://blindspot-8lr1.onrender.com · **Code:** https://github.com/Sidd-solves/BlindSpot

## Project overview
Blindspot connects to a Shopify store or a sales spreadsheet and, in seconds, finds what's quietly costing the business money, proves each problem with real statistics, prices it, and turns it into a prioritized plan.

## Problem statement
Small businesses make high-stakes decisions on gut feeling. Big retailers pay data teams to hunt for problems every week; a small shop gets a dashboard that shows what happened, not what's wrong. The expensive problems are quiet: a best customer stops ordering, a product stops selling, returns pile up on a few items, new customers stop coming back. By the time the owner notices in the totals, the money is gone.

## Solution and methodology
1. **Clean:** removes duplicates, separates returns and fees, reverses orders cancelled within 2 days, flags sales with no customer, and reports every change.
2. **Check:** store-specific detectors (returns, lapsed best customers, 90-day repeat rate, products that stopped selling, order value, seasonality, loss-making products, concentration).
3. **Scan:** compares every product, customer and country with the business as a whole, **year over year** (so seasonality isn't mistaken for growth), and reports a change only if it passes a **Welch t-test (t ≤ −2)**.
4. **Prove:** a hypothesis engine tests business ideas, built-in or proposed by Claude, and labels each true, false or not enough evidence.
5. **Act:** a business health score, ranked findings with money at stake, a simulator with editable assumptions, and a one-page report with a roadmap from easy to hard.

All numbers come from deterministic code; the AI explains results and proposes ideas, which the code verifies.

## Technology stack
TypeScript monorepo: React, Vite, Tailwind, Framer Motion, Recharts (web); Node and Express (API); Zod (34 validated tools); Model Context Protocol server; Anthropic Claude (Sonnet 5.5); Shopify Admin GraphQL API; Vitest; Docker on Render. Data: UCI Online Retail II (CC BY 4.0).

## Implementation and demonstration
A live site (showcase pages + the app), private per-visitor sessions, Shopify connection and file upload, and the same 34 tools available to AI assistants over MCP.

## Results and validation
- Tested on **1,067,371 real sales lines** from a UK online retailer: found a best-seller down 51% while the shop grew 5%, 42 best customers who stopped ordering (£301K a year), new-customer 90-day reorder rate falling from 49% to 40%, 1,978 orders reversed within 2 days (£393K), and 34,335 duplicate lines.
- Proved that growth came from existing customers while new-customer revenue fell, and that international orders are twice the size of UK orders (t = 13.1).
- **Fact check:** seven headline numbers recomputed by an independent Python script, all match exactly.
- **AI cross-check:** during testing, Claude flagged two inconsistencies in our own pipeline (returns counted differently in two views, and a mistaken 80,995-unit order inflating both sales and returns). Both were fixed and re-verified.
- 64 automated tests; 0 npm vulnerabilities; full analysis of 1M rows in about 6 seconds.

## Potential impact
Any small online store can get an analyst's view for free in seconds. It runs on one small server (about $7–25/month at scale), and the analysis itself needs no AI spend. Next steps: more connectors (WooCommerce, Square, Stripe), scheduled weekly alerts, and multi-store benchmarks.

## Team contributions
*(Name: role. For example: product direction, design decisions, business analysis, testing, presentation.)*

## Acknowledgements
Data: Chen, D. (2012), Online Retail II, UCI Machine Learning Repository, CC BY 4.0. Built with AI assistance (see AI disclosure).
