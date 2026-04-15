export type ParsedObject = Record<string, unknown>

export function asObject(data: unknown): ParsedObject {
  return typeof data === 'object' && data !== null ? (data as ParsedObject) : {}
}

export function asArray(data: unknown): unknown[] {
  return Array.isArray(data) ? data : []
}

export { normalizeKey } from '@/lib/provenance/normalization'
