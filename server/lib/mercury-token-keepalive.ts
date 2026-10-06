/**
 * Mercury API token keepalive + liveness probe.
 *
 * WHY THIS EXISTS
 * ---------------
 * Mercury deletes API tokens after any 45-day period with no API call
 * (docs.mercury.com/docs/api-token-security-policies: "Tokens inactive for any
 * 45-day period face automatic deletion"). ChittyFinance had no outbound Mercury
 * client at all — no reference to api.mercury.com anywhere in the tree — so the
 * seven per-entity tokens have been idle since they were provisioned. A daily
 * read-only call is both the keepalive and the inventory of which ones survived.
 *
 * SCOPE — READ ONLY
 * -----------------
 * The only request this module ever makes is
 *   GET https://api.mercury.com/api/v1/accounts?limit=1
 * (docs.mercury.com/reference/getaccounts). It never calls a write endpoint.
 * `limit=1` keeps the response minimal, and the 2xx body is DISCARDED UNREAD —
 * /accounts returns account and routing numbers, and this module has no reason
 * to hold them.
 *
 * CREDENTIAL HANDLING
 * -------------------
 * Tokens are referenced by Secrets Store BINDING NAME only. `.get()` happens at
 * the call site, the value goes straight into the Authorization header, and it is
 * never logged, returned, persisted, or put in an error message. Only the binding
 * name, the HTTP status, Mercury's `errorCode`, and a timestamp are recorded.
 *
 * THREE STATES, NOT TWO
 * ---------------------
 * A 401 is a SUCCESSFUL probe with a negative result. Conflating "the token is
 * dead" with "we could not reach Mercury" would make the whole probe useless, so
 * classification is explicit:
 *   alive         — 2xx
 *   dead          — 401 / 403 (expired, deleted, or revoked)
 *   indeterminate — timeout, network error, 429, 5xx, unexpected status, or a
 *                   binding that is not present on this Worker
 */

/**
 * The seven Secrets Store bindings, one per entity. Binding name == secret name,
 * matching CHITTYOS/chittysecrets/wrangler.json, which binds the same secrets from
 * the same account-level store (e914522471964c3c8cf1e601770edcc3). Secrets Store is
 * account-level, so chittyfinance declares these directly — it does not need the
 * ChittySecrets broker in the path.
 */
export const MERCURY_TOKEN_BINDINGS = [
  'MERCURY_TOKEN_ARIBIA_LLC',
  'MERCURY_TOKEN_ARIBIA_LLC_CITY_STUDIO',
  'MERCURY_TOKEN_ARIBIA_LLC_APT_ARLENE',
  'MERCURY_TOKEN_CHICAGO_FURNISHED_CONDOS',
  'MERCURY_TOKEN_IT_CAN_BE_LLC',
  'MERCURY_TOKEN_CHITTY_SERVICES',
  'MERCURY_TOKEN_JEAN_ARLENE_VENTURING',
] as const;

export type MercuryTokenBinding = (typeof MERCURY_TOKEN_BINDINGS)[number];

/** Read-only. Do not point this at a write endpoint. */
export const MERCURY_PROBE_URL = 'https://api.mercury.com/api/v1/accounts?limit=1';

export const MERCURY_PROBE_TIMEOUT_MS = 10_000;

export type Liveness = 'alive' | 'dead' | 'indeterminate';

/** Raw observation handed to the pure classifier. Carries no credential material. */
export interface ProbeObservation {
  /** HTTP status, when a response was received at all. */
  status?: number;
  /** Mercury's `errors.errorCode`, when the non-2xx body carried one. */
  errorCode?: string | null;
  /** Transport-level failure (timeout, DNS, TLS). Never a credential value. */
  transportError?: string | null;
  /** The Secrets Store binding is absent, or `.get()` threw. */
  bindingMissing?: boolean;
}

export interface Classification {
  liveness: Liveness;
  reason: string;
}

export interface ProbeResult extends Classification {
  /** Secrets Store binding name — never the token value. */
  token: MercuryTokenBinding | string;
  status: number | null;
  errorCode: string | null;
  checkedAt: string;
}

export interface KeepaliveReport {
  ranAt: string;
  probeUrl: string;
  counts: Record<Liveness, number>;
  results: ProbeResult[];
}

