/**
 * ID Compatibility Helpers
 *
 * Bridges the gap between old code using integer IDs (standalone mode)
 * and new code using UUID strings (system mode).
 */

const MODE = process.env.MODE || 'standalone';

/**
 * Convert an ID to string format (for new storage layer)
 */
export function toStringId(id: number | string | undefined): string {
  if (id === undefined) return '1'; // Default to demo user
  return String(id);
}

/**
 * Convert an ID to number format (for old code)
 */
export function toNumberId(id: string | number | undefined): number {
  if (id === undefined) return 1;
  if (typeof id === 'number') return id;
  const num = parseInt(id, 10);
  return isNaN(num) ? 1 : num;
}

/**
 * Get compatible tenant/user ID from user object
 * In standalone mode, userId === tenantId
 * In system mode, they're separate UUIDs
 */
export function getUserTenantId(user: any): string {
  if (MODE === 'standalone') {
    return toStringId(user?.id);
  }
  // In system mode, would need actual tenant selection
  return toStringId(user?.id);
}
