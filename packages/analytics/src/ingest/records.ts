import { ROLES, type Role, type RoleMap } from './report';
import type { Table } from './table';
import { blank } from './values';

/* ------------------------------------------------------------------ records → lines */

export interface Rec {
  line: number;
  file: number;
  v: Partial<Record<Role, string>>;
  extra: Record<string, string>;
}

export function toRecords(
  t: Table,
  roles: RoleMap,
  file: number,
  orderLevel: Role[],
  extras: string[],
): Rec[] {
  const idx = Object.fromEntries(
    Object.entries(roles).map(([r, c]) => [r, t.headers.indexOf(c!)]),
  ) as Partial<Record<Role, number>>;
  const ex = extras.map((h) => [h, t.headers.indexOf(h)] as const);
  const out: Rec[] = [];
  let last: Rec | null = null;
  // Order-level fields are often written only on an order's first line: carry them down within the same order.
  const carry: Role[] = orderLevel.length
    ? orderLevel
    : ['date', 'customer', 'country', 'region', 'status', 'currency'];
  t.rows.forEach((r, i) => {
    const v: Partial<Record<Role, string>> = {};
    for (const role of ROLES) {
      const j = idx[role];
      if (j !== undefined && j >= 0 && !blank(r[j])) v[role] = r[j];
    }
    for (const role of ['order', 'customer', 'sku'] as Role[])
      if (v[role]) v[role] = v[role]!.replace(/^(\d+)\.0+$/, '$1'); // Excel turns 1001 into 1001.0
    const rec: Rec = {
      line: t.lines[i],
      file,
      v,
      extra: Object.fromEntries(ex.map(([h, j]) => [h, r[j] ?? ''])),
    };
    // Some exports leave the order number (and date) blank on an order's extra lines.
    if (last && roles.order && !v.order && !v.date && last.v.order && (v.product || v.sku))
      v.order = last.v.order;
    if (last && roles.order && v.order && last.v.order === v.order)
      for (const role of carry)
        if (v[role] === undefined && last.v[role] !== undefined) v[role] = last.v[role];
    out.push(rec);
    last = rec;
  });
  return out;
}

/** Split "2× Hoodie, 1× Cap" (WooCommerce and others) into separate products with quantities. */
export function explodeMulti(product: string): { name: string; qty: number }[] | null {
  const parts = product.split(/,\s*(?=\d+\s*[×x]\s)/);
  const items = parts
    .map((p) => p.trim().match(/^(\d+)\s*[×x]\s+(.+)$/))
    .filter(Boolean) as RegExpMatchArray[];
  if (!items.length || items.length !== parts.length) return null;
  return items.map((m) => ({ name: m[2].trim(), qty: +m[1] }));
}
