# Independent check of BlindSpot's top money finding on the real UCI Online Retail II shop:
# "10 of your best customers stopped ordering (£93,531 a year)".
#
# Separate code from the TypeScript engine (nothing shared), same published definitions:
#   - cleaning as in scripts/factcheck.py: exact duplicate lines, fee/non-product codes and zero prices dropped, orders
#     reversed within 2 days removed, returns kept apart from sales, rows with no customer ID never count as a customer;
#   - "best customers" = top max(10, 10%) of known customers by sales in the 365 days before the last 90 days;
#   - "stopped ordering" = 3+ orders in that year and none in the last 90 days.
# Then the identical rule is replayed at earlier dates, using only data before each date, and compared with what the
# flagged customers actually did over the next 180 days.
#
#   python3 scripts/validate_lapsed.py                                   # committed raw sample (checksum verified)
#   python3 scripts/validate_lapsed.py data/online_retail_ii.csv         # the full UCI file, if you have it
#   python3 scripts/validate_lapsed.py --app-clean                       # the app's own cleaned records, as a cross-check
import csv, datetime as dt, gzip, hashlib, json, math, statistics as st, sys
from collections import defaultdict

SAMPLE = 'validation/uk-gift-shop-sample.csv.gz'
SAMPLE_SHA256 = '2d60795a58f5128ef8b8c541ba2075593d806d26f0f373bb0a3f2efacc18c2eb'
APP_CLEAN = 'services/api/data/uk-gift-shop.clean.json.gz'
UNKNOWN = {'', 'Unknown customer', 'Guest checkout'}  # placeholders, never a customer
FEES = {'POST','DOT','M','C2','D','S','BANK CHARGES','ADJUST','ADJUST2','AMAZONFEE','CRUK','B','PADS','TEST001','TEST002','GIFT'}

def raw_orders(path):
    """Clean raw UCI transactions independently; return (orders, last sale date)."""
    if path == SAMPLE:
        got = hashlib.sha256(open(path, 'rb').read()).hexdigest()
        if got != SAMPLE_SHA256: sys.exit(f'{path}: checksum {got} does not match {SAMPLE_SHA256}')
    fh = gzip.open(path, 'rt', newline='') if path.endswith('.gz') else open(path, newline='')
    seen = set(); L = []
    for r in csv.DictReader(fh):
        k = tuple(r.values())
        if k in seen: continue
        seen.add(k)
        code = r['StockCode'].strip(); q = int(r['Quantity']); p = float(r['Price'])
        if code.upper() in FEES or not code[:1].isdigit() or p == 0: continue
        L.append(dict(inv=r['Invoice'], c=r['Customer ID'].strip(), d=dt.date.fromisoformat(r['InvoiceDate'][:10]),
                      pr=r['Description'].strip(), q=q, p=p, cents=round(q * p * 100),
                      ret=q < 0 or r['Invoice'].upper().startswith('C')))
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
    orders = {}
    for i, x in enumerate(L):
        if i in drop or x['ret'] or x['c'] in UNKNOWN: continue
        o = orders.setdefault(x['inv'], {'c': x['c'], 'd': x['d'], 'cents': 0}); o['cents'] += x['cents']
    return list(orders.values()), max(x['d'] for x in L)

def app_orders(path):
    """The app's pre-cleaned case-study records (same sample, cleaned by the app's TypeScript code)."""
    J = json.load(gzip.open(path)); idx = {c: i for i, c in enumerate(J['cols'])}; S = set(J['strCols'])
    val = lambda r, c: J['dict'][c][r[idx[c]]] if c in S else r[idx[c]]
    orders = {}; last = None
    for r in J['rows']:
        d = dt.date.fromisoformat(str(val(r, 'OrderDate'))[:10]); last = max(last or d, d)
        c = str(val(r, 'Customer') or '')
        if val(r, 'IsReturn') == 1 or c in UNKNOWN: continue
        o = orders.setdefault(val(r, 'Order'), {'c': c, 'd': d, 'cents': 0}); o['cents'] += round(val(r, 'Sales') * 100)
    return list(orders.values()), last

args = sys.argv[1:]
if args[:1] == ['--app-clean']: SRC = APP_CLEAN; orders, last_sale = app_orders(SRC)
else: SRC = args[0] if args else SAMPLE; orders, last_sale = raw_orders(SRC)
END = last_sale + dt.timedelta(days=1)  # exclusive end: the day after the last sale
print(f'Input: {SRC}  ({len(orders):,} orders from known customers)')

