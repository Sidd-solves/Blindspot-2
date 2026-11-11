# Fact check: Blindspot vs independent recomputation

Every headline number Blindspot reports on the real case study was recomputed by a separate Python script ([scripts/factcheck.py](../scripts/factcheck.py)) written independently of the TypeScript engine. Data: UCI Online Retail II, full dataset (1,067,371 rows, Dec 2009 – Dec 2011). Citation: Chen, D. (2012). Online Retail II [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5CG6D (CC BY 4.0).

| Finding | Blindspot | Independent Python | Match |
|---|---|---|---|
| Exact duplicate lines | 34,335 | 34,335 | ✅ |
| Returned / cancelled value | £716,426 (3.6% of sales) | £716,426 (3.6%) | ✅ |
| Sales with no customer attached | 13.1% | 13.1% | ✅ |
| Average first order vs repeat order | £407 vs £478 | £407 vs £478 | ✅ |
| Average order, UK vs international | £428 vs £860 | £428 vs £860 | ✅ |
| Regency Cakestand vs whole business (last 90 days vs same 90 days a year earlier) | −50.9% vs +10.4% | −50.9% vs +10.4% | ✅ |

To reproduce: download the dataset from UCI, convert it to `data/online_retail_ii.csv`, then run `python3 scripts/factcheck.py`.

Note: the live demo site shows a 25% random sample of customers, so its totals are about a quarter of these; percentages and patterns match.