/**
 * Pure three-state classifier. Separated from fetch so it can be tested against
 * real `Response` statuses rather than a mocked client.
 *
 * `dead` is deliberately narrow: only 401/403, where Mercury has told us the token
 * itself is not acceptable. Everything we cannot interpret is `indeterminate`.
 */
export function classifyProbe(obs: ProbeObservation): Classification {
  if (obs.bindingMissing) {
    return {
      liveness: 'indeterminate',
      reason: 'binding_missing: secrets_store binding is not present on this Worker',
    };
  }

  if (typeof obs.status !== 'number') {
    return {
      liveness: 'indeterminate',
      reason: `transport_error: ${obs.transportError || 'no response received'}`,
    };
  }

  const { status } = obs;

  if (status >= 200 && status < 300) {
    return { liveness: 'alive', reason: `ok: HTTP ${status}` };
  }

  // 401 — Mercury rejected the token (deleted after 45 days idle, or revoked).
  // 403 — authenticated but refused; on a read+write token this is also the shape
  // an IP-allowlist rejection would take, which is why the errorCode is kept.
  if (status === 401 || status === 403) {
    const code = obs.errorCode ? ` (${obs.errorCode})` : '';
    return {
      liveness: 'dead',
      reason: `rejected: HTTP ${status}${code}`,
    };
  }

  if (status === 429) {
    return { liveness: 'indeterminate', reason: 'rate_limited: HTTP 429' };
  }

  if (status >= 500) {
    return { liveness: 'indeterminate', reason: `upstream_error: HTTP ${status}` };
  }

  return { liveness: 'indeterminate', reason: `unexpected_status: HTTP ${status}` };
}

/**
 * Pull `errors.errorCode` out of a non-2xx body. Deliberately narrow: only the
 * machine-readable code is taken, never Mercury's `message`, so nothing a remote
 * service put in prose can end up in our logs. Sanitized and length-capped.
 */
export function extractErrorCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const errors = (body as { errors?: unknown }).errors;
  const candidate = Array.isArray(errors) ? errors[0] : errors;
  if (!candidate || typeof candidate !== 'object') return null;
  const code = (candidate as { errorCode?: unknown }).errorCode;
  if (typeof code !== 'string') return null;
  const safe = code.replace(/[^A-Za-z0-9_.:-]/g, '');
  return safe.slice(0, 64) || null;
}

/** Only the two members of Env this module needs, so tests need not build a whole Env. */
export type MercuryKeepaliveEnv = Partial<Record<MercuryTokenBinding, { get(): Promise<string> }>> & {
  FINANCE_KV?: KVNamespace;
};

/**
 * Probe one token. Resolves — never rejects — so one entity's failure cannot sink
 * the others or the scheduled run.
 */
