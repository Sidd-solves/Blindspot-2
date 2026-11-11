# Feature completion matrix

Legend: **Done** = implemented and covered by automated tests or verified in a browser. **Unverified** = implemented with documented APIs but not run against the real external system. **Partial** = works with stated limits.

## 26 reference tools (MCP + REST)
| # | Tool | Status | Evidence |
|---|---|---|---|
| 1 | analyze-dashboard-smart | Done | ranks planted problems; test 1 |
| 2 | full-data-exploration | Done | roles, correlations, segment spreads; test 2 |
| 3 | profile-data | Done | test 3 |
| 4 | get-worksheet-data | Done via bridge, **Unverified in Tableau** | relayed over real WebSocket to a simulated extension (integration test) |
| 5 | get-analysis-strategy | Done | test 5 |
| 6 | get-semantic-metadata | Done (descriptions labeled *inferred*) | test 6 |
| 7 | build-dashboard | Done | test 7 |
| 8 | render-visualization | Done (rejects invalid fields) | test 8 |
| 9 | transform-to-story | Done | test 9 |
| 10 | confirm-chart-fields | Done | test 10 |
| 11 | toggle-tooltips | Done (session state) | test 11 |
| 12 | analyze-design | Done; vision part needs an API key + real image | test 12 |
| 13 | analyze-iron-viz-style | Done (heuristic, not official scoring) | test 13 |
| 14 | analyze-color-harmony | Done (WCAG contrast + CVD simulation) | test 14 |
| 15 | generate-tableau-palette | Done (Preferences.tps XML) | test 15 |
| 16 | suggest-annotations | Done | test 16 |
| 17 | apply-filter | Done (session); Tableau target **Unverified** | test 17 |
| 18 | set-parameter | Done via bridge, **Unverified in Tableau** | test 18 |
| 19 | get-dashboard-screenshot | Upload path Done; Tableau REST path **Unverified** (no credentials) | test 19 |
| 20 | interpret-concentration | Done (Pareto, HHI) | test 20 |
| 21 | interpret-segments | Done (margin, trend, Welch t) | test 21 |
| 22 | agentic-analyst | Done (measured token meter) | test 22 |
| 23 | generate-documentation | Done (Markdown) | test 23 |
| 24 | check-connection | Done | test 24 |
| 25 | clear-canvas | Done | test 25 |
| 26 | render-component | Done (strict declarative specs, HTML stripped) | test 26 |

## Blindspot additions
| Feature | Status |
|---|---|
| A. Risk prioritization (severity, confidence, metric, $ exposure, next action) | Done |
| B. Financial scenario simulator (explicit, editable formulas) | Done |
| C. Action recommendation engine (benefit labeled hypothetical + revenue/profit kind) | Done |
| D. Executive summary + Markdown/PDF export | Done (PDF via browser print) |
| E. AI analyst | Done in deterministic mode; Claude mode implemented, **not run** (no API key provided) |
| F. Dashboard quality auditor | Done; vision needs a key |

## Platform
| Component | Status |
|---|---|
| Analytics engine | Done, 8 unit tests |
| MCP server (stdio, 30 tools) | Done, tested with the official MCP client |
| WebSocket bridge (token, origin allowlist, request IDs, timeouts, heartbeat, reconnect, size limit) | Done, integration-tested |
| REST API (rate limits, payload caps, admin gate, secret redaction) | Done |
| Web app, 8 pages, dark/light | Done, checked in a browser (text and interaction checks; see limitations) |
| Tableau extension (.trex) | Written, **Unverified** |
| Deployment | Production mode smoke-tested locally; **not deployed** |

## Test results (last run)
`npm test` → 3 files, **51 passed, 0 failed** (analytics 8, tools + guardrails 35, API/bridge/MCP integration 8).

## Known limitations
1. **No real Tableau run yet.** Needs Tableau Desktop/Cloud and a workbook. The summary-data path returns aggregated data, as the Extensions API defines.
2. **Claude mode untested.** No `ANTHROPIC_API_KEY` was available; deterministic mode answers all four demo questions with real numbers.
3. **Single session.** One shared in-memory dataset per server; fine for a demo, not multi-tenant.
4. **Sample data is synthetic** and labeled everywhere. The competition case packet was not available, so the business story must be re-pointed at the assigned company.
5. **Scenario rates are assumptions** (churn rate, conversion, waste, opex share); the UI lets the user edit them.
6. **Guardrails are pattern-based.** They block common injection phrasing and keep data in untrusted tags, but are not a complete defense.
7. Recommendation recovery rates (e.g. 60% of a loss) are stated heuristics, not measured outcomes.
8. The web bundle is ~1 MB (charts + motion); code-splitting not done.
