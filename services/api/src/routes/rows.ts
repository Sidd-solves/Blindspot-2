import type { Express } from 'express';
import { z } from 'zod';
import { detectFields } from '@blindspot/analytics';
import { toMs } from '@blindspot/analytics';
import type { RouteContext } from './context';

/** The exact rows behind every number: listing, search, drill-down to a finding, and CSV download. */
export function rowRoutes(app: Express, { sessions, sid }: RouteContext) {
  /**
   * Drill-through ("See the affected rows"). `drill` is the finding's DrillSpec as JSON. scope=exact applies every
   * predicate (values, row type, date windows) so the rows reproduce the finding's figure; scope=history keeps only
   * the values (every related row, any date or type).
   */
  const DrillQ = z.object({
    field: z.string().max(100),
    values: z.array(z.string()).max(20_000),
    label: z.string().max(300).default(''),
    rowType: z.enum(['sale', 'return', 'all']).optional(),
    dateField: z.string().max(100).optional(),
    windows: z
      .array(z.object({ label: z.string(), from: z.number(), to: z.number(), expect: z.number().optional() }))
      .max(4)
      .optional(),
    expect: z.object({ value: z.number(), what: z.string() }).nullable().optional(),
  });
  type Drill = z.infer<typeof DrillQ>;
  function parseDrill(raw?: string): Drill | null {
    if (!raw) return null;
    try {
      const d = DrillQ.safeParse(JSON.parse(raw));
      return d.success ? d.data : null;
    } catch {
      return null;
    }
  }
  function drillRows(rows: any[], d: Drill | null, scope: 'exact' | 'history') {
    if (!d) return rows;
    const set = new Set(d.values.map(String));
    const exact = scope === 'exact',
      type = exact ? (d.rowType ?? 'all') : 'all',
      wins = exact && d.dateField ? (d.windows ?? []) : [];
    return rows.filter((r) => {
      if (!set.has(String(r[d.field] ?? ''))) return false;
      if (type === 'sale' && r.IsReturn === 1) return false;
      if (type === 'return' && r.IsReturn !== 1) return false;
      if (wins.length) {
        const t = toMs(r[d.dateField!]);
        if (!wins.some((w) => t >= w.from && t < w.to)) return false;
      }
      return true;
    });
  }

  const placeholderMemo = new WeakMap<object, boolean>();
  const placeholderCountry = (rows: any[]) => {
    let v = placeholderMemo.get(rows);
    if (v === undefined) {
      v = rows.length > 0 && rows.every((r) => r.Country === 'All');
      placeholderMemo.set(rows, v);
    }
    return v;
  };

  /** The exact rows being analyzed (after cleaning and the visitor's filters), so anyone can check the numbers. */
  app.get('/api/rows', (req, res) => {
    const q = z
      .object({
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        q: z.string().max(100).default(''),
        drill: z.string().max(400_000).optional(),
        scope: z.enum(['exact', 'history']).default('exact'),
      })
      .parse(req.query);
    const v = sessions.get(sid(req)).view(),
      needle = q.q.trim().toLowerCase(),
      drill = parseDrill(q.drill);
    const all = drillRows(v.rows, drill, q.scope);
    // A file without a country column gets the placeholder Country "All" internally; don't show it as if it were data.
    const columns = all.length
      ? Object.keys(all[0]).filter((c) => !(c === 'Country' && placeholderCountry(v.rows)))
      : [];
    const matched = needle
      ? all.filter((r) =>
          columns.some((c) =>
            String(r[c] ?? '')
              .toLowerCase()
              .includes(needle),
          ),
        )
      : all;
    const fm = detectFields(v),
      tx = !!all[0] && 'IsReturn' in all[0],
      hasOrders = !!all[0] && 'Order' in all[0];
    /** Money is summed in integer minor units (pence/cents) so a reconciliation can be exact, not "within 0.1%". */
    const cents = (x: unknown) => (typeof x === 'number' ? Math.round(x * 100) : 0);
    const totalsOf = (rs: any[]) => {
      let sales = 0,
        returns = 0;
      const orders = new Set<string>(),
        customers = new Set<string>();
      for (const r of rs) {
        const m = cents(r[fm.measure]);
        if (tx && r.IsReturn === 1) {
          returns += m;
          continue;
        }
        sales += m;
        if (
          'Customer' in r &&
          r.Customer &&
          r.Customer !== 'Unknown customer' &&
          r.Customer !== 'Guest checkout'
        )
          customers.add(String(r.Customer));
        if (hasOrders) orders.add(String(r.Order));
      }
      // Orders = orders with at least one sale line; a returns-only view has 0 orders. Files without order IDs count sale lines.
      const saleLines = tx ? rs.filter((r) => r.IsReturn !== 1).length : rs.length;
      return {
        sales: Math.round(sales / 100),
        returns: Math.round(returns / 100),
        salesCents: sales,
        returnsCents: returns,
        orders: hasOrders ? orders.size : saleLines,
        customers: customers.size,
        lines: rs.length,
      };
    };
    const totals = totalsOf(all);
    // Reconciliation: what these rows add up to (to the penny), per date window, next to the figure the finding reported.
    const recon =
      drill && q.scope === 'exact'
        ? {
            expect: drill.expect ?? null,
            expectCents: drill.expect ? Math.round(drill.expect.value * 100) : null,
            actualCents: drill.rowType === 'return' ? Math.abs(totals.returnsCents) : totals.salesCents,
            actual: Math.round(
              (drill.rowType === 'return' ? Math.abs(totals.returnsCents) : totals.salesCents) / 100,
            ),
            windows: drill.dateField
              ? (drill.windows ?? []).map((w) => {
                  let t = 0;
                  for (const r of all) {
                    const ms = toMs(r[drill.dateField!]);
                    if (ms >= w.from && ms < w.to) t += Math.abs(cents(r[fm.measure]));
                  }
                  return {
                    label: w.label,
                    actualCents: t,
                    actual: Math.round(t / 100),
                    expectCents: w.expect == null ? null : Math.round(w.expect * 100),
                    expect: w.expect ?? null,
                  };
                })
              : [],
          }
        : null;
    res.json({
      columns,
      total: all.length,
      recon,
      matched: matched.length,
      rows: matched.slice(q.offset, q.offset + q.limit),
      measure: fm.measure,
      currency: v.currency ?? 'USD',
      totals,
      searchTotals: needle ? totalsOf(matched) : null,
      search: needle || null,
    });
  });

  app.get('/api/rows.csv', (req, res) => {
    const v0 = sessions.get(sid(req)).view(),
      f = z
        .object({
          drill: z.string().max(400_000).optional(),
          scope: z.enum(['exact', 'history']).default('exact'),
          q: z.string().max(100).default(''),
        })
        .parse(req.query);
    const scoped = drillRows(v0.rows, parseDrill(f.drill), f.scope),
      needle = f.q.trim().toLowerCase(),
      keys = scoped.length ? Object.keys(scoped[0]) : [];
    const v = {
        ...v0,
        rows: needle
          ? scoped.filter((r) =>
              keys.some((c) =>
                String(r[c] ?? '')
                  .toLowerCase()
                  .includes(needle),
              ),
            )
          : scoped,
      },
      cols = v.rows.length
        ? Object.keys(v.rows[0]).filter((c) => !(c === 'Country' && placeholderCountry(v0.rows)))
        : [];
    const esc = (x: unknown) => {
      const t = x == null ? '' : String(x);
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${v.name.replace(/[^\w -]/g, '').trim() || 'data'}.csv"`,
    });
    res.write(cols.join(',') + '\n');
    for (let i = 0; i < v.rows.length; i += 5000)
      res.write(
        v.rows
          .slice(i, i + 5000)
          .map((r) => cols.map((c) => esc(r[c])).join(','))
          .join('\n') + '\n',
      );
    res.end();
  });
}
