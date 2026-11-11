import type { DateOrder } from './report';

/* ------------------------------------------------------------------ small helpers */

export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
export const blank = (v: unknown) =>
  v == null || String(v).trim() === '' || /^(null|n\/?a|none|-|—|nan|undefined)$/i.test(String(v).trim());
export const r2 = (n: number) => Math.round(n * 100) / 100;

export const CURRENCY_CODES = new Set([
  'USD',
  'EUR',
  'GBP',
  'INR',
  'CAD',
  'AUD',
  'JPY',
  'CNY',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
  'NZD',
  'SGD',
  'HKD',
  'KRW',
  'MXN',
  'BRL',
  'ZAR',
  'TRY',
  'PLN',
  'CZK',
  'HUF',
  'ILS',
  'IDR',
  'MYR',
  'PHP',
  'THB',
  'RON',
  'ISK',
  'AED',
  'SAR',
  'NGN',
  'KES',
  'PKR',
  'BDT',
  'VND',
  'EGP',
  'COP',
  'CLP',
  'ARS',
  'PEN',
  'TWD',
  'UAH',
  'BGN',
]);
export const SYMBOLS: [RegExp, string][] = [
  [/R\$/, 'BRL'],
  [/CA\$|C\$/, 'CAD'],
  [/AU?\$/, 'AUD'],
  [/NZ\$/, 'NZD'],
  [/HK\$/, 'HKD'],
  [/S\$/, 'SGD'],
  [/MX\$/, 'MXN'],
  [/US\$/, 'USD'],
  [/\$/, 'USD'],
  [/£/, 'GBP'],
  [/€/, 'EUR'],
  [/¥|￥/, 'JPY'],
  [/₹|\bRs\.?/, 'INR'],
  [/₩/, 'KRW'],
  [/₺/, 'TRY'],
  [/zł/i, 'PLN'],
  [/₪/, 'ILS'],
  [/₱/, 'PHP'],
  [/฿/, 'THB'],
  [/₦/, 'NGN'],
  [/Kč/, 'CZK'],
  [/₫/, 'VND'],
];

export const COUNTRIES = new Set(
  'united states,usa,us,united kingdom,uk,great britain,england,scotland,wales,northern ireland,ireland,eire,canada,australia,new zealand,germany,france,spain,italy,portugal,netherlands,belgium,luxembourg,switzerland,austria,sweden,norway,denmark,finland,iceland,poland,czech republic,czechia,slovakia,hungary,romania,bulgaria,greece,cyprus,malta,croatia,slovenia,serbia,estonia,latvia,lithuania,ukraine,russia,turkey,israel,united arab emirates,uae,saudi arabia,qatar,kuwait,bahrain,oman,egypt,morocco,nigeria,kenya,south africa,rsa,ghana,india,pakistan,bangladesh,sri lanka,nepal,china,hong kong,taiwan,japan,south korea,korea,singapore,malaysia,indonesia,philippines,thailand,vietnam,mexico,brazil,argentina,chile,colombia,peru,uruguay,venezuela,ecuador,costa rica,panama,puerto rico,jamaica,lebanon,jordan,channel islands,eire,european community,unspecified,rest of world'.split(
    ',',
  ),
);

export const STATUS_DROP = /cancel|void|fail|declin|abandon|expired|reject|unpaid|draft/i;
/** A refund/return *event* row (the row itself is the money going back). */
export const STATUS_RETURN = /^(refund|return|chargeback|reversal|returned item|refund issued)$/i;
/** An order whose *state* is refunded (the row is the original sale; the money later went back). */
export const STATUS_REFUNDED = /^(fully\s*)?(refunded|returned|reversed|charged\s*back)$/i;

/* ------------------------------------------------------------------ numbers */

