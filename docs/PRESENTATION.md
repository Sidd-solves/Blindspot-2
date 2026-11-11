# 8-minute presentation outline (target 7:40)

> Replace **[COMPANY]** and **[CHALLENGE]** with the assigned case. Swap the synthetic CSV for case data in Settings → Data source (no code change).

| Time | Section | What to say / show |
|---|---|---|
| 0:00–0:45 | **The problem** | [COMPANY] faces [CHALLENGE]. Managers have dashboards, but dashboards show what happened, not what's wrong or what to do. Problems like a few customers carrying the business, products sold at a loss, or one region collapsing hide in plain sight. |
| 0:45–1:45 | **Evidence** | 2–3 numbers from the case. Show why the issue is costly and why it's missed: nobody is paid to audit dashboards every day. |
| 1:45–2:30 | **Solution** | Blindspot: a second opinion for every dashboard. It finds the problem, proves it, prices it, models the fix and writes the board memo. Works inside Tableau or from a CSV. |
| 2:30–5:30 | **Live demo** | Script below. |
| 5:30–6:30 | **Commercial impact** | Use the simulator with case-specific assumptions. State every assumption. Compare cost: about 1 analyst-day per dashboard audit replaced by seconds. |
| 6:30–7:15 | **Feasibility** | Architecture slide (README diagram). Runs on one ~$7–25/month Node host; AI is optional (deterministic mode is free). Rollout in 3 phases: pilot on 1 dashboard (2 weeks), extend to a team (1–2 months), Tableau Cloud deployment (quarter). |
| 7:15–7:40 | **Close** | "Dashboards tell you what happened. Blindspot tells you what's wrong, what it costs, and what to do next." |

## Demo script (3:00)
1. **Overview (0:20).** Risk index ring, KPI count-ups, trend with the shaded last 6 months. "Nine findings ranked by business impact."
2. **Risk Intelligence (0:40).** Click the concentration finding: 62.5% of sales from 5 customers, HHI, Pareto chart. Click *Tables loses money*: margin heatmap shows the red cell. Point at confidence and the evidence grid.
3. **Interactive filter (0:20).** Header filter Region = Central: every page recalculates. Clear it.
4. **AI Analyst (0:40).** Click "Why did revenue decrease?". It answers Central −49.6% with t-statistic and opens the evidence drawer. Click "Try an injection" to show the guardrail block.
5. **Scenario Simulator (0:30).** Pick *Target*, drag the opex slider, watch the profit bridge redraw. Read one formula aloud.
6. **Executive Report (0:30).** Top 3 findings, recommendations with effort and benefit, roadmap; click PDF.

## Backup lines for judges
- "Every number comes from deterministic code; the LLM only explains."
- "The 26 tools follow DashAgent's published design; we added prioritization, scenarios, actions and reports."
- "Trend alerts must pass a significance test, so random noise is not flagged."
