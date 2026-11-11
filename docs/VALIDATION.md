# Validating one finding on a real merchant's data

The finding: **"10 of your best customers stopped ordering (£93,531 a year)"**, the top money finding BlindSpot reports on the bundled case study.

## Data, and how to reproduce every number

- **Source:** [UCI Online Retail II](https://doi.org/10.24432/C5CG6D) (Chen, 2012, CC BY 4.0). These are real transactions of a UK online gift retailer, Dec 2009 to Dec 2011. It is public historical data; the retailer did not use BlindSpot.
- **The sample the app ships** is committed raw: [`validation/uk-gift-shop-sample.csv.gz`](../validation/uk-gift-shop-sample.csv.gz), 273,697 rows, SHA-256 `2d60795a58f5128ef8b8c541ba2075593d806d26f0f373bb0a3f2efacc18c2eb`.
  - It holds a fixed 25% of customers with all their orders: those where crc32(customer ID) mod 4 = 2. It also holds rows without a customer ID where crc32(invoice) mod 4 = 0.
  - [`scripts/build_sample.py`](../scripts/build_sample.py) rebuilds it byte for byte from the full UCI file. That file is both Excel sheets exported in order to CSV, 1,067,371 rows.
  - The app's cleaned copy (`services/api/data/uk-gift-shop.clean.json.gz`) is built from this file by `scripts/build-case-study.ts`.

```bash
python3 scripts/validate_lapsed.py                            # committed raw sample; checksum verified first
python3 scripts/validate_lapsed.py --app-clean                # the app's own cleaned records, as a cross-check
python3 scripts/validate_lapsed.py data/online_retail_ii.csv  # full UCI file (download it from the DOI above)
npx vitest run tests/validation.test.ts                       # the app's engine gives the same numbers
```

**Independent check.** [`scripts/validate_lapsed.py`](../scripts/validate_lapsed.py) is separate Python code that shares nothing with the TypeScript engine. It uses the same published definitions:
- cleaning as in `scripts/factcheck.py`;
- rows without a customer ID never count as a customer;
- best customers are the top 10% by sales (at least 10) in the year before the last 90 days;
- "stopped ordering" means 3+ orders that year and none in the last 90 days.

Cleaning the raw sample independently and reading the app's cleaned records give the **same 9,214 orders** and identical results below.

## 1. Which customers, which period, what amount

- **Observation period:** spending from 11 Sep 2010 to 10 Sep 2011. "Quiet" means no order from 11 Sep 2011 to the last sale on 9 Dec 2011.
- **Result:** the Python script and the app's engine both give the same 10 customer IDs and **£93,531.25**, matching to the penny. The app's Source Data replay of the exact rows, and its CSV download, give the same figure.

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

**£93,531.25 is these customers' spending in the past year, not demonstrated lost revenue.**

## 2. Does "went quiet" mean anything? Replayed on the merchant's own past

The identical rule was applied at two earlier dates using only data before each date. The script then checked what flagged customers did over the next 180 days, compared with the other best customers who were still ordering. The test is a one-sided Fisher exact test, because some groups are small.

| As of | Data | Flagged | Flagged who stayed away | Other best regulars who stayed away | Fisher exact p |
|---|---|---|---|---|---|
| 10 Mar 2011 | sample | 25 | 8 (32%) | 6 of 80 (8%) | 0.004 |
| 10 Jun 2011 | sample | 14 | 5 (36%) | 3 of 90 (3%) | 0.001 |
| 10 Mar 2011 | full file | 92 | 33 (36%) | 19 of 319 (6%) | < 10⁻¹¹ |
| 10 Jun 2011 | full file | 63 | 22 (35%) | 11 of 353 (3%) | < 10⁻¹¹ |

The two replay dates are three months apart, so their follow-up windows overlap. They are two looks at one shop, not independent replications. The full file contains the sample's customers.

**Spending in the next 180 days**, divided by half of the same customers' prior-year spending:

| As of | Data | Whole flagged group (non-returners count as £0) | Others | Only flagged customers who came back | Others who came back |
|---|---|---|---|---|---|
| 10 Mar 2011 | sample | 56% | 74% | 90% | 77% |
| 10 Jun 2011 | sample | 48% | 112% | 77% | 114% |
| 10 Mar 2011 | full file | 36% | 82% | 72% | 85% |
| 10 Jun 2011 | full file | 42% | 114% | 87% | 115% |

**What this supports.** Flagged top customers stayed away for the next half-year much more often than other top customers: about a third, against 3–8%. The flagged group's combined spending pace was lower, including the customers who did not return.

**What it does not support.**
- Customers who came back did not consistently spend less. Their pace ranged from 72% to 90%, sometimes above the comparison group.
- Most flagged customers (about two in three) did come back. So this is a list worth contacting first, not a list of lost customers.

## 3. What action follows

Contact these 10 accounts first, starting with the largest. BlindSpot's Customer Radar drafts a message per customer and exports the list. Nothing is sent from BlindSpot. Re-run after 30–60 days to see who reordered.

## 4. What remains unknown

- **Why they stopped.** The sales file can't separate a lost customer from one who closed, switched supplier, was merged into another account, or buys seasonally. Many accounts in this shop are wholesalers.
- **Merchant confirmation: not obtained.** This is a public dataset, and the retailer can't be contacted. Someone who knows the business still needs to check whether these accounts normally reorder and are worth contacting. Until a merchant does that on their own export, this is a historically checked rule on one real shop, not a confirmed business outcome.
- **Recovery.** No money has been recovered, and none is claimed.

## Correction log

- **Returner spending.** An earlier version said flagged customers who returned spent "about half" their usual pace. The calculation behind that figure included customers who never returned. Returners alone spent at 72–90%. The claim was removed.
- **Replay counts of 24 and 13.** A reviewer counted 24 and 13 flagged customers at the replay dates by treating the placeholder "Unknown customer" (rows without an ID) as one customer. That placeholder then ranks in the top 10% and pushes one real account (14145 in March, 17307 in June) just outside it. The app excludes the placeholder, and a test now checks this.
- **Significance tests.** These now use an exact test with the raw counts shown, replacing the z-test the first version used.
