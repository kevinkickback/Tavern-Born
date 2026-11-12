import { readFixedInvocationSpell } from '@/lib/5etools/declaredInvocationCasting'
import { getFeatureSourceDigest, hasFeatureSourceShape } from '@/lib/5etools/featureSourceAudit'
import { optionalDeclarationObject as record } from '@/lib/5etools/optionalClassDeclarationStructure'
import { CLASSIC_INVOCATION_POOL_ID } from '@/lib/5etools/revisedInvocationPoolIdentity'
import {
  getRevisedInvocationPoolId,
  hasCurrentRevisedInvocationOption,
  isRevisedInvocationPoolId,
  isRevisedInvocationSelection,
} from '@/lib/5etools/warlockInvocationCantripSource'
import { formatSpellReference } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { OptionalFeatureLike } from '@/types/5etools'
import type { CharacterClassChoiceOption, CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import { getClassChoiceOptionKey } from './classChoiceIdentity'

// The innate spell token does not encode self-only or component restrictions.
// Certify the complete native text and retain it as a static rule reference.
type AtWillInvocationRule = {
  name: string
  spell: string
  phb: string
  xphb?: string
  spellLevel?: number
  classicMinimum?: number
  revisedMinimum?: number
}

const contracts: readonly AtWillInvocationRule[] = [
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
  {
    name: 'Ascendant Step',
    spell: 'Levitate',
    spellLevel: 2,
    classicMinimum: 9,
    revisedMinimum: 5,
    phb: '7993029811dda17983cc20320f7410780705a59dc4851f874ee650e7ad5c1f6d',
    xphb: '3a87576e311d27a12a8c9c7e9bef08c37411449448e5dd3596fa00e383444171',
  },
  {
    name: 'Beast Speech',
    spell: 'Speak with Animals',
    phb: '8186d37da2b7329b686f2bbbc45fa4ad841d1313505ab1fa7e9501c500c0fe87',
  },
  {
    name: 'Eldritch Sight',
    spell: 'Detect Magic',
    phb: '3eea0d667a2a44e53a108d6b2c87b94bc8c01d579463c04b075985ec435153e4',
  },
  {
    name: 'Fiendish Vigor',
    spell: 'False Life',
    phb: '8ebb742380ef257a36beac773b38a0acadc3b0f568a9a5f2511a47837b277646',
    xphb: 'c2617fb4c715f0ea3e2764a8a6d4f7020153edec85fcae0e5bf9d2ecbf9b992b',
    revisedMinimum: 2,
  },
]
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

export function isInvocationPoolId(id: string): boolean {
  return id === CLASSIC_INVOCATION_POOL_ID || isRevisedInvocationPoolId(id)
}

export function isInvocationPool(choice: NormalizedCharacterChoice): boolean {
  return (
    (choice.id === CLASSIC_INVOCATION_POOL_ID ||
      choice.id === getRevisedInvocationPoolId(choice.owner)) &&
    choice.owner.type === 'class' &&
    choice.source.kind === 'optional-feature-progression' &&
    /^optionalfeatureProgression\[\d+\]$/.test(choice.source.field) &&
    choice.optionFilter?.entityType === 'optionalFeature' &&
    choice.optionFilter.featureTypes?.length === 1 &&
    choice.optionFilter.featureTypes[0] === 'EI'
  )
}

export function isRevisedAtWillInvocationOption(
  option: NormalizedChoiceOptionReference,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  if (option.entityType !== 'optionalFeature' || norm(option.source) !== 'xphb') return false
  if (contracts.some((row) => row.xphb && norm(row.name) === norm(option.name))) return true
  const spell = readFixedInvocationSpell(getInvocationLeaf(option, catalogs)?.feature)
  return !!spell && !spell.limited
}

export function getAtWillInvocationContract(
  selection: CharacterClassChoiceSelection,
  option: CharacterClassChoiceOption,
  feature: OptionalFeatureLike | undefined,
) {
  const revised = isRevisedInvocationSelection(selection)
  const source = revised ? 'xphb' : 'phb'
  if (
    (!revised &&
      (selection.choiceId !== CLASSIC_INVOCATION_POOL_ID ||
        norm(selection.className) !== 'warlock' ||
        norm(selection.classSource) !== 'phb')) ||
    selection.kind !== 'optional-feature' ||
    selection.subclassName ||
    selection.subclassSource
  )
    return undefined
  return readAtWillInvocation(source, option, feature)
}

function readAtWillInvocation(
  source: 'phb' | 'xphb',
  option: NormalizedChoiceOptionReference,
  feature: OptionalFeatureLike | undefined,
) {
  if (
    option.entityType !== 'optionalFeature' ||
    (source === 'xphb' && norm(option.source) !== source) ||
    option.ref ||
    option.invocationCantrip ||
    !feature ||
    norm(feature.name) !== norm(option.name) ||
    norm(feature.source) !== norm(option.source) ||
    !hasFeatureSourceShape(feature, allowedFields)
  )
    return undefined

  const rule =
    norm(feature.source) === source
      ? contracts.find((candidate) => norm(candidate.name) === norm(feature.name))
      : undefined
  if (!rule) {
    const grant = readFixedInvocationSpell(feature)
    const minimumLevel = getInvocationSpellMinimumLevel(feature, source)
    return grant && !grant.limited && minimumLevel
      ? { reference: grant.reference, minimumLevel, spellLevel: undefined }
      : undefined
  }
  const digest = rule[source]
  const minimumLevel = source === 'phb' ? (rule?.classicMinimum ?? 2) : rule?.revisedMinimum
  if (
    !digest ||
    !minimumLevel ||
    !Array.isArray(feature.featureType) ||
    feature.featureType.length !== 1 ||
    feature.featureType[0] !== 'EI' ||
    !Array.isArray(feature.entries) ||
    getFeatureSourceDigest(feature.entries, false) !== digest
  )
    return undefined

  const requiredPrerequisite =
    source === 'phb' ? rule.classicMinimum !== undefined : minimumLevel > 1
  const expectedPrerequisite = requiredPrerequisite
    ? [
        {
          level: {
            level: minimumLevel,
            class: {
              name: 'Warlock',
              ...(source === 'xphb' && { source: 'XPHB', visibleStats: true }),
            },
          },
        },
      ]
    : undefined
  if (
    expectedPrerequisite
      ? getFeatureSourceDigest([feature.prerequisite], false) !==
        getFeatureSourceDigest([expectedPrerequisite], false)
      : feature.prerequisite !== undefined
  )
    return undefined
  const token = rule.spell.toLowerCase() + (source === 'xphb' ? '|xphb' : '')
  if (JSON.stringify(feature.additionalSpells) !== JSON.stringify([{ innate: { _: [token] } }]))
    return undefined
  return {
    reference: formatSpellReference(rule.spell, source.toUpperCase()),
    minimumLevel,
    spellLevel: rule.spellLevel ?? 1,
  }
}

export function getInvocationSpellMinimumLevel(
  feature: OptionalFeatureLike,
  source: 'phb' | 'xphb',
) {
  if (feature.prerequisite === undefined) return source === 'phb' ? 2 : 1
  if (!Array.isArray(feature.prerequisite) || feature.prerequisite.length !== 1) return undefined
  const requirement = record(feature.prerequisite[0])
  const level = record(requirement.level)
  const cls = record(level.class)
  if (
    Object.keys(requirement).some((key) => key !== 'level' && key !== 'pact') ||
    (requirement.pact !== undefined &&
      !['Blade', 'Chain', 'Tome'].includes(String(requirement.pact))) ||
    Object.keys(level).some((key) => key !== 'level' && key !== 'class') ||
    Object.keys(cls).some((key) => !['name', 'source', 'visibleStats'].includes(key)) ||
    norm(typeof cls.name === 'string' ? cls.name : undefined) !== 'warlock' ||
    ((source === 'xphb' || cls.source !== undefined) &&
      norm(typeof cls.source === 'string' ? cls.source : undefined) !== source) ||
    typeof level.level !== 'number' ||
    !Number.isInteger(level.level) ||
    level.level < 1 ||
    level.level > 20
  )
    return undefined
  return level.level
}
export function getInvocationLeaf(
  option: NormalizedChoiceOptionReference,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
) {
  if (option.entityType !== 'optionalFeature' || option.ref || option.invocationCantrip)
    return undefined
  const target = getClassChoiceOptionKey(option)
  const candidates = catalogs?.optionalFeatureCandidates
    ? (catalogs.optionalFeatureCandidates.get(target) ?? [])
    : (catalogs?.optionalFeatures ?? []).filter(
        (row) => norm(row.name) === norm(option.name) && norm(row.source) === norm(option.source),
      )
  if (candidates.length !== 1) return undefined
  const [feature] = candidates
  const raw = record(feature)
  return norm(feature.name) === norm(option.name) &&
    norm(feature.source) === norm(option.source) &&
    !raw._copy &&
    !raw.sourceIdentityConflict &&
    !raw.featureOptionSourceConflict
    ? { feature, target }
    : undefined
}

export function getCurrentRevisedAtWillInvocation(
  choice: NormalizedCharacterChoice,
  option: NormalizedChoiceOptionReference,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
) {
  const leaf = getInvocationLeaf(option, catalogs)
  const contract = leaf && readAtWillInvocation('xphb', option, leaf.feature)
  return leaf && contract && hasCurrentRevisedInvocationOption(choice, catalogs, option)
    ? { ...contract, ...leaf }
    : undefined
}

export function getCurrentAtWillInvocation(
  choice: NormalizedCharacterChoice,
  selection: CharacterClassChoiceSelection,
  option: CharacterClassChoiceOption,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  ambiguousPool: boolean,
) {
  if (isRevisedInvocationSelection(selection) && !ambiguousPool)
    return getCurrentRevisedAtWillInvocation(choice, option, catalogs)
  const leaf = getInvocationLeaf(option, catalogs)
  const contract = getAtWillInvocationContract(selection, option, leaf?.feature)
  return contract && leaf ? { ...contract, ...leaf } : undefined
}
