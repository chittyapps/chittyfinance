import { describe, it, expect } from 'vitest';
import { normalizeAmazonEntity, classifyAmazonItem } from '../books/import';
import { getAccountByCode } from '../../database/chart-of-accounts';

/**
 * These exercise the real functions against the real chart of accounts -- no
 * mocks, no fixtures standing in for the COA. The assertions are written to
 * fail if the fail-closed behaviour regresses to guessing, which is the whole
 * point of the routing rules under test.
 */

describe('normalizeAmazonEntity — cost center routing', () => {
  it('routes a recognized cost center to its entity', () => {
    const r = normalizeAmazonEntity('', '', '', 'COZY-CASTLE');
    expect(r).toEqual({ entity: 'cozy-castle', personalUse: false, method: 'cost-center' });
  });

  it('folds case, spaces, underscores and unicode dashes onto the same key', () => {
    for (const variant of ['cozy castle', 'Cozy_Castle', ' COZY–CASTLE ', 'cozy  -  castle']) {
      const r = normalizeAmazonEntity('', '', '', variant);
      expect(r.entity, `variant ${JSON.stringify(variant)}`).toBe('cozy-castle');
      expect(r.method, `variant ${JSON.stringify(variant)}`).toBe('cost-center');
    }
  });

  it('sends an UNRECOGNIZED cost center to suspense instead of guessing from the PO', () => {
    // 'surf 504' alone would route to cozy-castle via the heuristics. The
    // presence of a cost center we do not understand must suppress that guess.
    const heuristicOnly = normalizeAmazonEntity('surf 504', '', '');
    expect(heuristicOnly.entity).toBe('cozy-castle');

    const withUnknownCc = normalizeAmazonEntity('surf 504', '', '', 'MORADA-MAMI');
    expect(withUnknownCc.entity).toBe('suspense');
    expect(withUnknownCc.method).toBe('cost-center-unrecognized');
  });

  it('fails closed for every unrecognized cost center, not just one sample', () => {
    // Each of these would otherwise be routed by the PO heuristics to
    // cozy-castle. None may reach a real entity.
    const unrecognized = ['MORADA-MAMI', 'BEACH-HOUSE', 'VILLA VISTA', 'general ledger', '9999', 'x'];
    for (const cc of unrecognized) {
      const r = normalizeAmazonEntity('surf 504', '', '', cc);
      expect(r.entity, `cost center ${JSON.stringify(cc)}`).toBe('suspense');
      expect(r.method, `cost center ${JSON.stringify(cc)}`).toBe('cost-center-unrecognized');
    }
  });

  it('treats separator-only cost centers as unrecognized rather than as absent', () => {
    // These fold to an empty key. Absent would mean "use the heuristics";
    // present-but-meaningless must mean "ask a human".
    for (const cc of ['---', '___', '- - -', '\u2014\u2014']) {
      const r = normalizeAmazonEntity('surf 504', '', '', cc);
      expect(r.entity, `cost center ${JSON.stringify(cc)}`).toBe('suspense');
      expect(r.method, `cost center ${JSON.stringify(cc)}`).toBe('cost-center-unrecognized');
    }
  });

  it('leaves no cost-center key shadowed by a collision', () => {
    // A key that collides with an earlier one after folding becomes
    // unreachable, which would route that property's spend to whichever entity
    // won. Every documented key must still resolve via the cost-center path.
    // The index also throws at module load on collision, so importing this
    // module at all exercises that guard.
    for (const cc of ['COZY-CASTLE', 'CITY-STUDIO', 'APT-ARLENE', 'LAKESIDE-LOFT', 'GENERAL', 'PERSONAL']) {
      const r = normalizeAmazonEntity('', '', '', cc);
      expect(r.method, `key ${cc}`).toBe('cost-center');
      expect(r.entity, `key ${cc}`).not.toBe('suspense');
    }
  });

  it('treats an absurdly long cost center as unrecognized rather than parsing it', () => {
    const r = normalizeAmazonEntity('surf 504', '', '', 'X'.repeat(500));
    expect(r.entity).toBe('suspense');
    expect(r.method).toBe('cost-center-unrecognized');
  });

  it('refuses to let a cost center flip personal spend into business spend', () => {
    // Account group 'personal' is an unambiguous personal signal.
    const heuristicOnly = normalizeAmazonEntity('', 'Personal', '');
    expect(heuristicOnly).toMatchObject({ entity: 'personal-nick', personalUse: true });

    const flipped = normalizeAmazonEntity('', 'Personal', '', 'COZY-CASTLE');
    expect(flipped.entity).toBe('suspense');
    expect(flipped.personalUse).toBe(true);
    expect(flipped.method).toBe('cost-center-conflict');
  });

  it('allows the business -> personal direction, which is not the risky one', () => {
    const r = normalizeAmazonEntity('surf 504', '', '', 'PERSONAL');
    expect(r).toEqual({ entity: 'personal-nick', personalUse: true, method: 'cost-center' });
  });

  it('falls back to the heuristics when no cost center is supplied', () => {
    const r = normalizeAmazonEntity('surf 504', '', '', '');
    expect(r).toEqual({ entity: 'cozy-castle', personalUse: false, method: 'heuristic' });
  });
});

describe('classifyAmazonItem — GL code passthrough', () => {
  it('honors a GL code that exists in the chart of accounts', () => {
    expect(getAccountByCode('5020')).toBeDefined();
    const r = classifyAmazonItem('', false, '', '5020');
    expect(r).toEqual({ code: '5020', confidence: 0.850, method: 'gl-code' });
  });

  it('never claims certainty for an operator-typed GL code', () => {
    // A COA-validated GL code DOES clear the bulk-accept gate
    // (client/src/pages/Classification.tsx, >= 0.80, capped at $500) and that
    // is intended -- it matches what the Mercury CSV path does with the same
    // class of input. What it must never do is claim 1.000, which asserts a
    // certainty a hand-typed spreadsheet column cannot carry and which would
    // survive any future tightening of the gate below 1.
    const r = classifyAmazonItem('', false, '', '5020');
    expect(r.confidence).toBeLessThan(1);
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('does not let a rejected GL code auto-approve on the keyword fallback', () => {
    // The contract that matters is the confidence, not which code we land on:
    // a row whose operator instruction we threw away must not then be
    // bulk-accepted on a guess.
    const r = classifyAmazonItem('', false, 'cleaning / maintenance supplie', '4242');
    expect(r.method).toBe('gl-code-rejected');
    expect(r.confidence).toBeLessThan(0.8);
  });

  it('rejects a well-formed GL code that is not in the chart of accounts', () => {
    expect(getAccountByCode('4242')).toBeUndefined();
    const r = classifyAmazonItem('', false, 'cleaning / maintenance supplie', '4242');
    expect(r.code).not.toBe('4242');
    expect(r.method).toBe('gl-code-rejected');
    // and it still classifies by keyword rather than dropping the row
    expect(r.code).toBe('5020');
  });

  it('rejects a malformed GL code', () => {
    for (const bad of ['50', '50200', 'ABCD', '50a0', ' ']) {
      const r = classifyAmazonItem('', false, '', bad);
      expect(r.code, `bad code ${JSON.stringify(bad)}`).toBe('9010');
    }
  });

  it('marks keyword classification as such when no GL code is supplied', () => {
    const r = classifyAmazonItem('', false, 'furnishings and decor', '');
    expect(r).toEqual({ code: '5080', confidence: 0.65, method: 'keyword' });
  });
});