export async function probeToken(
  binding: MercuryTokenBinding,
  env: MercuryKeepaliveEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult> {
  const checkedAt = new Date().toISOString();
  const secret = env[binding];

  let token: string;
  try {
    if (!secret || typeof secret.get !== 'function') throw new Error('binding absent');
    token = await secret.get();
    if (!token) throw new Error('empty secret');
  } catch {
    // Deliberately swallow the thrown error rather than surface its message: a
    // Secrets Store failure must never carry secret material into a log line.
    return {
      token: binding,
      status: null,
      errorCode: null,
      ...classifyProbe({ bindingMissing: true }),
      checkedAt,
    };
  }

  let status: number | undefined;
  let errorCode: string | null = null;
  let transportError: string | null = null;

  try {
    const res = await fetchImpl(MERCURY_PROBE_URL, {
      method: 'GET',
      headers: {
        // The token value lives only in this header, for the life of this call.
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(MERCURY_PROBE_TIMEOUT_MS),
    });
    status = res.status;

    if (res.ok) {
      // Discard the 2xx body UNREAD — it holds account and routing numbers.
      // `res.ok` alone is the whole signal we want.
      await res.body?.cancel().catch(() => undefined);
    } else {
      try {
        errorCode = extractErrorCode(await res.json());
      } catch {
        errorCode = null;
      }
    }
  } catch (err) {
    transportError = err instanceof Error ? err.name : 'unknown';
  }

  return {
    token: binding,
    status: status ?? null,
    errorCode,
    ...classifyProbe({ status, errorCode, transportError }),
    checkedAt,
  };
}

/**
 * Probe all seven concurrently and build the report.
 *
 * `allSettled` is belt-and-braces: `probeToken` already resolves on every path, so
 * a rejection here would be a bug in this module rather than a dead token — but a
 * single throw must not cost us the other six results.
 */
export async function runMercuryTokenKeepalive(
  env: MercuryKeepaliveEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<KeepaliveReport> {
  const ranAt = new Date().toISOString();

  const settled = await Promise.allSettled(
    MERCURY_TOKEN_BINDINGS.map((b) => probeToken(b, env, fetchImpl)),
  );

  const results: ProbeResult[] = settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    return {
      token: MERCURY_TOKEN_BINDINGS[i],
      status: null,
      errorCode: null,
      ...classifyProbe({ transportError: 'probe threw' }),
      checkedAt: ranAt,
    };
  });

  const counts: Record<Liveness, number> = { alive: 0, dead: 0, indeterminate: 0 };
  for (const r of results) counts[r.liveness] += 1;

  return { ranAt, probeUrl: MERCURY_PROBE_URL, counts, results };
}

export const KV_RUN_LATEST = 'mercury:token-probe:run:latest';
export const kvTokenKey = (binding: string) => `mercury:token-probe:${binding}`;
export const kvRunKey = (ranAt: string) => `mercury:token-probe:run:${ranAt}`;

/** History retention for dated run snapshots. Per-token latest and the latest run never expire. */
export const KV_RUN_HISTORY_TTL_SECONDS = 180 * 86400;

/**
 * Persist the report.
 *
 * KV rather than a Neon table, deliberately:
 *   - `integrations` is the only existing table that is remotely about external
 *     services, and it is tenant-FK'd (`tenant_id uuid NOT NULL REFERENCES tenants`).
 *     These seven tokens are keyed by Secrets Store binding name with no tenant
 *     mapping, so rows would need an invented tenant.
 *   - A new table means `drizzle-kit push`, which CLAUDE.md records as destructive
 *     and cutover-coordinated — a disproportionate price for seven rows a day, and
 *     against the standing startup-mode posture of not entrenching Postgres.
 *   - FINANCE_KV is already this repo's store for operational state (sessions,
 *     the inbound-email index, Wave webhook secrets).
 *   - The operator policy allows KV for "short-lived cache or rotation state".
 *     Token liveness is rotation state.
 * Per-token and latest-run keys carry no TTL, so the record is durable.
 */
export async function persistKeepaliveReport(
  report: KeepaliveReport,
  kv: KVNamespace,
): Promise<void> {
  const writes: Promise<unknown>[] = [
    kv.put(KV_RUN_LATEST, JSON.stringify(report)),
    kv.put(kvRunKey(report.ranAt), JSON.stringify(report), {
      expirationTtl: KV_RUN_HISTORY_TTL_SECONDS,
    }),
  ];

  for (const r of report.results) {
    writes.push(kv.put(kvTokenKey(r.token), JSON.stringify(r)));
  }

  // One failed KV write must not lose the rest of the record.
  await Promise.allSettled(writes);
}

/** Read back the last run. `null` means the probe has not run yet on this deployment. */
export async function readLatestKeepaliveReport(
  kv: KVNamespace,
): Promise<KeepaliveReport | null> {
  const raw = await kv.get(KV_RUN_LATEST);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as KeepaliveReport;
  } catch {
    return null;
  }
}

/**
 * Run the probe, persist it, and log a credential-free summary. Used by the
 * scheduled handler and by the on-demand endpoint.
 */
export async function keepaliveAndRecord(
  env: MercuryKeepaliveEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<KeepaliveReport> {
  const report = await runMercuryTokenKeepalive(env, fetchImpl);

  if (env.FINANCE_KV) {
    await persistKeepaliveReport(report, env.FINANCE_KV);
  } else {
    console.warn('[mercury-keepalive] FINANCE_KV not bound — result not recorded');
  }

  // Binding names, statuses and error codes only. No token values.
  console.log(
    '[mercury-keepalive] complete:',
    JSON.stringify({ ranAt: report.ranAt, counts: report.counts }),
  );
  for (const r of report.results) {
    console.log(`[mercury-keepalive] ${r.token} ${r.liveness} ${r.reason}`);
  }

  return report;
}
