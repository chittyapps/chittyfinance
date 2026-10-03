import { describe, it, expect, vi } from 'vitest';
import {
  MERCURY_TOKEN_BINDINGS,
  MERCURY_PROBE_URL,
  classifyProbe,
  extractErrorCode,
  probeToken,
  runMercuryTokenKeepalive,
  persistKeepaliveReport,
  readLatestKeepaliveReport,
  KV_RUN_LATEST,
  kvTokenKey,
  type MercuryKeepaliveEnv,
} from '../lib/mercury-token-keepalive';

/**
 * No DB module is mocked here. The classifier is a pure function and is tested
 * against real `Response` objects; the fetch seam is an injected `fetchImpl`
 * parameter, not a module mock; KV is a real in-memory Map behind the KVNamespace
 * surface the module actually uses.
 */
function makeKv() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
  } as unknown as KVNamespace & { store: Map<string, string> };
}

const secret = (value: string) => ({ get: async () => value });

describe('classifyProbe — the three states are distinguished', () => {
  // The whole point of the probe: a 401 is a successful probe with a negative
  // result, and must never be conflated with "we could not reach Mercury".
  it('2xx is alive', () => {
    for (const status of [200, 204, 299]) {
      expect(classifyProbe({ status }).liveness).toBe('alive');
    }
  });

  it('401 is dead, not alive and not indeterminate', () => {
    const c = classifyProbe({ status: 401, errorCode: 'noTokenInDB' });
    expect(c.liveness).toBe('dead');
    expect(c.liveness).not.toBe('alive');
    expect(c.liveness).not.toBe('indeterminate');
    expect(c.reason).toContain('401');
    expect(c.reason).toContain('noTokenInDB');
  });

  it('403 is dead', () => {
    expect(classifyProbe({ status: 403 }).liveness).toBe('dead');
  });

  it('timeout / network failure is indeterminate, not dead', () => {
    const c = classifyProbe({ transportError: 'TimeoutError' });
    expect(c.liveness).toBe('indeterminate');
    expect(c.liveness).not.toBe('dead');
    expect(c.reason).toContain('transport_error');
  });

  it('5xx is indeterminate, not dead', () => {
    for (const status of [500, 502, 503]) {
      expect(classifyProbe({ status }).liveness).toBe('indeterminate');
    }
  });

  it('429 is indeterminate', () => {
    expect(classifyProbe({ status: 429 }).liveness).toBe('indeterminate');
  });

  it('an absent Secrets Store binding is indeterminate, never dead', () => {
    const c = classifyProbe({ bindingMissing: true });
    expect(c.liveness).toBe('indeterminate');
    expect(c.reason).toContain('binding_missing');
  });

  it('404 and other unexpected statuses are indeterminate', () => {
    expect(classifyProbe({ status: 404 }).liveness).toBe('indeterminate');
    expect(classifyProbe({ status: 418 }).liveness).toBe('indeterminate');
  });

  // Drive the classifier off real Response statuses rather than hand-written numbers,
  // so a change to how status is read is caught too.
  it('classifies real Response objects', async () => {
    expect(classifyProbe({ status: new Response('', { status: 200 }).status }).liveness).toBe('alive');
    expect(classifyProbe({ status: new Response('', { status: 401 }).status }).liveness).toBe('dead');
    expect(classifyProbe({ status: new Response('', { status: 503 }).status }).liveness).toBe('indeterminate');
  });
});

describe('extractErrorCode', () => {
  it('pulls errors.errorCode from a Mercury error body', () => {
    expect(extractErrorCode({ errors: { errorCode: 'noTokenInDB', message: 'No matching token found' } }))
      .toBe('noTokenInDB');
  });

  it('handles an array of errors', () => {
    expect(extractErrorCode({ errors: [{ errorCode: 'noAuthTokenHeader' }] })).toBe('noAuthTokenHeader');
  });

  it('returns null for shapes it does not recognise', () => {
    expect(extractErrorCode(null)).toBeNull();
    expect(extractErrorCode('nope')).toBeNull();
    expect(extractErrorCode({})).toBeNull();
    expect(extractErrorCode({ errors: {} })).toBeNull();
  });

  it('sanitizes and caps the code, and never returns the message', () => {
    const out = extractErrorCode({ errors: { errorCode: 'bad code\n<script>' + 'x'.repeat(200), message: 'secret-token:abc' } });
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(64);
    expect(out).not.toContain(' ');
    expect(out).not.toContain('<');
  });
});

