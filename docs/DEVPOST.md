# Blindspot: from dashboard to decision

## Inspiration
Dashboards are built by analysts and read by everyone else. Even good ones hide expensive problems: revenue resting on a handful of customers, products sold below cost, a region quietly collapsing. DashAgent showed that an AI "second opinion" can catch these. We wanted to go one step further: **catch it, prove it, price it, and say what to do.**

## The problem
[COMPANY] needs to [CHALLENGE]. *(Fill from the case packet: 2–3 sentences with numbers.)*

## What it does
- **Finds and ranks risks**: concentration (Pareto, HHI), loss-making segments, statistically significant declines (Welch t on monthly totals), discount-margin erosion, outliers, data gaps. Each finding gets a severity, confidence, dollar exposure and next action.
- **Explains with evidence**: an AI analyst answers questions like "Why did revenue decrease?", and every answer shows the tool calls and numbers behind it.
- **Models the fix**: a scenario simulator with explicit, editable formulas and a profit bridge.
- **Recommends actions**: intervention, benefit (labeled hypothetical), effort, risk, evidence.
- **Writes the report**: a one-click executive summary with roadmap, exportable to Markdown/PDF.
- **Audits dashboards**: chart integrity, hierarchy, WCAG contrast and colorblind simulation, plus accessible Tableau palettes.
- **Works where you work**: a Tableau dashboard extension and an MCP server (Claude Desktop, VS Code), or plain CSV upload.

## How we built it
TypeScript monorepo: a deterministic analytics engine; 30 Zod-validated tools (DashAgent's 26 plus 4 business tools) exposed over MCP and REST; a WebSocket bridge (tokens, origin allowlist, request IDs, timeouts, heartbeat, reconnect) linking the MCP server to the Tableau Extensions API; and a React app built with Vite, Tailwind, Recharts and Framer Motion. Claude (Sonnet 5.5 by default, switchable) interprets results; it never invents numbers.

## Challenges
- **Noise vs. signal**: a −29% "decline" turned out to be randomness from concentrated accounts. We added a significance test, so only real declines are flagged.
- **Honest money**: summing overlapping exposures double counts, and revenue benefits aren't profit. We label units and convert at baseline margin.
- **Security**: dataset text is untrusted. It's wrapped and isolated, chat can only call read-only tools, and injection attempts are blocked.

## Accomplishments
51 automated tests, including a real API + WebSocket bridge + MCP stdio integration test. A full demo runs without Tableau or an API key.

## What's next
Verified Tableau Cloud deployment, multi-user workspaces, forecasting, and case-specific playbooks.

## Implementation, cost and timeline
One Node service (~$7–25/month) plus optional Claude usage. Pilot in 2 weeks, team rollout in 1–2 months.

## Built with
typescript · react · vite · tailwind · recharts · framer-motion · node.js · express · websocket · zod · model-context-protocol · anthropic-claude · tableau-extensions-api · tableau-embedding-api · tableau-rest-api · vitest

## Team
*(names)*