def rule(end):
    cutoff = end - dt.timedelta(days=90); start = cutoff - dt.timedelta(days=365)
    prior = defaultdict(lambda: {'cents': 0, 'n': 0, 'days': []}); last = {}
    for o in orders:
        if o['d'] >= end: continue  # only what was known on that date
        if start <= o['d'] < cutoff:
            e = prior[o['c']]; e['cents'] += o['cents']; e['n'] += 1; e['days'].append(o['d'])
        last[o['c']] = max(last.get(o['c'], o['d']), o['d'])
    ranked = sorted([(c, e) for c, e in prior.items() if e['cents'] > 0], key=lambda t: (-t[1]['cents'], t[0]))
    best = ranked[:max(10, -(-len(ranked) // 10))]
    lapsed = [(c, e) for c, e in best if e['n'] >= 3 and last[c] < cutoff]
    steady = [(c, e) for c, e in best if e['n'] >= 3 and last[c] >= cutoff]
    return cutoff, start, best, lapsed, steady, last

cutoff, start, best, lapsed, steady, last = rule(END)
total = sum(e['cents'] for _, e in lapsed)
print(f'Data ends {last_sale}; quiet since {cutoff}; spending window {start} to {cutoff - dt.timedelta(days=1)}')
print(f'Best customers: {len(best)}; stopped ordering: {len(lapsed)}; their spend in the window: £{total / 100:,.2f}\n')
print(f"{'customer':>8}  {'orders':>6}  {'usual gap':>9}  {'last order':>10}  {'silent':>6}  {'spend':>10}")
for c, e in lapsed:
    d = sorted(set(e['days'])); gaps = [(b - a).days for a, b in zip(d, d[1:])]
    print(f"{c:>8}  {e['n']:>6}  {(str(round(st.median(gaps))) + ' days') if gaps else '-':>9}  {str(last[c]):>10}  {(last_sale - last[c]).days:>4} d  £{e['cents'] / 100:>9,.2f}")
print('\nCustomer IDs:', ','.join(c for c, _ in lapsed))

def fisher_greater(a, n1, b, n2):
    """One-sided Fisher exact test: is the share a/n1 larger than b/n2? P(X >= a), X hypergeometric."""
    N, K = n1 + n2, a + b
    tot = math.comb(N, n1)
    return sum(math.comb(K, x) * math.comb(N - K, n1 - x) for x in range(a, min(K, n1) + 1)) / tot

print('\nReplay at earlier dates (only earlier data used), outcome over the next 180 days.')
print('The two replay dates are 3 months apart, so their windows overlap: they are not independent replications.')
for end in [dt.date(2011, 3, 10), dt.date(2011, 6, 10)]:
    _, _, _, lp, sd, _ = rule(end)
    after = end + dt.timedelta(days=180)
    nxt = defaultdict(int); back = set()
    for o in orders:
        if end <= o['d'] < after: nxt[o['c']] += o['cents']; back.add(o['c'])
    def stats(group):
        ret = [(c, e) for c, e in group if c in back]
        before_all = sum(e['cents'] for _, e in group); after_all = sum(nxt[c] for c, _ in group)
        before_ret = sum(e['cents'] for _, e in ret); after_ret = sum(nxt[c] for c, _ in ret)
        # Pace = spending in the next 180 days ÷ half of the same customers' spending in the prior year.
        return len(group), len(group) - len(ret), after_all / (before_all / 2), (after_ret / (before_ret / 2)) if before_ret else float('nan'), before_all
    n1, a1, pace1, rpace1, bf1 = stats(lp); n2, a2, pace2, rpace2, _ = stats(sd)
    print(f'\nAs of {end}: flagged {n1} customers (prior-year spend £{bf1 / 100:,.2f}); other best regulars still ordering: {n2}')
    print(f'  stayed away 180 days: flagged {a1} of {n1} ({a1 / n1:.0%}), others {a2} of {n2} ({a2 / n2:.0%}); one-sided Fisher exact p = {fisher_greater(a1, n1, a2, n2):.2g}')
    print(f'  spending pace, whole group (non-returners count as £0): flagged {pace1:.0%}, others {pace2:.0%}')
    print(f'  spending pace, only customers who came back: flagged {rpace1:.0%}, others {rpace2:.0%}')
