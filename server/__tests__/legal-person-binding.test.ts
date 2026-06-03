/**
 * Tests for the Path B legal_person_chittyid binding helpers.
 *
 * Pure unit tests — no DB, no mocks. Exercises the real helper code that
 * the Mercury webhook write path calls into.
 */
import { describe, it, expect } from 'vitest';
import {
  isLegalPersonChittyId,
  getLegalPersonChittyId,
  setLegalPersonChittyId,
  checkLegalPersonBinding,
  LEGAL_PERSON_METADATA_KEY,
} from '../lib/legal-person-binding';

// Real-shaped ChittyIDs (VV-G-LLL-SSSS-T-YM-C-X). Type position is the 5th group.
const LEGAL_PERSON_ID = 'US-1-LLC-A1B2-P-26-3-Z'; // T = P (Person), Legal subtype implied upstream
const LOCATION_ID = 'US-1-LLC-A1B2-L-26-3-Z'; // T = L
const THING_ID = 'US-1-LLC-A1B2-T-26-3-Z'; // T = T

describe('isLegalPersonChittyId', () => {
  it('accepts a well-formed P-type ChittyID', () => {
    expect(isLegalPersonChittyId(LEGAL_PERSON_ID)).toBe(true);
  });
  it('rejects non-Person types (L, T, E, A)', () => {
    expect(isLegalPersonChittyId(LOCATION_ID)).toBe(false);
    expect(isLegalPersonChittyId(THING_ID)).toBe(false);
  });
  it('rejects malformed strings', () => {
    expect(isLegalPersonChittyId('')).toBe(false);
    expect(isLegalPersonChittyId('not-a-chittyid')).toBe(false);
    expect(isLegalPersonChittyId('US-1-LLC-A1B2-P-26-3')).toBe(false); // too short
    expect(isLegalPersonChittyId(null)).toBe(false);
    expect(isLegalPersonChittyId(undefined)).toBe(false);
    expect(isLegalPersonChittyId(42)).toBe(false);
  });
});

describe('getLegalPersonChittyId / setLegalPersonChittyId', () => {
  it('returns null when metadata is absent or missing the key', () => {
    expect(getLegalPersonChittyId(null)).toBeNull();
    expect(getLegalPersonChittyId(undefined)).toBeNull();
    expect(getLegalPersonChittyId({ metadata: null })).toBeNull();
    expect(getLegalPersonChittyId({ metadata: {} })).toBeNull();
    expect(getLegalPersonChittyId({ metadata: { other: 'x' } })).toBeNull();
  });

  it('reads the binding when present', () => {
    const account = { metadata: { [LEGAL_PERSON_METADATA_KEY]: LEGAL_PERSON_ID, other: 'kept' } };
    expect(getLegalPersonChittyId(account)).toBe(LEGAL_PERSON_ID);
  });

  it('setLegalPersonChittyId is pure and preserves other metadata', () => {
    const original = { existing: 'value' };
    const next = setLegalPersonChittyId(original, LEGAL_PERSON_ID);
    expect(next).toEqual({ existing: 'value', [LEGAL_PERSON_METADATA_KEY]: LEGAL_PERSON_ID });
    expect(original).toEqual({ existing: 'value' }); // unmutated
  });

  it('setLegalPersonChittyId handles null/undefined metadata', () => {
    expect(setLegalPersonChittyId(null, LEGAL_PERSON_ID)).toEqual({
      [LEGAL_PERSON_METADATA_KEY]: LEGAL_PERSON_ID,
    });
    expect(setLegalPersonChittyId(undefined, LEGAL_PERSON_ID)).toEqual({
      [LEGAL_PERSON_METADATA_KEY]: LEGAL_PERSON_ID,
    });
  });

  it('setLegalPersonChittyId rejects malformed and non-Person ChittyIDs', () => {
    expect(() => setLegalPersonChittyId({}, 'bogus')).toThrow(/Invalid Legal Person ChittyID/);
    expect(() => setLegalPersonChittyId({}, LOCATION_ID)).toThrow(/Invalid Legal Person ChittyID/);
  });

  it('round-trip: set then get yields the original ID', () => {
    const next = setLegalPersonChittyId({ other: 1 }, LEGAL_PERSON_ID);
    expect(getLegalPersonChittyId({ metadata: next })).toBe(LEGAL_PERSON_ID);
  });
});

describe('checkLegalPersonBinding (runtime reconciliation flag)', () => {
  const tenantId = '00000000-0000-0000-0000-000000000abc';

  it('returns null when Mercury account has a valid binding', () => {
    const flag = checkLegalPersonBinding({
      source: 'mercury',
      tenantId,
      accountId: 'acct-1',
      externalId: 'mercury:abc',
      metadata: { [LEGAL_PERSON_METADATA_KEY]: LEGAL_PERSON_ID },
    });
    expect(flag).toBeNull();
  });

  it('returns a structured flag when Mercury binding is missing', () => {
    const flag = checkLegalPersonBinding({
      source: 'mercury',
      tenantId,
      accountId: 'acct-1',
      externalId: 'mercury:abc',
      metadata: null,
    });
    expect(flag).not.toBeNull();
    expect(flag).toMatchObject({
      code: 'missing_legal_person_chittyid',
      severity: 'reconciliation',
      source: 'mercury',
      tenantId,
      accountId: 'acct-1',
      externalId: 'mercury:abc',
    });
    expect(flag!.message).toMatch(/Path B/);
  });

  it('flags an invalid (non-P) ChittyID in metadata as missing', () => {
    const flag = checkLegalPersonBinding({
      source: 'mercury',
      tenantId,
      metadata: { [LEGAL_PERSON_METADATA_KEY]: LOCATION_ID },
    });
    expect(flag).not.toBeNull();
    expect(flag!.code).toBe('missing_legal_person_chittyid');
  });

  it('does NOT throw — partial enforcement per contract', () => {
    // The whole point of returning a flag instead of throwing: webhook
    // ingestion must continue, reconciliation reports surface the gap.
    expect(() =>
      checkLegalPersonBinding({ source: 'mercury', tenantId, metadata: null }),
    ).not.toThrow();
  });

  it('returns null for non-Mercury sources (Wave/Stripe not bound today)', () => {
    expect(checkLegalPersonBinding({ source: 'wave', tenantId, metadata: null })).toBeNull();
    expect(checkLegalPersonBinding({ source: 'stripe', tenantId, metadata: null })).toBeNull();
    expect(checkLegalPersonBinding({ source: 'unknown', tenantId, metadata: null })).toBeNull();
  });
});
