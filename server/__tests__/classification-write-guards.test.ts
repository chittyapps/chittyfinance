import { describe, it, expect } from 'vitest';
import {
  ClassificationError,
  canWriteReconciled,
  selectClassificationAction,
  diagnoseBlockedClassification,
} from '../storage/system';

// Pure trust-path decisions used by SystemStorage.classifyTransaction.
// The SQL side is validated against a Neon branch (see PR body).

describe('canWriteReconciled', () => {
  it.each([
    ['L0', false],
    ['L1', false],
    ['L2', false],
    ['L3', true],
    ['L4', true],
    ['', false],
    ['l3', false],
  ])('%s -> %s', (level, expected) => {
    expect(canWriteReconciled(level)).toBe(expected);
  });
});

describe('selectClassificationAction', () => {
  it('first suggestion is "suggest"', () => {
    expect(selectClassificationAction(true, null, null)).toBe('suggest');
  });
  it('replacing a suggestion is "re-suggest"', () => {
    expect(selectClassificationAction(true, '5070', null)).toBe('re-suggest');
  });
  it('suggestions ignore the authoritative code', () => {
    expect(selectClassificationAction(true, null, '5070')).toBe('suggest');
  });
  it('first authoritative write is "classify"', () => {
    expect(selectClassificationAction(false, '5070', null)).toBe('classify');
  });
  it('overwriting coa_code is "reclassify"', () => {
    expect(selectClassificationAction(false, null, '5070')).toBe('reclassify');
  });
});

describe('diagnoseBlockedClassification', () => {
  it('missing row -> transaction_not_found', () => {
    expect(diagnoseBlockedClassification(undefined, 'L2')).toBe('transaction_not_found');
    expect(diagnoseBlockedClassification(undefined, 'L4')).toBe('transaction_not_found');
  });
  it('reconciled row blocks L0-L2', () => {
    for (const level of ['L0', 'L1', 'L2']) {
      expect(diagnoseBlockedClassification({ reconciled: true }, level)).toBe('reconciled_locked');
    }
  });
  it('reconciled row is not a lock for L3/L4, so a blocked write is a conflict', () => {
    expect(diagnoseBlockedClassification({ reconciled: true }, 'L3')).toBe('conflict');
    expect(diagnoseBlockedClassification({ reconciled: true }, 'L4')).toBe('conflict');
  });
  it('unreconciled row that did not match -> conflict (previous value changed)', () => {
    expect(diagnoseBlockedClassification({ reconciled: false }, 'L1')).toBe('conflict');
    expect(diagnoseBlockedClassification({ reconciled: false }, 'L2')).toBe('conflict');
  });
  it('codes are valid ClassificationError codes', () => {
    const err = new ClassificationError(diagnoseBlockedClassification({ reconciled: false }, 'L2'), 'x');
    expect(err.code).toBe('conflict');
  });
});
