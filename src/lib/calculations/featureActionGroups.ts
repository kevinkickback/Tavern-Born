import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

/** Stable even when only a subset of identical repeated gains is currently available. */
export function getFeatureActionGroupId(owner: string, target: string, entries: unknown[]): string {
  const parts = target.split('|')
  const family = parts.filter((_, index) => index !== (parts[0] === 'subclass-feature' ? 6 : 4))
  const rules = JSON.stringify(entries, (_key, value: unknown) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, (value as Record<string, unknown>)[key]]),
        )
      : value,
  )
  return `${parts[0]}:${encodeURIComponent(JSON.stringify([owner, family, bytesToHex(sha256(utf8ToBytes(rules)))]))}`
}