/** Does this column write decimals with a comma ("1.234,50")? Decided from many values, not one. */
export function detectDecimalComma(values: string[], europeanHint = false): boolean {
  let comma = 0,
    dot = 0,
    ambDot = 0;
  for (const v of values) {
    const s = v.replace(/[^\d.,]/g, '');
    if (/^\d{1,3}(\.\d{3}){2,}$/.test(s)) {
      comma++;
      continue;
    } // 1.234.567
    if (/^\d{1,3}\.\d{3}$/.test(s)) {
      ambDot++;
      continue;
    } // 1.234: thousands or decimals?
    if (/\d\.\d{3},\d/.test(s) || /^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s) || /^\d+,\d{1,2}$/.test(s)) comma++;
    else if (/\d,\d{3}\.\d/.test(s) || /^\d{1,3}(,\d{3})+\.\d{1,2}$/.test(s) || /^\d+\.\d{1,2}$/.test(s))
      dot++;
  }
  return comma > dot || (comma === 0 && dot === 0 && ambDot > 0 && europeanHint);
}

/** Strict number reader: accepts "£1,234.50", "1.234,50 €", "(12.00)", "12-", "USD 9", "−3"; rejects text like "2 x Hoodie". */
export function parseNumber(raw: unknown, decimalComma = false): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (blank(raw)) return null;
  let s = String(raw)
    .trim()
    .replace(/[   ']/g, ' ');
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[−–]/g, '-');
  if (/-\s*$/.test(s)) {
    neg = true;
    s = s.replace(/-\s*$/, '');
  }
  // strip currency marks and codes
  for (const [re] of SYMBOLS) s = s.replace(new RegExp(re.source, 'gi'), '');
  s = s
    .replace(/\b[A-Z]{3}\b/g, (m) => (CURRENCY_CODES.has(m) ? '' : m))
    .replace(/%$/, '')
    .trim();
  // currency and unit words: "40 dollars", "2 pcs", "x3", "3 units"
  s = s
    .replace(
      /\s*\b(dollars?|bucks|euros?|pounds?|quid|rupees?|yen|yuan|pesos?|reais|francs?|kronor|kroner|pcs?|pieces?|units?|ea|each|items?|stk|st|uds?|unidades?)\.?\s*$/i,
      '',
    )
    .replace(/^x\s*(?=\d)|(?<=\d)\s*x$/i, '')
    .trim();
  if (/^-/.test(s)) {
    neg = !neg;
    s = s.slice(1).trim();
  }
  if (/^\+/.test(s)) s = s.slice(1).trim();
  if (/^\d+(\.\d+)?e[+-]?\d+$/i.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) ? (neg ? -n : n) : null;
  }
  if (!/^[\d.,\s]+$/.test(s) || !/\d/.test(s)) return null;
  s = s.replace(/\s/g, '');
  if (decimalComma) s = s.replace(/\./g, '').replace(',', '.');
  else {
    // a lone comma with exactly 1–2 decimals and no dots is a decimal comma even in a dot column ("12,5")
    if (!s.includes('.') && /^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
    else s = s.replace(/,/g, '');
  }
  if ((s.match(/\./g) ?? []).length > 1) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

export function currencyOf(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values.slice(0, 400)) {
    const s = String(v);
    let hit: string | null = null;
    const code = s.match(/\b([A-Z]{3})\b/);
    if (code && CURRENCY_CODES.has(code[1])) hit = code[1];
    else
      for (const [re, c] of SYMBOLS)
        if (re.test(s)) {
          hit = c;
          break;
        }
    if (hit) counts.set(hit, (counts.get(hit) ?? 0) + 1);
  }
  let best: string | null = null,
    n = 0;
  for (const [c, k] of counts)
    if (k > n) {
      best = c;
      n = k;
    }
  return best;
}

/* ------------------------------------------------------------------ dates */

export const MONTHS: Record<string, number> = {};
[
  'january,jan,enero,ene,janvier,janv,januar,gennaio,gen,janeiro',
  'february,feb,febrero,fevrier,fevr,fev,februar,febbraio,fevereiro',
  'march,mar,marzo,mars,marz,marco',
  'april,apr,abril,abr,avril,avr,aprile',
  'may,mayo,mai,maggio,mag,maio',
  'june,jun,junio,juin,juni,giugno,giu,junho',
  'july,jul,julio,juillet,juil,juli,luglio,lug,julho',
  'august,aug,agosto,ago,aout,aou',
  'september,sep,sept,septiembre,septembre,settembre,set,setembro',
  'october,oct,octubre,octobre,oktober,okt,ottobre,ott,outubro,out',
  'november,nov,noviembre,novembre,novembro',
  'december,dec,diciembre,dic,decembre,dezember,dez,dicembre,dezembro',
].forEach((names, i) =>
  names.split(',').forEach((n) => {
    MONTHS[n] = i + 1;
  }),
);

