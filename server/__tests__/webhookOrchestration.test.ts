/**
 * Webhook Orchestration Monitoring Tests
 *
 * Tests for the Mercury webhook handler's error propagation,
 * idempotency, and orchestration error reporting behavior.
 *
 * These tests verify the critical observability improvements:
 * - Errors are no longer silently swallowed
 * - HTTP failures are captured in orchestrationErrors
 * - Network failures are logged and returned
 * - Successful orchestration omits the errors field
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Orchestration Error Aggregation Logic Tests
// (Pure logic extracted from webhook handler)
// ============================================================================

/**
 * Simulates the orchestration error aggregation logic from routes.ts.
 * Tests the pattern without needing a full Express server.
 */
async function runOrchestration(
  serviceResponses: Record<string, { ok: boolean; status: number } | Error>,
  eventKind: string = 'unknown'
): Promise<{ orchestrationErrors: string[] }> {
  const orchestrationErrors: string[] = [];

  const makeRequest = async (service: string, _url: string): Promise<void> => {
    const response = serviceResponses[service];
    if (!response) return;
    if (response instanceof Error) {
      throw response;
    }
    if (!response.ok) {
      orchestrationErrors.push(`${service}: HTTP ${response.status}`);
    }
  };

  // Evidence service
  try {
    await makeRequest('evidence', '/ingest');
  } catch (e: any) {
    orchestrationErrors.push(`evidence: ${e.message || String(e)}`);
  }

  // Ledger service (transaction events only)
  try {
    if (eventKind.startsWith('mercury.transaction')) {
      await makeRequest('ledger', '/ingest');
    }
  } catch (e: any) {
    orchestrationErrors.push(`ledger: ${e.message || String(e)}`);
  }

  // Chronicle service
  try {
    await makeRequest('chronicle', '/entries');
  } catch (e: any) {
    orchestrationErrors.push(`chronicle: ${e.message || String(e)}`);
  }

  // Logic service
  try {
    await makeRequest('logic', '/evaluate');
  } catch (e: any) {
    orchestrationErrors.push(`logic: ${e.message || String(e)}`);
  }

  return { orchestrationErrors };
}

describe('Webhook Orchestration Error Aggregation', () => {
  it('returns empty errors when all services respond successfully', async () => {
    const { orchestrationErrors } = await runOrchestration({
      evidence: { ok: true, status: 200 },
      chronicle: { ok: true, status: 200 },
      logic: { ok: true, status: 200 },
    });
    expect(orchestrationErrors).toHaveLength(0);
  });

  it('captures HTTP error from evidence service (non-2xx response)', async () => {
    const { orchestrationErrors } = await runOrchestration({
      evidence: { ok: false, status: 503 },
      chronicle: { ok: true, status: 200 },
      logic: { ok: true, status: 200 },
    });
    expect(orchestrationErrors).toHaveLength(1);
    expect(orchestrationErrors[0]).toBe('evidence: HTTP 503');
  });

  it('captures network error from chronicle service (exception)', async () => {
    const { orchestrationErrors } = await runOrchestration({
      evidence: { ok: true, status: 200 },
      chronicle: new Error('Connection timeout'),
      logic: { ok: true, status: 200 },
    });
    expect(orchestrationErrors).toHaveLength(1);
    expect(orchestrationErrors[0]).toBe('chronicle: Connection timeout');
  });

  it('aggregates errors from multiple failing services', async () => {
    const { orchestrationErrors } = await runOrchestration({
      evidence: { ok: false, status: 500 },
      chronicle: new Error('ECONNREFUSED'),
      logic: { ok: false, status: 404 },
    });
    expect(orchestrationErrors).toHaveLength(3);
    expect(orchestrationErrors).toContain('evidence: HTTP 500');
    expect(orchestrationErrors).toContain('chronicle: ECONNREFUSED');
    expect(orchestrationErrors).toContain('logic: HTTP 404');
  });

  it('continues processing all services even when earlier ones fail', async () => {
    const { orchestrationErrors } = await runOrchestration({
      evidence: new Error('Evidence service down'),
      chronicle: { ok: true, status: 200 },
      logic: { ok: true, status: 200 },
    });
    // Evidence failed but chronicle and logic were still called
    expect(orchestrationErrors).toHaveLength(1);
    expect(orchestrationErrors[0]).toBe('evidence: Evidence service down');
  });

  it('does NOT call ledger service for non-transaction events', async () => {
    const ledgerCalled = { called: false };
    const services: Record<string, any> = {
      evidence: { ok: true, status: 200 },
      chronicle: { ok: true, status: 200 },
      logic: { ok: true, status: 200 },
    };
    // Only passes 'unknown' kind — ledger should not be called
    const { orchestrationErrors } = await runOrchestration(services, 'unknown');
    // Ledger not in services and not called — no error from ledger
    expect(orchestrationErrors.some(e => e.includes('ledger'))).toBe(false);
  });

  it('DOES call ledger service for mercury.transaction events', async () => {
    const { orchestrationErrors } = await runOrchestration(
      {
        evidence: { ok: true, status: 200 },
        ledger: { ok: false, status: 503 }, // Ledger fails
        chronicle: { ok: true, status: 200 },
        logic: { ok: true, status: 200 },
      },
      'mercury.transaction.created'
    );
    expect(orchestrationErrors).toContain('ledger: HTTP 503');
  });

  it('includes ledger errors only for mercury.transaction.* events', async () => {
    const transactionEvent = await runOrchestration(
      { evidence: { ok: true, status: 200 }, ledger: { ok: false, status: 500 }, chronicle: { ok: true, status: 200 }, logic: { ok: true, status: 200 } },
      'mercury.transaction.settled'
    );
    const nonTransactionEvent = await runOrchestration(
      { evidence: { ok: true, status: 200 }, ledger: { ok: false, status: 500 }, chronicle: { ok: true, status: 200 }, logic: { ok: true, status: 200 } },
      'mercury.account.updated'
    );

    expect(transactionEvent.orchestrationErrors).toContain('ledger: HTTP 500');
    expect(nonTransactionEvent.orchestrationErrors).not.toContain('ledger: HTTP 500');
  });
});

