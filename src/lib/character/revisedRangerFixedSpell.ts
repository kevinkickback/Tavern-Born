import { parseAdditionalSpellBlocks } from '@/lib/5etools/additionalSpells'
import {
  decodeClassFeatureReference,
  getClassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import type { Character } from '@/types/character'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import { permitted, sources } from './classSpellAuthority'
import type { ClassFixedSpellGrant } from './optionalClassFixedSpells'

const owner = ['class', 'ranger', 'xphb'] as const
const target = 'class-feature|favored enemy|ranger|xphb|1|xphb'
const spellKey = "hunter's mark|xphb"

function isDeclaration(uid: unknown) {
  return (
    typeof uid === 'string' && getClassFeatureIdentity(decodeClassFeatureReference(uid)) === target
  )
}

/** The class schedule supplies the spell and gain; the current feature supplies its owner. */
export function getRevisedRangerFixedSpell(
  character: Character,
  catalogs?: ClassChoiceFeatureCatalogs,
): ClassFixedSpellGrant | undefined {
  if (!catalogs) return undefined
  const matches = (row: { name: string; source?: string }) =>
    norm(row.name) === owner[1] && norm(row.source) === owner[2]
  const entries = character.classProgression.filter(matches)
  if (entries.length !== 1 || entries[0].levels < 1 || !permitted(sources(character), owner[2]))
    return undefined
  const classes = catalogs.classes?.filter(matches)
  if (classes?.length !== 1 || classes[0].sourceIdentityConflict) return undefined
  const cls = classes[0]
  if (!Array.isArray(cls.classFeatures) || !Array.isArray(cls.classFeatureRefs)) return undefined
  const declarations = cls.classFeatures.filter((row) =>
    isDeclaration(typeof row === 'object' && row ? row.classFeature : row),
  )
  if (
    declarations.length !== 1 ||
    typeof declarations[0] !== 'string' ||
    declarations[0].split('|').length > 5
  )
    return undefined
  const references = cls.classFeatureRefs.filter((row) => isDeclaration(row.ref))
  if (
    references.length !== 1 ||
    references[0].ref.split('|').length > 5 ||
    references[0].gainSubclassFeature ||
    getClassFeatureIdentity(references[0]) !== target
  )
    return undefined
  const features = catalogs.classFeatures.filter((row) => getClassFeatureIdentity(row) === target)
  const candidates = catalogs.classFeatureCandidates?.get(target)
  if (
    features.length !== 1 ||
    features[0].sourceIdentityConflict ||
    catalogs.ambiguousClassFeatureTargets?.has(target) ||
    (catalogs.classFeatureCandidates &&
      (candidates?.length !== 1 ||
        candidates[0].sourceIdentityConflict ||
        getClassFeatureIdentity(candidates[0]) !== target))
  )
    return undefined
  const feature = features[0]
  const firstLine = feature.entries?.[0]
  const reference =
    typeof firstLine === 'string'
      ? /^You always have the \{@spell ([^|#{}]+\|[^|#{}]+)\} spell prepared\./i.exec(
          firstLine,
        )?.[1]
      : undefined
  const blocks = cls.additionalSpells as AdditionalSpellBlock[] | undefined
  const block = Array.isArray(blocks) && blocks.length === 1 ? blocks[0] : undefined
  const schedule = block?.prepared
  const token = schedule?.['1']
  if (
    !reference ||
    getSpellReferenceKey(reference) !== spellKey ||
    !block ||
    Object.keys(block).length !== 1 ||
    !schedule ||
    Object.keys(schedule).length !== 1 ||
    !Array.isArray(token) ||
    token.length !== 1 ||
    typeof token[0] !== 'string' ||
    !/^[^|#{}]+\|[^|#{}]+$/.test(token[0])
  )
    return undefined
  try {
    const [parsed] = parseAdditionalSpellBlocks([block])
    const [grant] = parsed.grants
    if (grant && getSpellReferenceKey(grant.spellName) === spellKey)
      return { owner: [...owner], target, featureName: feature.name, level: grant.level, reference }
  } catch {
    return undefined
  }
}