export const iso = (y: number, m: number, d: number) => {
  if (y < 100) y += y < 70 ? 2000 : 1900;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // e.g. 31 Feb
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

/** Which way round are slash dates in this column? Decided from all values: a first number >12 means day first. */
export function detectDateOrder(values: string[]): { order: DateOrder; assumed: boolean } | null {
  let dmy = 0,
    mdy = 0,
    numeric = 0;
  for (const v of values) {
    const m = String(v)
      .trim()
      .match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/);
    if (!m) continue;
    numeric++;
    const a = +m[1],
      b = +m[2];
    if (a > 12 && b <= 12) dmy++;
    else if (b > 12 && a <= 12) mdy++;
  }
  if (!numeric) return null;
  if (dmy && !mdy) return { order: 'dmy', assumed: false };
  if (mdy && !dmy) return { order: 'mdy', assumed: false };
  if (dmy && mdy) return { order: dmy >= mdy ? 'dmy' : 'mdy', assumed: true };
  return { order: 'mdy', assumed: true };
}

/** Reads one date into YYYY-MM-DD, keeping the calendar day as written (no timezone shifting). */
export function parseDate(raw: unknown, order: DateOrder = 'mdy', allowSerial = false): string | null {
  if (blank(raw)) return null;
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s,])/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})(?:$|[T\s,])/);
  if (m) {
    const a = +m[1],
      b = +m[2],
      y = +m[3];
    if (order === 'dmy') return iso(y, b, a) ?? iso(y, a, b);
    return iso(y, a, b) ?? iso(y, b, a);
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m && +m[1] >= 1990) return iso(+m[1], +m[2], +m[3]);
  // "01-Dec-2009", "1 Dec 2009", "Tue, 01 Dec 2009 10:00"
  m = s.match(
    /^(?:[a-z]{3,9},?\s+)?(\d{1,2})(?:st|nd|rd|th)?[\s\-./]+([a-zA-ZÀ-ſ]{3,10})\.?[\s\-./,]+(\d{2,4})\b/i,
  );
  if (m) {
    const mo = MONTHS[norm(m[2])];
    if (mo) return iso(+m[3], mo, +m[1]);
  }
  // "Dec 1, 2009", "December 1st 2009", "Tuesday, December 1, 2009"
  m = s.match(/^(?:[a-z]{3,9},?\s+)?([a-zA-ZÀ-ſ]{3,10})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})\b/i);
  if (m) {
    const mo = MONTHS[norm(m[1])];
    if (mo) return iso(+m[3], mo, +m[2]);
  }
  const mh = monthHeader(s);
  if (mh) return mh; // "Oct 2026", "2026-10": a monthly figure, dated the 1st
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (allowSerial && n > 25000 && n < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
      return d.toISOString().slice(0, 10);
    }
    if (n > 9.4e8 && n < 2.2e9) return new Date(n * 1000).toISOString().slice(0, 10);
    if (n > 9.4e11 && n < 2.2e12) return new Date(n).toISOString().slice(0, 10);
  }
  return null;
}

/** "Jan 2024", "2024-01", "01/2024", "January", "Jan-24" as a month header → first day of that month. */
export function monthHeader(h: string, fallbackYear?: number): string | null {
  const s = h.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (m) return iso(+m[1], +m[2], 1);
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m) return iso(+m[2], +m[1], 1);
  m = s.match(/^([a-zA-Z]{3,9})\.?[\s\-'/]*(\d{2,4})$/);
  if (m && MONTHS[norm(m[1])]) return iso(+m[2], MONTHS[norm(m[1])], 1);
  m = s.match(/^(\d{4})[\s\-]+([a-zA-Z]{3,9})$/);
  if (m && MONTHS[norm(m[2])]) return iso(+m[1], MONTHS[norm(m[2])], 1);
  if (fallbackYear && MONTHS[norm(s)] && s.length >= 3) return iso(fallbackYear, MONTHS[norm(s)], 1);
  return null;
}

/* ------------------------------------------------------------------ table */
