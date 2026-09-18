import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { StorageValidationError } from '../storage/system';

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  // Caller-supplied input the storage layer rejected — a client fault, not a
  // server one. Mapped here rather than per-route so every writer of a
  // transaction gets a 400 without its own catch block.
  if (err instanceof StorageValidationError) {
    return c.json({ error: err.code, message: err.message }, 400);
  }
  console.error('[error]', err);
  return c.json({ error: err.message || 'Internal Server Error' }, 500);
};
