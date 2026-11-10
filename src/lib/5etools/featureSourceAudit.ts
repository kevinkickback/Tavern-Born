import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import type { ClassFeature } from '@/types/5etools'
import { featureOptionRulesSignature } from './featureRulesSignature'

export interface ClassFeatureSourceCatalog {
  classFeatures: readonly ClassFeature[]
  classFeatureCandidates?: ReadonlyMap<string, readonly ClassFeature[]>
}

const digestCache = new Map<string, string>()
const maxDigestEntries = 256
const maxSignatureCharacters = 32768
const maxRetainedStringCharge = 512 * 1024
let retainedStringCharge = 0

/** Canonicalize current rules on every call; reuse only an exact string's content digest. */
export function getFeatureSourceDigest(
  entries: unknown[],
  stripEnrichment = true,
): string | undefined {
  const signature = featureOptionRulesSignature(entries, stripEnrichment)
  if (signature === undefined) return undefined
  const cached = digestCache.get(signature)
  if (cached !== undefined) {
    digestCache.delete(signature)
    digestCache.set(signature, cached)
    return cached
  }
  const digest = bytesToHex(sha256(utf8ToBytes(signature)))
  if (signature.length > maxSignatureCharacters) return digest
  // UTF-16 key/value payload charge; entry count separately bounds Map overhead.
  const charge = 2 * (signature.length + digest.length)
  for (const [oldest, previousDigest] of digestCache) {
    if (
      digestCache.size < maxDigestEntries &&
      retainedStringCharge + charge <= maxRetainedStringCharge
    )
      break
    retainedStringCharge -= 2 * (oldest.length + previousDigest.length)
    digestCache.delete(oldest)
  }
  digestCache.set(signature, digest)
  retainedStringCharge += charge
  return digest
}
export function hasFeatureSourceShape(feature: object, fields: ReadonlySet<string>): boolean {
  return Object.keys(feature).every((key) => fields.has(key))
}

/** A source can add a citation page without changing a verified rule. */
export function hasSourceCitationPage(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function withoutSourceCitationPage(row: Record<string, unknown>) {
  if (!hasSourceCitationPage(row.page)) return row
  const { page: _page, ...rules } = row
  return rules
}

export function canonicalizeFeatureEntry(entry: unknown): unknown {
  if (typeof entry === 'string') {
    // These clauses already identify damage in prose. The tag only displays the dice formula.
    return entry.replace(
      /(\bdamage (?:equal to|of this feature increases by)\s)([^.!?]*)/gi,
      (_, clause: string, formulas: string) =>
        clause + formulas.replace(/\{@damage (\d+d\d+)}/g, '{@dice $1}'),
    )
  }
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry
  const row = entry as Record<string, unknown>
  if (row.type === 'statblock' && typeof row.name === 'string' && typeof row.tag === 'string')
    return withoutSourceCitationPage(row)
  if (row.type !== 'entries' || !Array.isArray(row.entries)) return entry
  return { ...withoutSourceCitationPage(row), entries: row.entries.map(canonicalizeFeatureEntry) }
}

export function matchesFeatureEntryDigest(
  entries: unknown[],
  digest: string,
  stripEnrichment = true,
): boolean {
  return (
    getFeatureSourceDigest(entries, stripEnrichment) === digest ||
    getFeatureSourceDigest(entries.map(canonicalizeFeatureEntry), stripEnrichment) === digest
  )
}
