/**
 * ChittySchema client for ChittyFinance.
 *
 * Talks to https://schema.chitty.cc using the real API contract:
 *   GET  /api/health              — service health
 *   POST /api/validate            — { table, data } → { valid, errors, availableTables? }
 *   GET  /api/tables              — list registered tables
 *
 * Workers-native — all calls take `env` (or an explicit baseUrl) instead of
 * reading `process.env` at module load time. Safe to import from any worker
 * route or handler.
 *
 * Philosophy: validation is advisory. The schema service is an external
 * dependency and we never want it to block financial writes. If it's down,
 * unreachable, or returns a 5xx, callers receive `{ ok: true, advisory: true }`
 * and the write proceeds. If the schema returns `valid: false`, callers
 * decide whether to block (strict mode) or warn (default).
 */

export interface ChittySchemaError {
  path?: string;
  message: string;
  code?: string;
}

export interface ChittySchemaResult {
  /** True if validation passed OR the service was unreachable and we fell open. */
  ok: boolean;
  /** True if the schema service was down/unreachable and we returned an advisory pass. */
  advisory: boolean;
  /** Validation errors from the service (only set when ok=false). */
  errors?: ChittySchemaError[];
  /** When the requested table is not in the registry, list of known tables. */
  availableTables?: string[];
}

export interface ChittySchemaTable {
  name: string;
  database: string;
  owner: string;
}

const DEFAULT_BASE_URL = 'https://schema.chitty.cc';
const DEFAULT_TIMEOUT_MS = 3000;

function baseUrlFromEnv(env: { CHITTYSCHEMA_URL?: string }): string {
  return env.CHITTYSCHEMA_URL || DEFAULT_BASE_URL;
}

/**
 * Validate a row of data against a ChittySchema-registered table.
 *
 * Always returns a result object — never throws. If the schema service is
 * unreachable, returns `{ ok: true, advisory: true }` so callers can log and
 * proceed. If the table is not registered, returns `{ ok: true, advisory: true }`
 * with `availableTables` populated so operators can see what's registered.
 */
export async function validateRow(
  env: { CHITTYSCHEMA_URL?: string },
  table: string,
  data: Record<string, unknown>,
  opts?: { timeoutMs?: number },
): Promise<ChittySchemaResult> {
  const url = `${baseUrlFromEnv(env)}/api/validate`;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, data }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    // 5xx → advisory pass (service is down, don't block writes)
    if (response.status >= 500) {
      return { ok: true, advisory: true };
    }

    const body = (await response.json().catch(() => null)) as
      | { valid?: boolean; errors?: unknown; availableTables?: string[] }
      | null;

    if (!body) {
      return { ok: true, advisory: true };
    }

    // Table not registered → advisory pass but surface availableTables so
    // operators can see what's registered and decide whether to add theirs
    if (body.availableTables && !body.valid) {
      return {
        ok: true,
        advisory: true,
        availableTables: body.availableTables,
      };
    }

    if (body.valid === true) {
      return { ok: true, advisory: false };
    }

    // Normalize error shapes — the API returns `errors` as string[] for missing
    // table cases and as object[] for real validation failures
    const errors: ChittySchemaError[] = Array.isArray(body.errors)
      ? body.errors.map((e) =>
          typeof e === 'string'
            ? { message: e }
            : (e as ChittySchemaError),
        )
      : [{ message: 'Unknown validation error' }];

    return { ok: false, advisory: false, errors };
  } catch (err) {
    // Network error, timeout, DNS fail → advisory pass. Financial writes
    // must not be blocked by an external schema service being unreachable.
    console.warn('[chittyschema] validateRow failed, falling open:', (err as Error).message);
    return { ok: true, advisory: true };
  }
}

/**
 * List registered ChittySchema tables. Returns `[]` on any error.
 */
export async function listTables(
  env: { CHITTYSCHEMA_URL?: string },
  opts?: { timeoutMs?: number },
): Promise<ChittySchemaTable[]> {
  const url = `${baseUrlFromEnv(env)}/api/tables`;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return [];
    const body = (await response.json()) as { tables?: ChittySchemaTable[] };
    return body.tables ?? [];
  } catch {
    return [];
  }
}

/**
 * Quick health probe. Returns true iff GET /api/health returns 2xx within the timeout.
 */
export async function checkHealth(
  env: { CHITTYSCHEMA_URL?: string },
  opts?: { timeoutMs?: number },
): Promise<boolean> {
  const url = `${baseUrlFromEnv(env)}/api/health`;
  const timeoutMs = opts?.timeoutMs ?? 2000;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch {
    return false;
  }
}
