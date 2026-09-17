import { describe, it, expect } from 'vitest';
import {
  L2_ROLES,
  L4_ROLES,
  confidenceSchema,
  hasClassificationAuthority,
  hasCoaAuthority,
} from '../lib/classification-policy';

// Role sets and input parsing for the classification trust path (no mocks —
// these are pure).

describe('hasClassificationAuthority (L2: coa_code + reconciled state)', () => {
  it.each(['owner', 'admin', 'manager'])('allows %s', (role) => {
    expect(hasClassificationAuthority(role)).toBe(true);
  });

  it('denies viewer — the default role in tenant_users', () => {
    expect(hasClassificationAuthority('viewer')).toBe(false);
  });

  it.each([null, undefined, '', 'Owner', 'OWNER', 'guest', 'member'])('denies %s', (role) => {
    expect(hasClassificationAuthority(role as any)).toBe(false);
  });
});

describe('hasCoaAuthority (L4: Chart of Accounts)', () => {
  it.each(['owner', 'admin'])('allows %s', (role) => {
    expect(hasCoaAuthority(role)).toBe(true);
  });

  it('denies manager — managers classify but do not govern the COA', () => {
    expect(hasCoaAuthority('manager')).toBe(false);
  });

  it.each(['viewer', null, undefined, 'admin '])('denies %s', (role) => {
    expect(hasCoaAuthority(role as any)).toBe(false);
  });

  it('L4 is a strict subset of L2', () => {
    for (const role of L4_ROLES) expect(L2_ROLES.has(role)).toBe(true);
    expect(L2_ROLES.size).toBeGreaterThan(L4_ROLES.size);
  });
});

describe('confidenceSchema (column is decimal(4,3))', () => {
  it.each([
    [0, '0.000'],
    [1, '1.000'],
    [0.7, '0.700'],
    [0.1234, '0.123'],
    ['0.700', '0.700'],
    ['1', '1.000'],
    [' 0.95 ', '0.950'],
  ])('accepts %p -> %p', (input, expected) => {
    const parsed = confidenceSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toBe(expected);
  });

  it.each(['abc', '12', 12, -0.5, 1.5, '', '0.7.1', NaN, Infinity, null, {}])(
    'rejects %p',
    (input) => {
      expect(confidenceSchema.safeParse(input).success).toBe(false);
    },
  );

  it('always produces 3 decimal places, so the decimal(4,3) column never overflows', () => {
    for (const n of [0, 0.5, 0.999, 1]) {
      const parsed = confidenceSchema.parse(n);
      expect(parsed).toMatch(/^[01]\.\d{3}$/);
      expect(Number(parsed)).toBeLessThanOrEqual(1);
    }
  });
});
