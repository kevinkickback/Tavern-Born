import { parseAdditionalSpellBlocks } from '@/lib/5etools/additionalSpells'
import { getFeatureSourceDigest, hasFeatureSourceShape } from '@/lib/5etools/featureSourceAudit'
import { formatSpellReference } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { OptionalFeatureLike } from '@/types/5etools'
import type { CharacterClassChoiceOption, CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import { getClassChoiceOptionKey } from './classChoiceIdentity'

const nativePools = {
  phb: 'class:warlock|phb|choice:eldritch-invocations|2',
  xphb: 'class:warlock|xphb|choice:eldritch-invocations|1',
} as const

// The innate spell token does not encode self-only or component restrictions.
// Certify the complete native text and retain it as a static rule reference.
const contracts = [
  {
    name: 'Armor of Shadows',
    spell: 'Mage Armor',
    phb: '3af59b590a6c324115ba5e3857c038ce120d38ac304b07127d3735e1d38a883b',
    xphb: '7092f8886736adbfb2c7a2c699efcc8636718fcc17e4933bd5df24241a4e7f1f',
    revisedMinimum: 1,
  },
  {
    name: 'Mask of Many Faces',
    spell: 'Disguise Self',
    phb: 'ff46fb1c1a4ce3f25a305ec95e43dfc4e854838434240234b88037c781b0ac5c',
    xphb: 'bba6fc6c6702a99eb2266c6938cd484cc9d3fa4e80d3de8d7ccf7fd79f84f262',
    revisedMinimum: 2,
  },
  {
    name: 'Misty Visions',
    spell: 'Silent Image',
    phb: 'ebf970f4e423f5d3a40868f41014113fbcd373c593d11ff1436044281230b7a0',
    xphb: '4984396dfa2b8078e5b96e0a18dd82cdfaca4e9c2606af0a2573e6adf244183b',
    revisedMinimum: 2,
  },
] as const
const allowedFields = new Set([
  'name',
  'source',
  'page',
  'srd',
  'srd52',
  'basicRules',
  'basicRules2024',
  'reprintedAs',
  'featureType',
  'prerequisite',
  'entries',
  'additionalSpells',
])
const revisedWarlockLevel2 = 'fe50f2dc7e1abb2e025f9bb324f1a5ad74a38925e033723a593925704c94dd7f'

export function isNativeInvocationPoolId(id: string): boolean {
  return id === nativePools.phb || id === nativePools.xphb
}

export function isNativeInvocationPool(choice: NormalizedCharacterChoice): boolean {
  return (
    isNativeInvocationPoolId(choice.id) &&
    choice.owner.type === 'class' &&
    choice.source.kind === 'optional-feature-progression' &&
    /^optionalfeatureProgression\[\d+\]$/.test(choice.source.field) &&
    choice.optionFilter?.entityType === 'optionalFeature' &&
    choice.optionFilter.featureTypes?.length === 1 &&
    choice.optionFilter.featureTypes[0] === 'EI'
  )
}

export function getAtWillInvocationContract(
  selection: CharacterClassChoiceSelection,
  option: CharacterClassChoiceOption,
  feature: OptionalFeatureLike | undefined,
) {
  const source = norm(selection.classSource)
  if (
    (source !== 'phb' && source !== 'xphb') ||
    selection.choiceId !== nativePools[source] ||
    selection.kind !== 'optional-feature' ||
    norm(selection.className) !== 'warlock' ||
    selection.subclassName ||
    selection.subclassSource ||
    option.entityType !== 'optionalFeature' ||
    norm(option.source) !== source ||
    !feature ||
    norm(feature.name) !== norm(option.name) ||
    norm(feature.source) !== source
  )
    return undefined

  const rule = contracts.find((candidate) => norm(candidate.name) === norm(feature.name))
  if (
    !rule ||
    !hasFeatureSourceShape(feature, allowedFields) ||
    !Array.isArray(feature.featureType) ||
    feature.featureType.length !== 1 ||
    feature.featureType[0] !== 'EI' ||
    !Array.isArray(feature.entries) ||
    getFeatureSourceDigest(feature.entries, false) !== rule[source]
  )
    return undefined

  const minimumLevel = source === 'phb' ? 2 : rule.revisedMinimum
  const requiredPrerequisite = source === 'xphb' && minimumLevel === 2
  if (
    requiredPrerequisite
      ? getFeatureSourceDigest([feature.prerequisite], false) !== revisedWarlockLevel2
      : feature.prerequisite !== undefined
  )
    return undefined

  const token = rule.spell.toLowerCase() + (source === 'xphb' ? '|xphb' : '')
  if (JSON.stringify(feature.additionalSpells) !== JSON.stringify([{ innate: { _: [token] } }]))
    return undefined
  const grant = parseAdditionalSpellBlocks(feature.additionalSpells)[0].grants[0]
  return { reference: formatSpellReference(rule.spell, source.toUpperCase()), grant, minimumLevel }
}

export function getCurrentAtWillInvocation(
  selection: CharacterClassChoiceSelection,
  option: CharacterClassChoiceOption,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
) {
  const target = getClassChoiceOptionKey(option)
  const candidates = catalogs?.optionalFeatureCandidates
    ? (catalogs.optionalFeatureCandidates.get(target) ?? [])
    : (catalogs?.optionalFeatures ?? []).filter(
        (row) => norm(row.name) === norm(option.name) && norm(row.source) === norm(option.source),
      )
  const feature = candidates.length === 1 ? candidates[0] : undefined
  const contract = getAtWillInvocationContract(selection, option, feature)
  return contract && feature ? { ...contract, feature, target } : undefined
}
