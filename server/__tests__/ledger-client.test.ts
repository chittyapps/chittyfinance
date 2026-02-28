/**
 * Ledger client tests — mocked fetch, no real network calls
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postLedgerEntry, resolveLedgerBase, logToLedger } from '../lib/ledger-client';

const MOCK_RESPONSE = { id: 'uuid-1', sequenceNumber: '42', hash: 'abc123def456' };

describe('ledger-client', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolveLedgerBase', () => {
    it('prefers CHITTY_LEDGER_BASE env override', async () => {
      const base = await resolveLedgerBase({ CHITTY_LEDGER_BASE: 'https://custom-ledger.example.com/' });
      expect(base).toBe('https://custom-ledger.example.com');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('falls back to hardcoded URL when registry fails', async () => {
      fetchSpy.mockRejectedValue(new Error('network'));
      const base = await resolveLedgerBase({});
      expect(base).toBe('https://ledger.chitty.cc');
    });
  });

  describe('postLedgerEntry', () => {
    const env = { CHITTY_LEDGER_BASE: 'https://ledger.chitty.cc', CHITTY_AUTH_SERVICE_TOKEN: 'tok-123' };

    it('sends correct envelope to POST /api/entries', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(MOCK_RESPONSE), { status: 200 }));

      const result = await postLedgerEntry({
        entityType: 'transaction',
        entityId: 'prop-1',
        action: 'property.created',
      }, env);

      expect(result).toEqual(MOCK_RESPONSE);
      expect(fetchSpy).toHaveBeenCalledOnce();

      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://ledger.chitty.cc/api/entries');
      expect(opts.method).toBe('POST');

      const body = JSON.parse(opts.body);
      expect(body.entityType).toBe('transaction');
      expect(body.entityId).toBe('prop-1');
      expect(body.action).toBe('property.created');
      expect(body.actor).toBe('service:finance.chitty.cc');
      expect(body.actorType).toBe('service');

      expect(opts.headers['Authorization']).toBe('Bearer tok-123');
      expect(opts.headers['X-Source-Service']).toBe('finance.chitty.cc');
    });

    it('defaults actor to service:finance.chitty.cc when omitted', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(MOCK_RESPONSE), { status: 200 }));
      await postLedgerEntry({ entityType: 'audit', action: 'test' }, env);

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.actor).toBe('service:finance.chitty.cc');
      expect(body.actorType).toBe('service');
    });

    it('preserves custom actor when provided', async () => {
      fetchSpy.mockResolvedValue(new Response(JSON.stringify(MOCK_RESPONSE), { status: 200 }));
      await postLedgerEntry({
        entityType: 'audit',
        action: 'test',
        actor: 'user:nicholas',
        actorType: 'user',
      }, env);

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.actor).toBe('user:nicholas');
      expect(body.actorType).toBe('user');
    });

    it('returns null on HTTP error without throwing', async () => {
      fetchSpy.mockResolvedValue(new Response('', { status: 500 }));
      const result = await postLedgerEntry({ entityType: 'audit', action: 'test' }, env);
      expect(result).toBeNull();
    });

    it('returns null on network error without throwing', async () => {
      fetchSpy.mockRejectedValue(new Error('fetch failed'));
      const result = await postLedgerEntry({ entityType: 'audit', action: 'test' }, env);
      expect(result).toBeNull();
    });
  });

  describe('logToLedger', () => {
    it('does not throw even on failure', async () => {
      fetchSpy.mockRejectedValue(new Error('fail'));
      await expect(logToLedger(
        { entityType: 'audit', action: 'test' },
        { CHITTY_LEDGER_BASE: 'https://ledger.chitty.cc' },
      )).resolves.toBeUndefined();
    });
  });
});
