/**
 * The one way to state a forecast's average miss. A percentage needs actual sales to divide by; when every tested
 * month sold nothing it is undefined, and saying "0.0%" would claim perfect accuracy. Then the miss is given in money.
 */
export function describeAccuracy(
  acc: { wape: number | null; mae: number | null; months: number },
  money: (n: number) => string,
): { short: string; sentence: string; percent: number | null } {
  if (acc.wape !== null) {
    const p = `${(acc.wape * 100).toFixed(1)}%`;
    return { short: `${p} avg miss`, sentence: `off by ${p} on average`, percent: acc.wape };
  }
  if (!acc.months || acc.mae === null)
    return { short: 'Not tested yet', sentence: 'not tested yet', percent: null };
  return {
    short: `${money(acc.mae)} avg miss`,
    sentence: `off by ${money(acc.mae)} a month on average (a percentage error is unavailable because actual sales in the tested months totalled zero)`,
    percent: null,
  };
}
