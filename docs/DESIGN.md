# Design decisions

Each choice below has a cost. This page says what we chose, why, and what we gave up.

## 1. The math is separate from the AI
**Choice.** All numbers come from deterministic TypeScript: cleaning, statistics, findings, scenarios and reports. Claude only picks tools, explains their results and proposes ideas.

**Why.** A store owner acts on these numbers. Code gives the same answer every time, runs in seconds, costs nothing per run and can be tested (198 tests, 79% line coverage on the engine and API). A language model gives none of those guarantees for arithmetic.

**Trade-off.** Every new kind of analysis has to be written as code, and the AI can't answer questions that no tool covers. It says so instead of guessing.

## 2. Compare with the same weeks last year
**Choice.** Trends compare the most recent window with the same calendar window a year earlier, not with the window just before it.

**Why.** Small shops are seasonal. November against October always looks like growth, and January against December always looks like a collapse. Year-over-year removes most of that.

**Trade-off.** It needs about 15 months of history. With less, the report says "not enough data" for those checks rather than falling back to a misleading comparison.

## 3. Weeks are the unit of evidence
**Choice.** The anomaly scan tests each segment's share of weekly revenue (one-sided Welch t-test), then corrects across every segment scanned (Benjamini–Hochberg, q < 0.05).

**Why.** Order lines aren't independent: one big order adds many lines, and one customer adds many orders. Treating lines as evidence would make almost anything "significant". Testing *share* of revenue, rather than revenue, separates "this product is falling behind" from "the whole shop had a slow month". Correcting for many tests stops one lucky segment out of 80 from being reported as a problem.

**Trade-off.** Weekly data gives fewer samples, so small or short-lived drops may not reach significance. They are shown as "Possible… (not confirmed)" instead of being hidden or overstated.

## 4. Every finding can be replayed
**Choice.** Each finding stores a drill spec: the values, row type and date windows that produced it. "See the affected rows" re-runs it on the raw data and reconciles it in integer pennies.

**Why.** "Trust me" is the weakest claim an analyst can make. Exact reconciliation means anyone can check any number in one click.

**Trade-off.** Each new check must describe exactly which rows it used, and that description is tested. That's more work per check, by design.

## 5. Labels say how sure we are
**Choice.** Every finding is labeled **measured** (counted directly), **tested** (passed a statistical test, with its p- or q-value) or **rule of thumb** (an accepted heuristic, such as "3+ orders then 90 days silent = lapsed").

**Why.** A count, a test result and a heuristic deserve different amounts of trust. Hiding the difference would make the confident-sounding numbers less believable, not more.

**Trade-off.** The interface shows more words per finding. We kept them short and consistent across every page.

## 6. Money estimates are planning assumptions, never promises
**Choice.** "What fixing it could be worth" uses a visible assumption (for example "assumes 20% recovered"). Overlapping estimates for the same fix are not added together; the largest is shown and the rest are listed.

**Why.** Adding overlapping estimates is the most common way dashboards inflate impact.

**Trade-off.** The headline numbers are smaller and less exciting than they could be.

## 7. A forecast is only shown with its track record
**Choice.** The forecast replays four simple methods (last month, 3-month average, same month last year, last year × recent trend) on past months using only earlier data, chooses among them from past errors only, and shows every past month next to what really happened.

**Why.** A forecast without a track record is a guess with a chart. Choosing the method in hindsight would make the accuracy look better than it is, so the choice itself is replayed.

**Trade-off.** Simple methods can't use outside information (promotions, stock-outs, prices). With fewer than 6 full months of history, no forecast is shown at all, and with under a year, seasonal methods are skipped.

## 8. Read the file the way it is
**Choice.** No template to fill in. The reader scores every column by name (eight languages) and by its values, recognizes six store platforms' exports, unpivots month-per-column crosstabs and rebuilds tables from PDFs. Then it shows exactly how it read the file before showing any result.

**Why.** Owners won't reformat exports. A wrong guess shown openly with a one-click fix beats a silent guess.

**Trade-off.** The reader is the biggest part of the codebase. It has its own tests for 29 unusual file shapes.

## 9. Read-only and private by default
**Choice.** Shopify access asks only for `read_orders`, `read_products` and `read_inventory`. Keys are used for one request and never stored. Each visitor gets a private session, and uploads aren't kept.

**Why.** Owners are handing over their business. Keeping no data at all is the simplest privacy policy to trust.

**Trade-off.** Nothing is remembered between visits, so there's no history and no alerts yet. Weekly alerts are on the roadmap and would need opt-in storage.

## 10. Built to run on a free 512 MB server
**Choice.** The real-data case study is pre-cleaned at build time and stored compactly. Uploads are capped per request, caches are warmed before the port opens, and the server pings itself so the free plan never sleeps.

**Why.** It has to work instantly for anyone who clicks the link, on a budget of zero.

**Trade-off.** The public site analyzes up to 100,000 rows per upload. The engine itself handles a million (`npm run bench`).
