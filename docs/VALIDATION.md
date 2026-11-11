# Validating one finding on a real merchant's data

The finding: **"10 of your best customers stopped ordering (£93,531 a year)"**, the top money finding BlindSpot reports on the bundled case study.

**Data.** [UCI Online Retail II](https://doi.org/10.24432/C5CG6D) (CC BY 4.0): real transactions of a UK online gift retailer, Dec 2009 to Dec 2011. The app ships a fixed 25% sample of customers (all of their orders) so it fits a free 512 MB server. Below are results on that sample, then on the full file. This is public historical data; the retailer did not use BlindSpot.

**Independent check.** [`scripts/validate_lapsed.py`](../scripts/validate_lapsed.py) is separate Python code that shares nothing with the TypeScript engine. It applies the same published definitions:
- cleaning as in `scripts/factcheck.py`;
- best customers are the top 10% by sales (at least 10) in the year before the last 90 days;
- "stopped ordering" means 3+ orders that year and none in the last 90 days.

```bash
python3 scripts/validate_lapsed.py                            # shipped sample
python3 scripts/validate_lapsed.py data/online_retail_ii.csv  # full file
```

## 1. Which customers, which period, what amount

- **Observation period:** spending from 11 Sep 2010 to 10 Sep 2011. "Quiet" means no order from 11 Sep 2011 to the last sale on 9 Dec 2011.
- **Result:** the Python script finds the same 10 customer IDs as the app and **£93,531.25**, matching to the penny. The app's Source Data replay of the exact rows gives the same figure.

| Customer | Orders in the year | Usual gap | Last order | Silent at data end | Spend in the year |
|---|---|---|---|---|---|
| 15749 | 3 | 97 days | 18 Apr 2011 | 235 days | £37,994.90 |
| 16180 | 8 | 24 days | 31 Aug 2011 | 100 days | £10,254.18 |
| 13027 | 9 | 33 days | 18 Aug 2011 | 113 days | £9,912.00 |
| 17504 | 13 | 21 days | 17 May 2011 | 206 days | £7,096.33 |
| 18260 | 15 | 16 days | 20 Jun 2011 | 172 days | £5,976.30 |
| 12643 | 9 | 38 days | 3 Aug 2011 | 128 days | £5,545.02 |
| 14016 | 5 | 54 days | 1 Jul 2011 | 161 days | £5,333.19 |
| 14828 | 6 | 52 days | 27 May 2011 | 196 days | £4,028.82 |
| 14105 | 3 | 100 days | 14 Apr 2011 | 239 days | £3,898.48 |
| 14461 | 6 | 69 days | 14 Jul 2011 | 148 days | £3,492.03 |

Eight of the ten usually reordered every 2–10 weeks and have now been silent for 2–11 times their usual gap. Two (15749 and 14105) placed only 3 orders about 100 days apart, so their silence (about 2.4 gaps) says less. 15749 alone is 41% of the money.

## 2. Does "went quiet" mean anything? Replayed on the merchant's own past

The identical rule was applied at two earlier dates using only data before each date. The script then checked what flagged customers actually did over the next 180 days, compared with the other best customers who were still ordering.

| As of | Data | Flagged | Stayed away 180 days | Other best regulars stayed away | One-sided z-test | Next-half-year spending pace: flagged vs others |
|---|---|---|---|---|---|---|
| 10 Mar 2011 | sample | 25 | 32% | 8% | p = 0.0008 | 56% vs 74% |
| 10 Jun 2011 | sample | 14 | 36% | 3% | p = 0.00001 | 48% vs 112% |
| 10 Mar 2011 | full file | 92 | 36% | 6% | p < 10⁻¹³ | 36% vs 82% |
| 10 Jun 2011 | full file | 63 | 35% | 3% | p < 10⁻¹⁷ | 42% vs 114% |

Spending pace is spending in the next 180 days divided by half of the customer's own prior-year spending. On the full file, today's rule flags 42 customers (£300,597).

**What this supports.** A flagged top customer was 4–12 times as likely as other top customers to stay away for the next half-year. Flagged customers who do return spend at about half their previous pace.

**What it does not support.** Most flagged customers (about two in three) did come back. So the list is "worth contacting first", not "lost". The £93,531 is their past year's spending, not a forecast of lost revenue.

## 3. What action follows

Contact these 10 accounts first, starting with the largest. BlindSpot's Customer Radar drafts a message per customer and exports the list. Nothing is sent from BlindSpot. Re-run after 30–60 days to see who reordered.

## 4. What remains unknown

- **Why they stopped.** The sales file can't separate a lost customer from one who closed, switched supplier, was merged into another account, or buys seasonally. Many accounts in this shop are wholesalers.
- **Merchant confirmation: not obtained.** This is a public dataset, and the retailer can't be contacted. The confirmation still needed is someone who knows the business checking whether these accounts normally reorder and are worth contacting. Until a merchant does that on their own export, this stays a historically validated rule on one real shop, not a confirmed business outcome.
- **Recovery.** No money has been recovered, and none is claimed.
