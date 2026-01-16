// Minimal shim for transformToUniversalFormat used in routes
export type Universal = Record<string, any>;

export function transformToUniversalFormat(input: any): Universal {
  if (Array.isArray(input)) return { items: input };
  return typeof input === 'object' ? input : { value: input };
}
