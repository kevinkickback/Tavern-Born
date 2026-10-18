import { vi } from 'vitest'
import { getSubclassFeatureIdentity } from '@/lib/5etools/classFeatureIdentity'
import * as source from '@/lib/5etools/stormAuraSource'

// Frozen from independently authored source-shaped fixtures before mutations.
// This doubles external source qualification only; production rejects these fixture bodies.
const FIXTURE_DIGESTS: ReadonlyMap<string, string> = new Map(
  Object.entries({
    'subclass-feature|path of the storm herald|barbarian|phb|storm herald|xge|3|xge':
      'fdfdce8aa4f42b49cd757153e602bec3fbfca50208f87fefb3545d84e607429b',
    'subclass-feature|storm aura|barbarian|phb|storm herald|xge|3|xge':
      'b5307944ba93c608bd5fbf9f6e3349064003fbaa6da12ee7be0e38518e0156db',
    'subclass-feature|desert|barbarian|phb|storm herald|xge|3|xge':
      'b90a26555666fc896a414f21573a21ddac20186279142821967a2385619faa08',
    'subclass-feature|sea|barbarian|phb|storm herald|xge|3|xge':
      '0bfbacf9b2565a04d45a0cd6786a1e6f573fdf9e1f04666fb4793ee67c8d5ccf',
    'subclass-feature|tundra|barbarian|phb|storm herald|xge|3|xge':
      '47e846b604021e89cda51bc355b9436d3300bc03750c633d4e9f18e7fbc5ba79',
    'subclass-feature|storm soul|barbarian|phb|storm herald|xge|6|xge':
      'bd5f3ac27625dd327f0f2c907cda6c81568585fa59dc38daadc58a718fa5f1be',
    'subclass-feature|desert|barbarian|phb|storm herald|xge|6|xge':
      '9f4c8317aa3615aba8df61670242ee3c21436b46179e8c67a98c9a8672921fc2',
    'subclass-feature|sea|barbarian|phb|storm herald|xge|6|xge':
      '59612edeb9f8d9d9bdbaea36d451291a1436574c5b9960bb28ea68a75c44d634',
    'subclass-feature|tundra|barbarian|phb|storm herald|xge|6|xge':
      '992bb9218eea5152676453cd111b630b1478eb7f6af722e7b35a4038e9c6c297',
    'subclass-feature|shielding storm|barbarian|phb|storm herald|xge|10|xge':
      '9af94ece75ce7321c5bcaf1f986366713654eefde7db0423f80b48853dae143f',
    'subclass-feature|raging storm|barbarian|phb|storm herald|xge|14|xge':
      'f8ec15bbfaef302c03ddfc212e7dcbaeb6526abbad4b2d2dcb430ed599f8dbb4',
    'subclass-feature|desert|barbarian|phb|storm herald|xge|14|xge':
      'cab15708b9de48277f94797a93347933e622e2cb3c9013e7182e5304f743ea82',
    'subclass-feature|sea|barbarian|phb|storm herald|xge|14|xge':
      'a4d5b8572760dcc049c4cfcc0283e1cfe01d884811a98eb7e8d24d9a520785f0',
    'subclass-feature|tundra|barbarian|phb|storm herald|xge|14|xge':
      '3257fa8b862da215844c9d7322e970828295d3c5a3668651cfd7ff74641f96db',
  }),
)
export function installStormSourceDouble() {
  vi.spyOn(source, 'isAuditedStormFeature').mockImplementation((feature) => {
    if (
      !feature ||
      !source.hasStormSourceShape(feature) ||
      feature.featureOptionSourceConflict ||
      !Array.isArray(feature.entries) ||
      feature.entries.length === 0
    )
      return false
    const target = getSubclassFeatureIdentity(feature)
    return (
      !!target &&
      FIXTURE_DIGESTS.get(target) !== undefined &&
      source.getStormRulesDigest(feature.entries) === FIXTURE_DIGESTS.get(target)
    )
  })
}
