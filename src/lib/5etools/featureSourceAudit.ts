import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { featureOptionRulesSignature } from './featureRulesSignature'

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
