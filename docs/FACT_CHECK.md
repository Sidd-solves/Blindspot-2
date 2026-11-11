# Fact check: Blindspot vs independent recomputation

Every headline number Blindspot reports on the real case study was recomputed by a separate Python script ([scripts/factcheck.py](../scripts/factcheck.py)), written independently of the TypeScript engine with the same definitions. Data: UCI Online Retail II, full dataset (1,067,371 rows, Dec 2009 – Dec 2011). Citation: Chen, D. (2012). Online Retail II [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D (CC BY 4.0).

| Finding | Blindspot | Independent Python | Match |
|---|---|---|---|
| Exact duplicate lines | 34,335 | 34,335 | ✅ |
| Orders reversed within 2 days (removed from sales and returns) | 1,978 (£392,675) | 1,978 (£392,675) | ✅ |
| Genuine returns | £323,751 (1.7% of sales) | £323,751 (1.7%) | ✅ |
| Sales with no customer attached | 13.4% | 13.4% | ✅ |
| Average first order vs repeat order | £413 vs £467 | £413 vs £467 | ✅ |
| Average order, UK vs international | £419 vs £862 | £419 vs £862 | ✅ |
| Regency Cakestand vs whole business (last 90 days vs same 90 days a year earlier) | −50.8% vs +5.3% | −50.8% vs +5.3% | ✅ |

**Definitions.** Sales exclude returns. A cancellation that exactly mirrors a sale (same customer, product, quantity and price) within 2 days is treated as a reversed order, so neither side counts. This matters in this dataset: one mistaken order of 80,995 units (£168K) was cancelled the same day.

**Found by the AI cross-check.** An earlier version counted reversed orders as both sales and returns, and compared revenue including returns in one view but not another. Claude flagged both inconsistencies while answering a question; both were fixed and re-verified here.

To reproduce: download the dataset from UCI, convert it to `data/online_retail_ii.csv`, then run `python3 scripts/factcheck.py`.

The live demo shows a 25% sample of customers: of the four possible slices, the one whose year-over-year trend (+6.2%) is closest to the full data's (+5.3%). Totals are about a quarter of these; percentages and patterns match.