describe('probeToken', () => {
  it('sends a read-only GET to the accounts endpoint with the token as a bearer', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (url: any, init: any) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ accounts: [], page: {} }), { status: 200 });
    }) as unknown as typeof fetch;

    const env: MercuryKeepaliveEnv = { MERCURY_TOKEN_ARIBIA_LLC: secret('secret-token:live') };
    const res = await probeToken('MERCURY_TOKEN_ARIBIA_LLC', env, fetchImpl);

    expect(res.liveness).toBe('alive');
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(MERCURY_PROBE_URL);
    expect(calls[0].init?.method).toBe('GET');
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe('Bearer secret-token:live');
  });

  it('only ever calls the read-only accounts endpoint — never a write path', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: any) => {
      urls.push(String(url));
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const env: MercuryKeepaliveEnv = Object.fromEntries(
      MERCURY_TOKEN_BINDINGS.map((b) => [b, secret('secret-token:x')]),
    );
    await runMercuryTokenKeepalive(env, fetchImpl);

    expect(urls).toHaveLength(7);
    for (const u of urls) {
      expect(u).toBe(MERCURY_PROBE_URL);
      expect(u).toMatch(/^https:\/\/api\.mercury\.com\/api\/v1\/accounts\?limit=1$/);
      expect(u).not.toMatch(/send-money|transaction|transfer/i);
    }
  });

  it('records a 401 as dead and carries the errorCode', async () => {
    const fetchImpl = (async () => new Response(
      JSON.stringify({ errors: { errorCode: 'noTokenInDB', message: 'No matching token found' } }),
      { status: 401 },
    )) as unknown as typeof fetch;

    const res = await probeToken('MERCURY_TOKEN_CHITTY_SERVICES', { MERCURY_TOKEN_CHITTY_SERVICES: secret('t') }, fetchImpl);
    expect(res.liveness).toBe('dead');
    expect(res.status).toBe(401);
    expect(res.errorCode).toBe('noTokenInDB');
  });

  it('records a network failure as indeterminate and never as dead', async () => {
    const fetchImpl = (async () => { throw Object.assign(new Error('timed out'), { name: 'TimeoutError' }); }) as unknown as typeof fetch;
    const res = await probeToken('MERCURY_TOKEN_IT_CAN_BE_LLC', { MERCURY_TOKEN_IT_CAN_BE_LLC: secret('t') }, fetchImpl);
    expect(res.liveness).toBe('indeterminate');
    expect(res.status).toBeNull();
    expect(res.reason).toContain('TimeoutError');
  });

  it('reports a missing binding as indeterminate without calling Mercury', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const res = await probeToken('MERCURY_TOKEN_ARIBIA_LLC', {}, fetchImpl);
    expect(res.liveness).toBe('indeterminate');
    expect(res.reason).toContain('binding_missing');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a Secrets Store failure as indeterminate and leaks nothing from the thrown error', async () => {
    const env: MercuryKeepaliveEnv = {
      MERCURY_TOKEN_ARIBIA_LLC: { get: async () => { throw new Error('secret-token:leaked-value'); } },
    };
    const res = await probeToken('MERCURY_TOKEN_ARIBIA_LLC', env, (async () => new Response('{}')) as unknown as typeof fetch);
    expect(res.liveness).toBe('indeterminate');
    expect(JSON.stringify(res)).not.toContain('leaked-value');
  });

  it('never puts a token value into the recorded result', async () => {
    const token = 'secret-token:do-not-record-me';
    const fetchImpl = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const res = await probeToken('MERCURY_TOKEN_ARIBIA_LLC', { MERCURY_TOKEN_ARIBIA_LLC: secret(token) }, fetchImpl);
    expect(JSON.stringify(res)).not.toContain(token);
    expect(JSON.stringify(res)).not.toContain('do-not-record-me');
    expect(res.token).toBe('MERCURY_TOKEN_ARIBIA_LLC');
  });

  it('does not read the 2xx body — account and routing numbers are never touched', async () => {
    let bodyRead = false;
    const fetchImpl = (async () => {
      const res = new Response(JSON.stringify({ accounts: [{ accountNumber: '9999', routingNumber: '0001' }] }), { status: 200 });
      return new Proxy(res, {
        get(target, prop, recv) {
          if (prop === 'json' || prop === 'text' || prop === 'arrayBuffer') {
            return () => { bodyRead = true; return Reflect.get(target, prop, target).call(target); };
          }
          const v = Reflect.get(target, prop, recv === target ? target : target);
          return typeof v === 'function' ? v.bind(target) : v;
        },
      });
    }) as unknown as typeof fetch;

    const res = await probeToken('MERCURY_TOKEN_ARIBIA_LLC', { MERCURY_TOKEN_ARIBIA_LLC: secret('t') }, fetchImpl);
    expect(res.liveness).toBe('alive');
    expect(bodyRead).toBe(false);
  });
});

