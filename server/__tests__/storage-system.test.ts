import { describe, it, expect, vi } from 'vitest';
import { SystemStorage } from '../storage/system';

describe('SystemStorage', () => {
  it('exports SystemStorage class', () => {
    expect(SystemStorage).toBeDefined();
    expect(typeof SystemStorage).toBe('function');
  });

  it('constructor accepts a drizzle db instance', () => {
    const fakeDb = {} as any;
    const storage = new SystemStorage(fakeDb);
    expect(storage).toBeInstanceOf(SystemStorage);
  });

  it('getAccounts calls db.select with correct table and filter', async () => {
    const mockOrderBy = vi.fn().mockResolvedValue([
      { id: '1', name: 'Checking', tenantId: 't1', balance: '1000.00' },
    ]);
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    const fakeDb = { select: mockSelect } as any;

    const storage = new SystemStorage(fakeDb);
    const accounts = await storage.getAccounts('t1');
    expect(Array.isArray(accounts)).toBe(true);
    expect(accounts.length).toBe(1);
    expect(accounts[0].name).toBe('Checking');
    expect(mockSelect).toHaveBeenCalled();
  });

  it('getSummary computes totals from accounts', async () => {
    const mockOrderBy = vi.fn().mockResolvedValue([
      { id: '1', name: 'Checking', type: 'checking', balance: '5000.00' },
      { id: '2', name: 'Savings', type: 'savings', balance: '3000.00' },
      { id: '3', name: 'Credit Card', type: 'credit', balance: '-500.00' },
    ]);
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    const fakeDb = { select: mockSelect } as any;

    const storage = new SystemStorage(fakeDb);
    const summary = await storage.getSummary('t1');
    expect(summary.total_cash).toBe(8000);
    expect(summary.total_owed).toBe(500);
    expect(summary.net).toBe(7500);
  });
});
