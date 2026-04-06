import { describe, it, expect } from 'vitest';
import {
  runAllocations,
  computePeriodBounds,
  validateAllocationRule,
  type AllocationRuleInput,
  type AllocationTransaction,
} from '../lib/allocation-engine';

// ── Helpers ──

function makeRule(overrides: Partial<AllocationRuleInput> = {}): AllocationRuleInput {
  return {
    id: 'rule-1',
    name: 'Test Rule',
    ruleType: 'management_fee',
    sourceTenantId: 'tenant-a',
    targetTenantId: 'tenant-b',
    percentage: '10',
    fixedAmount: null,
    frequency: 'monthly',
    sourceCategory: null,
    allocationMethod: 'percentage',
    metadata: null,
    ...overrides,
  };
}

function makeTx(overrides: Partial<AllocationTransaction> = {}): AllocationTransaction {
  return {
    id: `tx-${Math.random().toString(36).slice(2, 8)}`,
    tenantId: 'tenant-a',
    amount: '1000.00',
    type: 'income',
    category: 'rent',
    date: '2025-06-15',
    ...overrides,
  };
}

// ── Tests ──

describe('allocation-engine', () => {
  describe('runAllocations', () => {
    it('computes a simple management fee allocation', () => {
      const rules = [makeRule()];
      const transactions = [
        makeTx({ amount: '3000.00' }),
        makeTx({ amount: '2000.00' }),
      ];

      const result = runAllocations({
        rules,
        transactions,
        periodStart: '2025-06-01',
        periodEnd: '2025-06-30',
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].sourceAmount).toBe(5000);
      expect(result.results[0].allocatedAmount).toBe(500); // 10% of 5000
      expect(result.totalAllocated).toBe(500);
    });

    it('filters by source category when specified', () => {
      const rules = [makeRule({ sourceCategory: 'rent' })];
      const transactions = [
        makeTx({ amount: '3000.00', category: 'rent' }),
        makeTx({ amount: '2000.00', category: 'utilities' }),
      ];

      const result = runAllocations({
        rules,
        transactions,
        periodStart: '2025-06-01',
        periodEnd: '2025-06-30',
      });

      expect(result.results[0].sourceAmount).toBe(3000); // only rent
      expect(result.results[0].allocatedAmount).toBe(300);
    });

    it('management_fee only matches income transactions', () => {
      const rules = [makeRule({ ruleType: 'management_fee' })];
      const transactions = [
        makeTx({ amount: '3000.00', type: 'income' }),
        makeTx({ amount: '500.00', type: 'expense' }),
      ];

      const result = runAllocations({
        rules,
        transactions,
        periodStart: '2025-06-01',
        periodEnd: '2025-06-30',
      });

      expect(result.results[0].sourceAmount).toBe(3000);
      expect(result.results[0].matchedTransactionCount).toBe(1);
    });

    it('cost_sharing only matches expense transactions', () => {
      const rules = [makeRule({ ruleType: 'cost_sharing', percentage: '50' })];
      const transactions = [
        makeTx({ amount: '1000.00', type: 'expense' }),
        makeTx({ amount: '3000.00', type: 'income' }),
      ];

      const result = runAllocations({
        rules,
        transactions,
        periodStart: '2025-06-01',
        periodEnd: '2025-06-30',
      });

      expect(result.results[0].sourceAmount).toBe(1000);
      expect(result.results[0].allocatedAmount).toBe(500);
    });

    it('handles fixed amount allocations', () => {
      const rules = [makeRule({
        allocationMethod: 'fixed',
        fixedAmount: '250.00',
        percentage: null,
      })];
      const transactions = [makeTx({ amount: '10000.00' })];

      const result = runAllocations({
        rules,
        transactions,
        periodStart: '2025-06-01',
        periodEnd: '2025-06-30',
      });

      expect(result.results[0].allocatedAmount).toBe(250);
    });

    it('fixed amount runs even with zero matched transactions', () => {
      const rules = [makeRule({
        allocationMethod: 'fixed',
        fixedAmount: '100.00',
        percentage: null,
      })];

      const result = runAllocations({
        rules,
        transactions: [], // no transactions
        periodStart: '2025-06-01',
        periodEnd: '2025-06-30',
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].allocatedAmount).toBe(100);
    });

    it('skips rules with zero allocation for non-fixed methods', () => {
      const rules = [makeRule()]; // 10% of nothing
      const transactions: AllocationTransaction[] = [];

      const result = runAllocations({
        rules,
        transactions,
        periodStart: '2025-06-01',
        periodEnd: '2025-06-30',
      });

      expect(result.results).toHaveLength(0);
      expect(result.totalAllocated).toBe(0);
    });

    it('filters transactions by period', () => {
      const rules = [makeRule()];
      const transactions = [
        makeTx({ amount: '1000.00', date: '2025-06-15' }), // in period
        makeTx({ amount: '2000.00', date: '2025-05-15' }), // before period
        makeTx({ amount: '3000.00', date: '2025-07-15' }), // after period
      ];

      const result = runAllocations({
        rules,
        transactions,
        periodStart: '2025-06-01',
        periodEnd: '2025-06-30',
      });

      expect(result.results[0].sourceAmount).toBe(1000);
    });

    it('handles multiple rules across different tenants', () => {
      const rules = [
        makeRule({ id: 'r1', sourceTenantId: 'tenant-a', targetTenantId: 'tenant-mgmt', percentage: '10' }),
        makeRule({ id: 'r2', sourceTenantId: 'tenant-b', targetTenantId: 'tenant-mgmt', percentage: '10' }),
      ];
      const transactions = [
        makeTx({ tenantId: 'tenant-a', amount: '5000.00' }),
        makeTx({ tenantId: 'tenant-b', amount: '3000.00' }),
      ];

      const result = runAllocations({
        rules,
        transactions,
        periodStart: '2025-06-01',
        periodEnd: '2025-06-30',
      });

      expect(result.results).toHaveLength(2);
      expect(result.totalAllocated).toBe(800); // 500 + 300
    });

    it('rent_passthrough passes 100% of income to parent', () => {
      const rules = [makeRule({
        ruleType: 'rent_passthrough',
        percentage: '100',
        sourceTenantId: 'property-entity',
        targetTenantId: 'parent-llc',
      })];
      const transactions = [
        makeTx({ tenantId: 'property-entity', amount: '2500.00', type: 'income' }),
      ];

      const result = runAllocations({
        rules,
        transactions,
        periodStart: '2025-06-01',
        periodEnd: '2025-06-30',
      });

      expect(result.results[0].allocatedAmount).toBe(2500);
    });

    it('custom_pct includes both income and expense transactions', () => {
      const rules = [makeRule({
        ruleType: 'custom_pct',
        percentage: '25',
      })];
      const transactions = [
        makeTx({ amount: '1000.00', type: 'income' }),
        makeTx({ amount: '400.00', type: 'expense' }),
      ];

      const result = runAllocations({
        rules,
        transactions,
        periodStart: '2025-06-01',
        periodEnd: '2025-06-30',
      });

      // custom_pct uses abs(amount) for both
      expect(result.results[0].sourceAmount).toBe(1400);
      expect(result.results[0].allocatedAmount).toBe(350);
    });
  });

  describe('computePeriodBounds', () => {
    it('computes monthly bounds', () => {
      const bounds = computePeriodBounds('monthly', new Date('2025-06-15'));
      expect(bounds.periodStart).toBe('2025-06-01');
      expect(bounds.periodEnd).toBe('2025-06-30');
    });

    it('computes quarterly bounds for Q2', () => {
      const bounds = computePeriodBounds('quarterly', new Date('2025-05-10'));
      expect(bounds.periodStart).toBe('2025-04-01');
      expect(bounds.periodEnd).toBe('2025-06-30');
    });

    it('computes annual bounds', () => {
      const bounds = computePeriodBounds('annually', new Date('2025-09-01'));
      expect(bounds.periodStart).toBe('2025-01-01');
      expect(bounds.periodEnd).toBe('2025-12-31');
    });
  });

  describe('validateAllocationRule', () => {
    it('accepts a valid percentage rule', () => {
      const errors = validateAllocationRule({
        ruleType: 'management_fee',
        sourceTenantId: 'a',
        targetTenantId: 'b',
        allocationMethod: 'percentage',
        percentage: '10',
      });
      expect(errors).toHaveLength(0);
    });

    it('rejects same source and target', () => {
      const errors = validateAllocationRule({
        ruleType: 'management_fee',
        sourceTenantId: 'a',
        targetTenantId: 'a',
        allocationMethod: 'percentage',
        percentage: '10',
      });
      expect(errors).toContain('Source and target tenant cannot be the same');
    });

    it('rejects percentage outside range', () => {
      const errors = validateAllocationRule({
        ruleType: 'management_fee',
        sourceTenantId: 'a',
        targetTenantId: 'b',
        allocationMethod: 'percentage',
        percentage: '0',
      });
      expect(errors).toContain('percentage must be between 0 and 100 (exclusive of 0)');
    });

    it('rejects fixed with zero amount', () => {
      const errors = validateAllocationRule({
        ruleType: 'cost_sharing',
        sourceTenantId: 'a',
        targetTenantId: 'b',
        allocationMethod: 'fixed',
        fixedAmount: '0',
      });
      expect(errors).toContain('fixedAmount must be greater than 0');
    });

    it('rejects invalid rule type', () => {
      const errors = validateAllocationRule({
        ruleType: 'invalid_type',
        sourceTenantId: 'a',
        targetTenantId: 'b',
        allocationMethod: 'percentage',
        percentage: '10',
      });
      expect(errors).toContain('Invalid ruleType: invalid_type');
    });

    it('rejects missing required fields', () => {
      const errors = validateAllocationRule({});
      expect(errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});
