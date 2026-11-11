# Independent check of Blindspot's top money finding on the real UCI Online Retail II shop:
# "10 of your best customers stopped ordering (£93,531 a year)".
#
# Written separately from the TypeScript engine (no shared code), using the same published definitions:
#   - cleaning as in scripts/factcheck.py (exact duplicates, fee/non-product codes, zero prices, orders reversed
#     within 2 days removed; returns kept apart from sales);
#   - "best customers" = the top max(10, 10%) of known customers by sales in the 365 days before the last 90 days;
#   - "stopped ordering" = 3+ orders in that year and none in the last 90 days.
# Then it replays the same rule at earlier dates, using only data before each date, and checks what those customers
# actually did over the next 180 days.
#   python3 scripts/validate_lapsed.py                              # the 25% customer sample the app ships
#   python3 scripts/validate_lapsed.py data/online_retail_ii.csv    # the full UCI file
import csv, datetime as dt, gzip, statistics as st, sys
from collections import defaultdict

FEES = {'POST','DOT','M','C2','D','S','BANK CHARGES','ADJUST','ADJUST2','AMAZONFEE','CRUK','B','PADS','TEST001','TEST002','GIFT'}
seen = set(); L = []
SRC = sys.argv[1] if len(sys.argv) > 1 else 'data/uk-gift-shop-sample.csv.gz'  # the sample the app ships
fh = gzip.open(SRC, 'rt', newline='') if SRC.endswith('.gz') else open(SRC, newline='')
print(f"Input: {SRC}")
for r in csv.DictReader(fh):
    k = tuple(r.values())
    if k in seen: continue
    seen.add(k)
    code = r['StockCode'].strip(); q = int(r['Quantity']); p = float(r['Price'])
    if code.upper() in FEES or not code[:1].isdigit() or p == 0: continue
    L.append(dict(inv=r['Invoice'], c=r['Customer ID'].strip(), d=dt.date.fromisoformat(r['InvoiceDate'][:10]),
                  pr=r['Description'].strip(), q=q, p=p, cents=round(q * p * 100), ret=q < 0 or r['Invoice'].upper().startswith('C')))
open_ = defaultdict(list); drop = set()
for i, x in enumerate(L):
    if not x['ret'] and x['c']: open_[(x['c'], x['pr'], x['q'], x['p'])].append(i)
for i, x in enumerate(L):
    if not x['ret'] or not x['c']: continue
    cand = open_.get((x['c'], x['pr'], -x['q'], x['p']), [])
    for j, si in enumerate(cand):
        s = L[si]
        if si not in drop and s['d'] <= x['d'] and (x['d'] - s['d']).days <= 2:
            cand.pop(j); drop.update([si, i]); break
sales = [x for i, x in enumerate(L) if i not in drop and not x['ret'] and x['c']]
orders = {}
for x in sales:
    o = orders.setdefault(x['inv'], {'c': x['c'], 'd': x['d'], 'cents': 0}); o['cents'] += x['cents']
orders = list(orders.values())
END = max(x['d'] for x in L) + dt.timedelta(days=1)  # exclusive end: the day after the last sale

def rule(end):
    cutoff = end - dt.timedelta(days=90); start = cutoff - dt.timedelta(days=365)
    prior = defaultdict(lambda: {'cents': 0, 'n': 0, 'days': []}); last = {}
    for o in orders:
        if o['d'] >= end: continue                     # only what was known on that date
        if start <= o['d'] < cutoff:
            e = prior[o['c']]; e['cents'] += o['cents']; e['n'] += 1; e['days'].append(o['d'])
        last[o['c']] = max(last.get(o['c'], o['d']), o['d'])
    ranked = sorted([(c, e) for c, e in prior.items() if e['cents'] > 0], key=lambda t: -t[1]['cents'])
    best = ranked[:max(10, -(-len(ranked) // 10))]
    lapsed = [(c, e) for c, e in best if e['n'] >= 3 and last[c] < cutoff]
    steady = [(c, e) for c, e in best if e['n'] >= 3 and last[c] >= cutoff]
    return cutoff, start, best, lapsed, steady, last

cutoff, start, best, lapsed, steady, last = rule(END)
total = sum(e['cents'] for _, e in lapsed)
print(f"Data ends {END - dt.timedelta(days=1)}; quiet since {cutoff} (last 90 days); spending window {start} to {cutoff - dt.timedelta(days=1)}")
print(f"Best customers: {len(best)}; of those, stopped ordering: {len(lapsed)}; their spend in the window: £{total / 100:,.2f}\n")
print(f"{'customer':>8}  {'orders':>6}  {'usual gap':>9}  {'last order':>10}  {'silent':>6}  {'spend':>10}")
for c, e in lapsed:
    d = sorted(set(e['days'])); gaps = [(b - a).days for a, b in zip(d, d[1:])]
    print(f"{c:>8}  {e['n']:>6}  {(str(round(st.median(gaps))) + ' days') if gaps else '-':>9}  {str(last[c]):>10}  {(END - dt.timedelta(days=1) - last[c]).days:>4} d  £{e['cents'] / 100:>9,.2f}")
print("\nCustomer IDs:", ",".join(c for c, _ in lapsed))

# Back-test: apply the identical rule at earlier dates, then look 180 days ahead.
print("\nReplay at earlier dates (only earlier data used), outcome over the following 180 days:")
import math
def one_sided_z(x1, n1, x2, n2):  # H1: group 1 stays away more often than group 2
    p = (x1 + x2) / (n1 + n2); se = math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
    z = (x1 / n1 - x2 / n2) / se if se else 0.0
    return 0.5 * math.erfc(z / math.sqrt(2))
for end in [dt.date(2011, 3, 10), dt.date(2011, 6, 10)]:
    co, _, _, lp, sd, _ = rule(end)
    after_end = end + dt.timedelta(days=180)
    def outcome(group):
        back = 0; spent = 0
        for c, _ in group:
            nxt = [o for o in orders if o['c'] == c and end <= o['d'] < after_end]
            if nxt: back += 1
            spent += sum(o['cents'] for o in nxt)
        before = sum(e['cents'] for _, e in group)
        return back, spent, before
    b, s1, bf1 = outcome(lp); b2, s2, bf2 = outcome(sd)
    away1, away2 = len(lp) - b, len(sd) - b2
    pace1 = s1 / (bf1 / 2) if bf1 else 0; pace2 = s2 / (bf2 / 2) if bf2 else 0   # next half-year vs half their prior year
    print(f"As of {end}: flagged {len(lp)} (prior-year spend £{bf1 / 100:,.0f})")
    print(f"  stayed away the next 180 days: flagged {away1}/{len(lp)} ({away1 / len(lp):.0%}) vs other best regulars {away2}/{len(sd)} ({away2 / len(sd):.0%}); one-sided two-proportion z-test p = {one_sided_z(away1, len(lp), away2, len(sd)):.2g}")
    print(f"  spending pace in the next 180 days vs their own prior year: flagged {pace1:.0%} vs other best regulars {pace2:.0%}")
