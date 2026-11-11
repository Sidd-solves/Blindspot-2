import { describe, expect, it } from 'vitest';
import { analyzeSmart } from '@blindspot/analytics';
import { caseStudyAvailable, loadCaseStudy } from '../services/api/src/case-study';

/**
 * The numbers in docs/VALIDATION.md, produced by the app's own engine. scripts/validate_lapsed.py reproduces the same
 * customers and amounts with separate Python code, from the raw sample and from these cleaned records.
 */
describe.runIf(caseStudyAvailable())(
  'docs/VALIDATION.md: the lapsed-customers finding and its replay',
  () => {
    const lapsedAsOf = (end: string) => {
      const ds = loadCaseStudy();
      const rows = ds.rows.filter((r) => String(r.OrderDate).slice(0, 10) < end);
      return analyzeSmart({ ...ds, rows }).find((f) => f.id === 'store-lapsed')!;
    };

    it('today: the same 10 customers and £93,531.25', () => {
      const f = analyzeSmart(loadCaseStudy()).find((x) => x.id === 'store-lapsed')!;
      expect(f.drill!.expect!.value).toBe(93531.25);
      expect([...f.drill!.values].sort()).toEqual(
        ['15749', '16180', '13027', '17504', '18260', '12643', '14016', '14828', '14105', '14461'].sort(),
      );
    });

    it('replayed on 10 Mar 2011 and 10 Jun 2011 with only earlier data: 25 and 14 customers', () => {
      const mar = lapsedAsOf('2011-03-10'),
        jun = lapsedAsOf('2011-06-10');
      expect(mar.drill!.values).toHaveLength(25);
      expect(mar.drill!.expect!.value).toBe(172900.21);
      expect(jun.drill!.values).toHaveLength(14);
      expect(jun.drill!.expect!.value).toBe(103973.02);
    });

    it('rows without a customer ID never count as a customer (the cause of a 24/13 miscount)', () => {
      for (const f of [lapsedAsOf('2011-03-10'), lapsedAsOf('2011-06-10')])
        expect(f.drill!.values).not.toContain('Unknown customer');
    });
  },
);
