import type { ClassFeature } from '@/types/5etools'
import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { getFeatureSourceDigest, hasFeatureSourceShape } from './featureSourceAudit'

// Audited data/class/class-barbarian.json SHA25615b090c2ede1cc5a522817bf41d83a890aa194f3d7827f98787e1b05d057f319.
// Genuine ordered entries only; future source revisions require an explicit rules re-audit.
const AUDITED_DIGESTS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    'subclass-feature|desert|barbarian|phb|storm herald|xge|3|xge':
      '9032f3503bedadb3913c7847f7356d943fbb2e7197ba9c1f118df25c8f8fb82a',
    'subclass-feature|path of the storm herald|barbarian|phb|storm herald|xge|3|xge':
      'ea03e3f67d3959607db357a69e39894393dda3af4e259589b09c418e7462b8e3',
    'subclass-feature|sea|barbarian|phb|storm herald|xge|3|xge':
      '75ee18c5ba5ea1ac58ae7e5a6c50d08080e9ce47c75a92854b2ec46d1facc92b',
    'subclass-feature|tundra|barbarian|phb|storm herald|xge|3|xge':
      '313f99743c8b4bed02d5a50d7f2f948c322c49b9fbbb22642a2c8c46d5edc0e9',
    'subclass-feature|storm aura|barbarian|phb|storm herald|xge|3|xge':
      'adc3926954ac178f7ac1ce1e38ada09af07d75ce68ed1e47be380f29fc955d15',
    'subclass-feature|desert|barbarian|phb|storm herald|xge|6|xge':
      '6dcaf9ac3b6241ac6d4abc0d754be86eb5fbf6db5541c537c52bdd83bc72a7a3',
    'subclass-feature|sea|barbarian|phb|storm herald|xge|6|xge':
      '69e918b7eeb60770357d6902c8244bd398718b177890614abda31d2d309cd768',
    'subclass-feature|tundra|barbarian|phb|storm herald|xge|6|xge':
      'c78be92d2bb9788cde2b09b8d4288c10a0275a4b3cd59ba3c3a10396d27a6e43',
    'subclass-feature|storm soul|barbarian|phb|storm herald|xge|6|xge':
      'e561e981ffa84c3e7be0488246d80564f09734488766d2a5c64c7153aaa96d9b',
    'subclass-feature|shielding storm|barbarian|phb|storm herald|xge|10|xge':
      '02f9706700e6d5688d7c5dac4b16cd96f3869b661c2ca76a212fa92466ff2802',
    'subclass-feature|desert|barbarian|phb|storm herald|xge|14|xge':
      'bdf6d9f749ec4398bf9e60f83d87ed633167e0099c04a4a6f2818c504f99199d',
    'subclass-feature|sea|barbarian|phb|storm herald|xge|14|xge':
      'd42f87b3a08c20bf16e0c6c8754a456dc37bdd3e58b96337335c20ea046e3527',
    'subclass-feature|tundra|barbarian|phb|storm herald|xge|14|xge':
      '81cc8fa4730858d0823cc29d159d9d12ab9aa94fc6545c47ccb0bd194b88ee89',
    'subclass-feature|raging storm|barbarian|phb|storm herald|xge|14|xge':
      '119c3538c42c8cf2b76999cf139c6919aa2196294084b843970d1cf22d1f331c',
  }),
)
const SOURCE_FIELDS = new Set([
  'name',
  'source',
  'className',
  'classSource',
  'subclassShortName',
  'subclassSource',
  'level',
  'entries',
  'page',
  'header',
  'featureOptionSourceConflict',
])
export function hasStormSourceShape(feature: ClassFeature | Record<string, unknown>): boolean {
  return hasFeatureSourceShape(feature, SOURCE_FIELDS)
}
export function getAuditedStormSourceDigest(target: string): string | undefined {
  return AUDITED_DIGESTS.get(target)
}
export function getStormRulesDigest(entries: unknown[]): string | undefined {
  return getFeatureSourceDigest(entries)
}
/** A body is trusted for one complete target only; metadata cannot hide extra conditions. */
export function isAuditedStormFeature(
  feature: ClassFeature | Record<string, unknown> | undefined,
): boolean {
  if (
    !feature ||
    !hasStormSourceShape(feature) ||
    feature.featureOptionSourceConflict ||
    !Array.isArray(feature.entries) ||
    feature.entries.length === 0
  )
    return false
  const target = getSubclassFeatureIdentity(feature)
  const expected = target ? getAuditedStormSourceDigest(target) : undefined
  return expected !== undefined && getStormRulesDigest(feature.entries) === expected
}
