// Minimal Cloudflare Workers KV types used by chittyRegistryWorker
// Avoids adding external type packages while preserving strict type checks.

interface KVListKey {
  name: string;
  expiration?: number;
  expiration_ttl?: number;
  metadata?: unknown;
}

interface KVListResult {
  keys: KVListKey[];
  list_complete?: boolean;
  cursor?: string;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<KVListResult>;
}

// Allow importing workers files in Node TS projects
interface Fetcher {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

// Minimal Durable Objects types
interface DurableObjectId {}
interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  idFromString(id: string): DurableObjectId;
  newUniqueId(): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}
interface DurableObjectStub {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}
