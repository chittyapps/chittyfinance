import { describe, it, expect } from 'vitest';
import {
  classifyPickerGroups,
  postableAccounts,
  isHeader,
  type PickerAccount,
} from '../lib/coa-hierarchy';
import { REI_CHART_OF_ACCOUNTS } from '../../../database/chart-of-accounts';

/**
 * The real chart, not a fixture. A hand-written fixture would keep passing after the
 * chart changed, which is the drift this file exists to catch.
 */
const chart: PickerAccount[] = REI_CHART_OF_ACCOUNTS.map((a) => ({
  id: a.code,
  code: a.code,
  name: a.name,
  subtype: a.subtype ?? null,
  parentCode: a.parentCode ?? null,
}));

describe('the classify picker', () => {
  it('offers no header account', () => {
    const offered = classifyPickerGroups(chart).flatMap((g) => g.options);
    const headers = chart.filter(isHeader);

    expect(headers.length).toBeGreaterThan(0); // non-vacuity: the chart really has headers
    for (const header of headers) {
      expect(offered.find((o) => o.code === header.code)).toBeUndefined();
    }
  });

  it('offers every postable account exactly once', () => {
    const offered = classifyPickerGroups(chart).flatMap((g) => g.options);
    const postable = postableAccounts(chart);

    expect(offered).toHaveLength(postable.length);
    expect(new Set(offered.map((o) => o.code)).size).toBe(offered.length);
    expect(offered.map((o) => o.code).sort()).toEqual(postable.map((a) => a.code).sort());
  });

  it('labels each group with its header and files children under it', () => {
    const groups = classifyPickerGroups(chart).filter((g) => g.headerCode !== null);
    expect(groups.length).toBeGreaterThan(0);

    for (const group of groups) {
      const header = chart.find((a) => a.code === group.headerCode);
      expect(header).toBeDefined();
      expect(isHeader(header!)).toBe(true);
      expect(group.label).toBe(`${header!.code} — ${header!.name}`);
      for (const option of group.options) {
        expect(option.parentCode).toBe(group.headerCode);
      }
    }
  });

  it('keeps an orphan whose parent is not a header rather than dropping it', () => {
    const orphan: PickerAccount = {
      id: 'x',
      code: '9998',
      name: 'Orphaned',
      subtype: null,
      parentCode: '9999', // names nothing in the chart
    };
    const offered = classifyPickerGroups([...chart, orphan]).flatMap((g) => g.options);
    expect(offered.find((o) => o.code === '9998')).toBeDefined();
  });

  it('puts a parentless posting account in the ungrouped bucket, not under a header', () => {
    const groups = classifyPickerGroups(chart);
    const ungrouped = groups.find((g) => g.headerCode === null);
    expect(ungrouped).toBeDefined();
    for (const option of ungrouped!.options) {
      expect(option.parentCode).toBeNull();
    }
  });
});
