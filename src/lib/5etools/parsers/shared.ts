export type ParsedObject = Record<string, unknown>

export function asObject(data: unknown): ParsedObject {
  return typeof data === 'object' && data !== null ? (data as ParsedObject) : {}
}

export function asArray(data: unknown): unknown[] {
  return Array.isArray(data) ? data : []
}

export function normalizeKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}
