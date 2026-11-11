# Independent recomputation of Blindspot's headline numbers on the full UCI Online Retail II data.
# Written separately from the TypeScript engine; same definitions, different code.
import csv, datetime as dt, statistics as st
from collections import defaultdict
FEES = {'POST','DOT','M','C2','D','S','BANK CHARGES','ADJUST','ADJUST2','AMAZONFEE','CRUK','B','PADS','TEST001','TEST002','GIFT'}
seen=set(); dup=0; L=[]
for r in csv.DictReader(open('data/online_retail_ii.csv')):
    k=tuple(r.values())
    if k in seen: dup+=1; continue
    seen.add(k)
    code=r['StockCode'].strip(); q=int(r['Quantity']); p=float(r['Price'])
    if code.upper() in FEES or not code[:1].isdigit() or p==0: continue
    L.append(dict(inv=r['Invoice'], c=r['Customer ID'], d=dt.date.fromisoformat(r['InvoiceDate'][:10]), co=r['Country'], pr=r['Description'].strip(), q=q, p=p, v=round(q*p,2), ret=q<0 or r['Invoice'].upper().startswith('C')))
# reversed orders within 2 days
open_=defaultdict(list); drop=set(); pairs=0; pairval=0.0
for i,x in enumerate(L):
    if not x['ret'] and x['c']: open_[(x['c'],x['pr'],x['q'],x['p'])].append(i)
for i,x in enumerate(L):
    if not x['ret'] or not x['c']: continue
    cand=open_.get((x['c'],x['pr'],-x['q'],x['p']),[])
    for j,si in enumerate(cand):
        s=L[si]
        if si not in drop and s['d']<=x['d'] and (x['d']-s['d']).days<=2:
            cand.pop(j); drop.update([si,i]); pairs+=1; pairval+=s['v']; break
L=[x for i,x in enumerate(L) if i not in drop]
sales=[x for x in L if not x['ret']]
gross=sum(x['v'] for x in sales); returned=sum(-x['v'] for x in L if x['ret'])
unknown=sum(x['v'] for x in sales if not x['c'])
print(f"duplicates: {dup:,}")
print(f"reversed within 2 days: {pairs:,} pairs, £{pairval:,.0f}")
print(f"returned value: £{returned:,.0f} = {returned/gross:.1%} of sales £{gross:,.0f}")
print(f"sales with no customer: {unknown/gross:.1%}")
orders={}
for x in sales:
    o=orders.setdefault(x['inv'],{'c':x['c'],'d':x['d'],'co':x['co'],'v':0}); o['v']+=x['v']
known=sorted([o for o in orders.values() if o['c']], key=lambda o:o['d'])
first=[];rep=[];s=set()
for o in known: (rep if o['c'] in s else first).append(o['v']); s.add(o['c'])
print(f"avg first order £{st.mean(first):.0f} vs repeat £{st.mean(rep):.0f}")
uk=[o['v'] for o in known if o['co']=='United Kingdom']; intl=[o['v'] for o in known if o['co']!='United Kingdom']
print(f"avg order UK £{st.mean(uk):.0f} vs international £{st.mean(intl):.0f}")
end=max(x['d'] for x in L)+dt.timedelta(days=1)
cs,ce=end-dt.timedelta(days=90),end; bs,be=cs-dt.timedelta(days=365),ce-dt.timedelta(days=365)
win=lambda f,a,b: sum(x['v'] for x in sales if f(x) and a<=x['d']<b)
cake=lambda x: x['pr']=='REGENCY CAKESTAND 3 TIER'; allx=lambda x: True
print(f"Regency cakestand {(win(cake,cs,ce)-win(cake,bs,be))/win(cake,bs,be):+.1%}; business {(win(allx,cs,ce)-win(allx,bs,be))/win(allx,bs,be):+.1%}")
