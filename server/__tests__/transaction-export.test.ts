import { describe, it, expect } from 'vitest';
import {
  serializeCsv,
  serializeOfx,
  buildAccountMap,
  contentTypeForFormat,
  fileExtension,
  type ExportTransaction,
  type ExportAccount,
} from '../lib/transaction-export';

function makeAccount(overrides: Partial<ExportAccount> = {}): ExportAccount {
  return {
    id: 'acct-1',
    name: 'Mercury Checking',
    type: 'checking',
    institution: 'Mercury',
    accountNumber: '4567',
    currency: 'USD',
    ...overrides,
  };
}

function makeTx(overrides: Partial<ExportTransaction> = {}): ExportTransaction {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    accountId: 'acct-1',
    amount: '1500.00',
    type: 'income',
    category: 'rent',
    description: 'June rent payment',
    date: '2025-06-15T00:00:00.000Z',
    payee: 'Tenant A',
    reconciled: true,
    currency: 'USD',
    ...overrides,
  };
}

describe('transaction-export', () => {
  describe('serializeCsv', () => {
    it('produces valid CSV with headers', () => {
      const accounts = [makeAccount()];
      const accountMap = buildAccountMap(accounts);
      const transactions = [makeTx()];

      const csv = serializeCsv(transactions, accountMap);
      const lines = csv.trim().split('\r\n');

      expect(lines[0]).toBe('Date,Amount,Type,Category,Description,Payee,Account,Reconciled,Currency,Transaction ID');
      expect(lines).toHaveLength(2);
    });

    it('formats date as YYYY-MM-DD', () => {
      const accountMap = buildAccountMap([makeAccount()]);
      const csv = serializeCsv([makeTx()], accountMap);
      const dataLine = csv.trim().split('\r\n')[1];

      expect(dataLine).toMatch(/^2025-06-15,/);
    });

    it('escapes commas and quotes in fields', () => {
      const accountMap = buildAccountMap([makeAccount()]);
      const tx = makeTx({ description: 'Payment for "unit 3", floor 2' });
      const csv = serializeCsv([tx], accountMap);

      expect(csv).toContain('"Payment for ""unit 3"", floor 2"');
    });

    it('handles missing optional fields', () => {
      const accountMap = buildAccountMap([makeAccount()]);
      const tx = makeTx({ category: null, payee: null });
      const csv = serializeCsv([tx], accountMap);
      const dataLine = csv.trim().split('\r\n')[1];
      const fields = dataLine.split(',');

      // Category (index 3) and Payee (index 5) should be empty
      expect(fields[3]).toBe('');
      expect(fields[5]).toBe('');
    });

    it('handles multiple transactions', () => {
      const accountMap = buildAccountMap([makeAccount()]);
      const transactions = [
        makeTx({ id: 'tx-1', amount: '1000' }),
        makeTx({ id: 'tx-2', amount: '2000' }),
        makeTx({ id: 'tx-3', amount: '-500', type: 'expense' }),
      ];

      const csv = serializeCsv(transactions, accountMap);
      const lines = csv.trim().split('\r\n');
      expect(lines).toHaveLength(4); // header + 3 data rows
    });

    it('resolves account name from map', () => {
      const accounts = [makeAccount({ id: 'acct-1', name: 'Main Checking' })];
      const accountMap = buildAccountMap(accounts);
      const csv = serializeCsv([makeTx({ accountId: 'acct-1' })], accountMap);

      expect(csv).toContain('Main Checking');
    });
  });

  describe('serializeOfx', () => {
    it('produces valid OFX with headers', () => {
      const account = makeAccount();
      const ofx = serializeOfx({
        format: 'ofx',
        account,
        transactions: [makeTx()],
        startDate: '2025-06-01',
        endDate: '2025-06-30',
      });

      expect(ofx).toContain('OFXHEADER:100');
      expect(ofx).toContain('VERSION:102');
      expect(ofx).toContain('<OFX>');
      expect(ofx).toContain('</OFX>');
      expect(ofx).not.toContain('INTUIT.BID');
    });

    it('QFX includes INTUIT.BID header', () => {
      const account = makeAccount();
      const qfx = serializeOfx({
        format: 'qfx',
        account,
        transactions: [makeTx()],
        startDate: '2025-06-01',
        endDate: '2025-06-30',
      });

      expect(qfx).toContain('INTUIT.BID:10003');
    });

    it('formats transaction amounts with 2 decimals', () => {
      const account = makeAccount();
      const ofx = serializeOfx({
        format: 'ofx',
        account,
        transactions: [makeTx({ amount: '1500.50' })],
        startDate: '2025-06-01',
        endDate: '2025-06-30',
      });

      expect(ofx).toContain('<TRNAMT>1500.50');
    });

    it('maps income to CREDIT and expense to DEBIT', () => {
      const account = makeAccount();
      const ofx = serializeOfx({
        format: 'ofx',
        account,
        transactions: [
          makeTx({ id: 'tx-1', amount: '1000', type: 'income' }),
          makeTx({ id: 'tx-2', amount: '-500', type: 'expense' }),
        ],
        startDate: '2025-06-01',
        endDate: '2025-06-30',
      });

      expect(ofx).toContain('<TRNTYPE>CREDIT');
      expect(ofx).toContain('<TRNTYPE>DEBIT');
    });

    it('maps transfer type to XFER', () => {
      const account = makeAccount();
      const ofx = serializeOfx({
        format: 'ofx',
        account,
        transactions: [makeTx({ type: 'transfer' })],
        startDate: '2025-06-01',
        endDate: '2025-06-30',
      });

      expect(ofx).toContain('<TRNTYPE>XFER');
    });

    it('includes account type and ID', () => {
      const account = makeAccount({ type: 'savings', accountNumber: '9876' });
      const ofx = serializeOfx({
        format: 'ofx',
        account,
        transactions: [],
        startDate: '2025-06-01',
        endDate: '2025-06-30',
      });

      expect(ofx).toContain('<ACCTTYPE>SAVINGS');
      expect(ofx).toContain('<ACCTID>9876');
    });

    it('escapes special characters in text fields', () => {
      const account = makeAccount();
      const ofx = serializeOfx({
        format: 'ofx',
        account,
        transactions: [makeTx({ description: 'A & B <test>' })],
        startDate: '2025-06-01',
        endDate: '2025-06-30',
      });

      expect(ofx).toContain('A &amp; B &lt;test&gt;');
    });

    it('formats dates as OFX date strings (YYYYMMDDHHMMSS)', () => {
      const account = makeAccount();
      const ofx = serializeOfx({
        format: 'ofx',
        account,
        transactions: [makeTx({ date: '2025-06-15T00:00:00.000Z' })],
        startDate: '2025-06-01',
        endDate: '2025-06-30',
      });

      expect(ofx).toContain('<DTPOSTED>20250615000000');
      expect(ofx).toContain('<DTSTART>20250601');
      expect(ofx).toContain('<DTEND>20250630');
    });

    it('uses account currency', () => {
      const account = makeAccount({ currency: 'COP' });
      const ofx = serializeOfx({
        format: 'ofx',
        account,
        transactions: [],
        startDate: '2025-06-01',
        endDate: '2025-06-30',
      });

      expect(ofx).toContain('<CURDEF>COP');
    });
  });

  describe('helpers', () => {
    it('buildAccountMap creates lookup by id', () => {
      const accounts = [
        makeAccount({ id: 'a1' }),
        makeAccount({ id: 'a2', name: 'Savings' }),
      ];
      const map = buildAccountMap(accounts);

      expect(map.size).toBe(2);
      expect(map.get('a1')?.name).toBe('Mercury Checking');
      expect(map.get('a2')?.name).toBe('Savings');
    });

    it('contentTypeForFormat returns correct MIME types', () => {
      expect(contentTypeForFormat('csv')).toBe('text/csv; charset=utf-8');
      expect(contentTypeForFormat('ofx')).toBe('application/x-ofx');
      expect(contentTypeForFormat('qfx')).toBe('application/x-qfx');
    });

    it('fileExtension matches format', () => {
      expect(fileExtension('csv')).toBe('csv');
      expect(fileExtension('ofx')).toBe('ofx');
      expect(fileExtension('qfx')).toBe('qfx');
    });
  });
});
