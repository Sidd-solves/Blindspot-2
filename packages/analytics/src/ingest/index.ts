/**
 * Universal sales-file reader. Takes the text of one or more files (CSV/TSV, or Excel/PDF already turned
 * into text by the browser) and produces Blindspot's canonical rows, plus a report that says exactly how
 * every column was read, which rows were missing something, and what the file can and can't unlock.
 *
 *   text → table (delimiter, header row, encoding junk, totals) → columns → roles (platform profile or
 *   name + value scoring) → records → merge extra files → lines (numbers, dates, returns, refunds,
 *   cancellations) → cleaning (duplicates, fees, reversed orders) → dataset
 */

export { IngestError, ROLES, ROLE_LABEL } from './report';
export type { DateOrder, IngestReport, Issue, Role, RoleMap, Unlock } from './report';
export {
  CURRENCY_CODES,
  currencyOf,
  detectDateOrder,
  detectDecimalComma,
  parseDate,
  parseNumber,
} from './values';
export { readTable } from './table';
export type { Table } from './table';
export { ingest } from './read';
export type { IngestInput, IngestOptions } from './read';
