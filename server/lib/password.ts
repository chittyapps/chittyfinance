/**
 * PBKDF2 password hashing using Web Crypto API.
 * Compatible with Cloudflare Workers and Node 20+.
 *
 * Format: iterations:salt_hex:hash_hex
 */

const ITERATIONS = 100_000;
const KEY_LENGTH = 32; // 256 bits
const HASH_ALGO = 'SHA-256';

/** Hash a password with PBKDF2. Returns a storable string. */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: HASH_ALGO },
    key,
    KEY_LENGTH * 8,
  );

  const saltHex = toHex(salt);
  const hashHex = toHex(new Uint8Array(derived));
  return `${ITERATIONS}:${saltHex}:${hashHex}`;
}

/** Verify a password against a stored PBKDF2 hash. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 3) return false;

  const [iterStr, saltHex, expectedHex] = parts;
  const iterations = parseInt(iterStr, 10);
  if (!iterations || iterations < 1) return false;

  const salt = fromHex(saltHex);
  if (!salt) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: HASH_ALGO },
    key,
    KEY_LENGTH * 8,
  );

  const actualHex = toHex(new Uint8Array(derived));
  return timingSafeEqual(actualHex, expectedHex);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/** Constant-time string comparison to prevent timing attacks. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Constant-time token comparison that doesn't leak length.
 * Hashes both inputs with SHA-256 before comparing, so timing
 * reveals nothing about the token value or length.
 */
export async function tokenEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const ba = new Uint8Array(ha);
  const bb = new Uint8Array(hb);
  let result = 0;
  for (let i = 0; i < ba.length; i++) {
    result |= ba[i] ^ bb[i];
  }
  return result === 0;
}