describe('runMercuryTokenKeepalive', () => {
  it('probes all seven and one failure does not prevent the others', async () => {
    let n = 0;
    const fetchImpl = (async () => {
      n += 1;
      if (n === 1) return new Response(JSON.stringify({ errors: { errorCode: 'noTokenInDB' } }), { status: 401 });
      if (n === 2) throw Object.assign(new Error('boom'), { name: 'TypeError' });
      if (n === 3) return new Response('', { status: 503 });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const env: MercuryKeepaliveEnv = Object.fromEntries(
      MERCURY_TOKEN_BINDINGS.map((b) => [b, secret('secret-token:x')]),
    );
    const report = await runMercuryTokenKeepalive(env, fetchImpl);

    expect(report.results).toHaveLength(7);
    expect(report.results.map((r) => r.token).sort()).toEqual([...MERCURY_TOKEN_BINDINGS].sort());
    expect(report.counts.dead).toBe(1);
    expect(report.counts.indeterminate).toBe(2);
    expect(report.counts.alive).toBe(4);
    expect(report.counts.alive + report.counts.dead + report.counts.indeterminate).toBe(7);
  });

  it('reports every token as indeterminate when no bindings are present, without calling Mercury', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}')) as unknown as typeof fetch;
    const report = await runMercuryTokenKeepalive({}, fetchImpl);
    expect(report.counts.indeterminate).toBe(7);
    expect(report.counts.dead).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('durable record', () => {
  it('writes the run and a per-token latest, and reads back', async () => {
    const kv = makeKv();
    const fetchImpl = (async () => new Response(JSON.stringify({ errors: { errorCode: 'noTokenInDB' } }), { status: 401 })) as unknown as typeof fetch;
    const env: MercuryKeepaliveEnv = Object.fromEntries(
      MERCURY_TOKEN_BINDINGS.map((b) => [b, secret('secret-token:x')]),
    );

    const report = await runMercuryTokenKeepalive(env, fetchImpl);
    await persistKeepaliveReport(report, kv);

    expect(kv.store.has(KV_RUN_LATEST)).toBe(true);
    for (const b of MERCURY_TOKEN_BINDINGS) {
      const raw = kv.store.get(kvTokenKey(b));
      expect(raw).toBeTruthy();
      const rec = JSON.parse(raw!);
      expect(rec.token).toBe(b);
      expect(rec.liveness).toBe('dead');
      expect(rec.status).toBe(401);
      expect(typeof rec.checkedAt).toBe('string');
    }

    const back = await readLatestKeepaliveReport(kv);
    expect(back?.counts.dead).toBe(7);
    // No token value anywhere in the persisted record.
    expect(JSON.stringify([...kv.store.values()])).not.toContain('secret-token:');
  });

  it('readLatestKeepaliveReport returns null before the first run', async () => {
    expect(await readLatestKeepaliveReport(makeKv())).toBeNull();
  });
});
