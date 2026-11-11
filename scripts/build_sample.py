# Rebuilds the case-study sample from the public UCI Online Retail II file, byte for byte.
#
# Source: Chen, D. (2012). Online Retail II [Dataset]. UCI Machine Learning Repository.
#         https://doi.org/10.24432/C5CG6D  (CC BY 4.0). Both Excel sheets (2009-2010, 2010-2011) exported in order to
#         one CSV with columns Invoice,StockCode,Description,Quantity,InvoiceDate,Price,Customer ID,Country and dates
#         as "YYYY-MM-DD HH:MM" (data/online_retail_ii.csv, 1,067,371 rows).
# Rule:   every row of a customer whose ID has crc32(ID) % 4 == 2 (a fixed 25% of customers, all their orders), plus
#         rows with no customer ID whose crc32(Invoice) % 4 == 0; original order kept.
#   python3 scripts/build_sample.py data/online_retail_ii.csv validation/uk-gift-shop-sample.csv
import csv, sys, zlib

src, out = sys.argv[1], sys.argv[2]
with open(src, newline='') as f, open(out, 'w', newline='') as g:
    r = csv.reader(f); w = csv.writer(g, lineterminator='\r\n')
    head = next(r); w.writerow(head)
    ci, ii = head.index('Customer ID'), head.index('Invoice')
    n = 0
    for row in r:
        keep = zlib.crc32(row[ci].encode()) % 4 == 2 if row[ci] else zlib.crc32(row[ii].encode()) % 4 == 0
        if keep:
            w.writerow(row); n += 1
print(f'wrote {out}: {n:,} rows')
