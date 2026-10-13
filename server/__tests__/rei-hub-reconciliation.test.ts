import { describe, expect, it } from 'vitest';
import {
  buildReiHubReconciliationPlan,
  parseReiHubBookedTransactions,
  type ReiHubSnapshot,
} from '../books/rei-hub-reconciliation';

const snapshot: ReiHubSnapshot = {
  source: 'rei-hub',
  snapshotSha256: 'abc123',
  bookedTransactions: {
    headers: ['Account', 'Date', 'Description', 'Debit', 'Credit', 'Property', 'Vendor'],
    rows: [
      ['Repairs', '10/01/2026', 'HOME DEPOT 1234', '125.50', '', 'City Studio', 'Home Depot'],
      ['Rent', '10/02/2026', 'October rent PAYMENT #123', '', '2450.00', 'City Studio', 'Tenant A'],
      ['Repairs', '01/01/1970', 'Bad epoch row', '10.00', '', 'City Studio', '(inactive) Old Vendor'],
    ],
  },
};

describe('REI Hub reconciliation planner', () => {
  it('parses debit/credit rows and records source-quality flags', () => {
    const parsed = parseReiHubBookedTransactions(snapshot);

    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0].amount).toBe(-125.5);
    expect(parsed.rows[1].amount).toBe(2450);
    expect(parsed.qualityFlags.join('\n')).toContain('epoch date 1970-01-01');
    expect(parsed.qualityFlags.join('\n')).toContain('inactive vendor/payee marker');
  });

  it('matches existing transactions and proposes property plus L1 classification repairs', () => {
    const plan = buildReiHubReconciliationPlan(
      snapshot,
      [
        {
          id: 'tx-1',
          date: new Date('2026-10-01T12:00:00Z'),
          amount: '-125.50',
          description: 'HOME DEPOT 1234',
          payee: 'Home Depot',
          propertyId: null,
          coaCode: null,
          suggestedCoaCode: '9010',
          reconciled: false,
          type: 'expense',
        },
        {
          id: 'tx-2',
          date: new Date('2026-10-02T12:00:00Z'),
          amount: '2450',
          description: 'October rent PAYMENT #123',
          payee: 'Tenant A',
          propertyId: 'property-city',
          coaCode: '4000',
          reconciled: false,
          type: 'income',
        },
      ],
      [
        { id: 'property-city', name: 'City Studio', address: '550 W Surf St C211' },
      ],
    );

    expect(plan.matchedRows).toBe(2);
    expect(plan.unmatchedSourceRows).toHaveLength(1);

    const first = plan.matches.find((match) => match.transactionId === 'tx-1');
    expect(first?.discrepancies).toContain('property_missing');
    expect(first?.actions.some((action) => action.kind === 'assign_property')).toBe(true);
    expect(first?.actions.some((action) => action.kind === 'suggest_classification')).toBe(true);

    const rent = plan.matches.find((match) => match.transactionId === 'tx-2');
    expect(rent?.actions.some((action) => action.kind === 'assign_property')).toBe(false);
  });

  it('never proposes automatic mutation for a reconciled conflicting row', () => {
    const plan = buildReiHubReconciliationPlan(
      {
        ...snapshot,
        bookedTransactions: {
          headers: snapshot.bookedTransactions.headers,
          rows: [snapshot.bookedTransactions.rows[0]],
        },
      },
      [{
        id: 'tx-locked',
        date: new Date('2026-10-01T12:00:00Z'),
        amount: '-125.50',
        description: 'HOME DEPOT 1234',
        payee: 'Home Depot',
        propertyId: null,
        coaCode: '9010',
        reconciled: true,
        type: 'expense',
      }],
      [{ id: 'property-city', name: 'City Studio', address: '550 W Surf St C211' }],
    );

    const actions = plan.matches[0].actions;
    expect(actions.some((action) => action.kind === 'review_reconciled')).toBe(true);
    expect(actions.some((action) => action.method === 'PATCH')).toBe(false);
    expect(actions.some((action) => action.method === 'POST')).toBe(false);
  });
});
