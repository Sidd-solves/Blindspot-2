# Feature matrix

**Done** = implemented and covered by tests or verified live. **Unverified** = built with documented APIs but not run against the real external system.

| Area | Feature | Status |
|---|---|---|
| Site | Showcase site (Home, How it works, Features, Real results), always-dark, animated | Done, checked desktop + phone |
| Data | CSV / Excel upload, Shopify order-export auto-detect | Done |
| Data | Shopify connect (Dev Dashboard client credentials or existing token), read-only | Query verified on a real store; full connect flow **unverified** with real keys |
| Data | Cleaning: duplicates, returns, fees, zero-price, reversed orders (≤2 days), unknown customers | Done, fact-checked |
| Analysis | Store checks: returns, lapsed best customers, retention, stopped products, order value, seasonality | Done |
| Analysis | Driver analysis (what moved revenue, orders × AOV) and anomaly scan, year over year, Welch t | Done |
| Analysis | Concentration (Pareto, HHI), loss-making segments, discount erosion, large-order dependence | Done |
| Analysis | Hypothesis engine: built-in library + AI-proposed ideas, each verified statistically | Done, AI path tested live |
| Analysis | Ask-anything query engine (group / filter / aggregate / time grain) | Done |
| AI | Claude chat grounded in tool results, untrusted-data isolation, guardrails | Done, tested live |
| Output | Business health score, ranked findings, simulator, report with fixed topic checklist + roadmap | Done |
| Platform | Private per-visitor sessions, rate limits, payload caps, admin gate, 0 npm vulnerabilities | Done |
| Platform | 40 tools over REST and MCP | Done, MCP tested with the official client |
| Platform | Live deploy (Render, auto-deploy), warm start | Done |
| Optional | Tableau extension + WebSocket bridge (hidden in the app) | Bridge tested with a simulated extension; **unverified** in Tableau |
| Analysis | Sales forecast: 4 methods replayed on past months, chosen from past errors only, 80% range from real misses | Done, tested (incl. no look-ahead) |
| Analysis | Customer Radar: early warning (validated on past data) and win-back list matching the lost-customer finding to the penny | Done, tested on the real data |
| Analysis | Stock & Cash: unusual sales gaps / possible stock-outs (heuristic gap score on orders, per-product order-ID check, false alarms and misses measured on held-out simulations) and seasonal sales dips | Done, tested |
| Analysis | Prove It: promo test vs the same weeks last year with a placebo check; fact-check builder | Done, tested |
| Output | Proof replay animation, confidence meter, guided tour | Done, checked in the browser |
| Output | Screenshot audit: chart colors read from any image, contrast and color-blind checks, color-blind preview | Done, palette extraction tested |
| Optional | AI vision review of a screenshot (Claude) | Built as an explicit button; not exercised in tests (uses credits) |

**Tests:** `npm test` → 232 passed. **Fact check:** 7/7 match on the full dataset.

## Known limitations
1. The real case study is a public dataset from 2009–2011, not the team's own store; "tested on real business data", not "used by a business".
2. The live demo uses a 25% customer sample (memory limits on the free server); its totals are about a quarter of the full data.
3. The free server is kept awake by pinging itself every 10 minutes; the first visit right after a redeploy can still take ~30–60 s.
4. Simulator rates (churn, conversion, waste, opex) are user-editable assumptions, and recommendation benefits are estimates.
5. Guardrails are pattern-based plus data isolation; not a complete defense.
6. Sessions live in server memory; a restart clears uploaded data.
