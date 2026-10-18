import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { featureOptionRulesSignature } from './featureRulesSignature'

/** Ordered rules are hashed once at their source boundary; legacy enrichment handling is explicit. */
export function getFeatureSourceDigest(
  entries: unknown[],
  stripEnrichment = true,
): string | undefined {
  const signature = featureOptionRulesSignature(entries, stripEnrichment)
  return signature === undefined ? undefined : bytesToHex(sha256(utf8ToBytes(signature)))
}
export function hasFeatureSourceShape(feature: object, fields: ReadonlySet<string>): boolean {
  return Object.keys(feature).every((key) => fields.has(key))
}
