# Independent recomputation of Blindspot's headline numbers on the full UCI Online Retail II data.
import csv, datetime as dt, statistics as st
FEES = {'POST','DOT','M','C2','D','S','BANK CHARGES','ADJUST','ADJUST2','AMAZONFEE','CRUK','B','PADS','TEST001','TEST002','GIFT'}
seen=set(); dup=0; lines=[]
for r in csv.DictReader(open('data/online_retail_ii.csv')):
    k=tuple(r.values())
    if k in seen: dup+=1; continue
    seen.add(k)
    code=r['StockCode'].strip(); q=int(r['Quantity']); p=float(r['Price'])
    if code.upper() in FEES or not code[:1].isdigit(): continue
    if p==0: continue
    ret = q<0 or r['Invoice'].upper().startswith('C')
    lines.append((r['Invoice'], r['Customer ID'].replace('.0',''), r['InvoiceDate'][:10], r['Country'], r['Description'].strip(), q*p, ret))
gross=sum(v for *_,v,ret in lines if not ret); returned=sum(-v for *_,v,ret in lines if ret)
unknown=sum(v for i,c,d,co,pr,v,ret in lines if not ret and not c)
print(f"duplicates: {dup:,}")
print(f"returned value: £{returned:,.0f} = {returned/gross:.1%} of gross £{gross:,.0f}")
print(f"sales with no customer: £{unknown:,.0f} = {unknown/gross:.1%}")
# order totals
orders={}
for i,c,d,co,pr,v,ret in lines:
    if ret: continue
    o=orders.setdefault(i,{'c':c,'d':d,'co':co,'v':0}); o['v']+=v
known=sorted([o for o in orders.values() if o['c']], key=lambda o:o['d'])
first=[];rep=[];s=set()
for o in known: (rep if o['c'] in s else first).append(o['v']); s.add(o['c'])
print(f"avg first order £{st.mean(first):.0f} vs repeat £{st.mean(rep):.0f}")
uk=[o['v'] for o in known if o['co']=='United Kingdom']; intl=[o['v'] for o in known if o['co']!='United Kingdom']
print(f"avg order UK £{st.mean(uk):.0f} vs international £{st.mean(intl):.0f}")
# Regency cakestand, last 90 days vs same 90 days a year earlier
end=max(dt.date.fromisoformat(d) for _,_,d,*_ in lines)+dt.timedelta(days=1)
cs,ce=end-dt.timedelta(days=90),end; bs,be=cs-dt.timedelta(days=365),ce-dt.timedelta(days=365)
def win(name,a,b): return sum(v for i,c,d,co,pr,v,ret in lines if not ret and pr==name and a<=dt.date.fromisoformat(d)<b)
cur,base=win('REGENCY CAKESTAND 3 TIER',cs,ce),win('REGENCY CAKESTAND 3 TIER',bs,be)
tot=lambda a,b: sum(v for i,c,d,co,pr,v,ret in lines if not ret and a<=dt.date.fromisoformat(d)<b)
print(f"Regency cakestand: £{base:,.0f} -> £{cur:,.0f} ({(cur-base)/base:+.1%}); business {(tot(cs,ce)-tot(bs,be))/tot(bs,be):+.1%}")