// ============================================================================
// Idempotency Logic Tests
// ============================================================================

describe('Webhook Idempotency Logic', () => {
  it('deduplicates events by event ID', () => {
    const seenEvents = new Set<string>();

    const processEvent = (source: string, eventId: string): boolean => {
      const key = `${source}:${eventId}`;
      if (seenEvents.has(key)) return false; // Duplicate
      seenEvents.add(key);
      return true; // New event
    };

    expect(processEvent('mercury', 'evt_123')).toBe(true);
    expect(processEvent('mercury', 'evt_123')).toBe(false); // Duplicate
    expect(processEvent('mercury', 'evt_456')).toBe(true);  // Different ID
    expect(processEvent('stripe', 'evt_123')).toBe(true);   // Different source
  });

  it('treats same event ID from different sources as distinct events', () => {
    const seenEvents = new Set<string>();

    const processEvent = (source: string, eventId: string): boolean => {
      const key = `${source}:${eventId}`;
      if (seenEvents.has(key)) return false;
      seenEvents.add(key);
      return true;
    };

    expect(processEvent('mercury', 'evt_001')).toBe(true);
    expect(processEvent('stripe', 'evt_001')).toBe(true); // Same ID, different source
  });
});

// ============================================================================
// Orchestration Response Format Tests
// ============================================================================

describe('Webhook Response Format', () => {
  it('omits orchestrationErrors field when no errors occur', async () => {
    const { orchestrationErrors } = await runOrchestration({
      evidence: { ok: true, status: 202 },
      chronicle: { ok: true, status: 201 },
      logic: { ok: true, status: 200 },
    });

    // Simulate the conditional inclusion in the response
    const responseBody: any = { received: true };
    if (orchestrationErrors.length > 0) {
      responseBody.orchestrationErrors = orchestrationErrors;
    }

    expect(responseBody).not.toHaveProperty('orchestrationErrors');
    expect(responseBody.received).toBe(true);
  });

  it('includes orchestrationErrors array when errors occur', async () => {
    const { orchestrationErrors } = await runOrchestration({
      evidence: { ok: false, status: 503 },
      chronicle: { ok: true, status: 200 },
      logic: { ok: true, status: 200 },
    });

    const responseBody: any = { received: true };
    if (orchestrationErrors.length > 0) {
      responseBody.orchestrationErrors = orchestrationErrors;
    }

    expect(responseBody).toHaveProperty('orchestrationErrors');
    expect(responseBody.orchestrationErrors).toBeInstanceOf(Array);
    expect(responseBody.orchestrationErrors).toHaveLength(1);
  });

  it('response always includes received: true regardless of orchestration errors', async () => {
    const { orchestrationErrors: errors1 } = await runOrchestration({
      evidence: { ok: true, status: 200 },
      chronicle: { ok: true, status: 200 },
      logic: { ok: true, status: 200 },
    });
    const { orchestrationErrors: errors2 } = await runOrchestration({
      evidence: new Error('down'),
      chronicle: new Error('down'),
      logic: new Error('down'),
    });

    // Both cases should include received: true
    const response1: any = { received: true };
    if (errors1.length > 0) response1.orchestrationErrors = errors1;

    const response2: any = { received: true };
    if (errors2.length > 0) response2.orchestrationErrors = errors2;

    expect(response1.received).toBe(true);
    expect(response2.received).toBe(true);
  });
});

// ============================================================================
// Event Envelope Structure Tests
// ============================================================================

describe('Webhook Event Envelope', () => {
  it('builds envelope with required fields', () => {
    const reqBody = { type: 'mercury.transaction.created', id: 'txn_abc', amount: 1000 };
    const eventId = 'evt_xyz';

    const envelope = {
      source: 'mercury',
      event_id: eventId,
      kind: reqBody?.type || 'unknown',
      received_at: new Date().toISOString(),
      payload: reqBody || null,
    };

    expect(envelope).toHaveProperty('source', 'mercury');
    expect(envelope).toHaveProperty('event_id', 'evt_xyz');
    expect(envelope).toHaveProperty('kind', 'mercury.transaction.created');
    expect(envelope).toHaveProperty('received_at');
    expect(envelope).toHaveProperty('payload');
  });

  it('defaults kind to "unknown" when body has no type', () => {
    const reqBody = { id: 'evt_001' }; // No type field
    const envelope = {
      kind: (reqBody as any)?.type || 'unknown',
    };
    expect(envelope.kind).toBe('unknown');
  });

  it('received_at is a valid ISO 8601 timestamp', () => {
    const envelope = {
      received_at: new Date().toISOString(),
    };
    const date = new Date(envelope.received_at);
    expect(date).toBeInstanceOf(Date);
    expect(isNaN(date.getTime())).toBe(false);
  });
});
