import { usd } from '../api';

/** One way to describe a forecast range everywhere: nominal, with its real track record, or honestly absent. */
export function ForecastRange({
  low,
  high,
  compact = false,
}: {
  low: number | null;
  high: number | null;
  compact?: boolean;
}) {
  if (low === null || high === null) return <>No range yet</>;
  return (
    <>
      {compact ? '' : 'Nominal 80% range '}
      <span className="mono">{usd(low, compact)}</span> to <span className="mono">{usd(high, compact)}</span>
    </>
  );
}

/** The track record behind the range, and what isn't tested. */
export function RangeCoverage({
  accuracy,
  horizon,
}: {
  accuracy: { wape: number | null; months: number; hitRate: number | null; rangeTested: number };
  horizon: number;
}) {
  const hits = accuracy.rangeTested ? Math.round((accuracy.hitRate ?? 0) * accuracy.rangeTested) : 0;
  return (
    <>
      Replayed on the last {accuracy.months} months using only the data available at the time: off by{' '}
      {((accuracy.wape ?? 0) * 100).toFixed(1)}% on average
      {accuracy.rangeTested > 0 && (
        <>
          , and the nominal 80% range held in {hits} of {accuracy.rangeTested} months (limited calibration
          evidence)
        </>
      )}
      .
      {horizon > 1 &&
        ' Later months widen the range by an assumed √2 and √3; only one month ahead is tested.'}
    </>
  );
}
