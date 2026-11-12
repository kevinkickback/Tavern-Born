import { parseAdditionalSpellBlocks } from '@/lib/5etools/additionalSpells'
import { getFeatureSourceDigest, hasFeatureSourceShape } from '@/lib/5etools/featureSourceAudit'
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

const classicPool = 'class:warlock|phb|choice:eldritch-invocations|2'

// The innate spell token does not encode self-only or component restrictions.
// Certify the complete native text and retain it as a static rule reference.
type AtWillInvocationRule = {
  name: string
  spell: string
  phb?: string
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
  {
    name: 'Otherworldly Leap',
    spell: 'Jump',
    classicMinimum: 9,
    revisedMinimum: 2,
    phb: '3bb098ebc0d363efffbfa0a8e055cd08c7a31b54c5696c9268167ed8052e5aea',
    xphb: '2402226ee56b97266919043aa98e07c001eaa3c5cfd3c80ce40960812c23c623',
  },
  {
    name: 'Master of Myriad Forms',
    spell: 'Alter Self',
    spellLevel: 2,
    classicMinimum: 15,
    revisedMinimum: 5,
    phb: '5b9a337aca3e92b0e08234c09182e98cec10f703412e40fa530feb509c967d97',
    xphb: 'a707456d98c6fccdbc437c1d0a7d12e63076a40e307603457b77d865a3620e69',
  },
  {
    name: 'One with Shadows',
    spell: 'Invisibility',
    spellLevel: 2,
    revisedMinimum: 5,
    xphb: '64de7c9a9f52d5da3ff46a6f64a1b776bdff779afd4cc05ca744860bb43aa54f',
  },
  {
    name: 'Visions of Distant Realms',
    spell: 'Arcane Eye',
    spellLevel: 4,
    classicMinimum: 15,
    revisedMinimum: 9,
    phb: 'eb308d81e292c66d83958e374db1c61bd5bbd1d99f5ddf99ef3370fc9c7404cf',
    xphb: 'b6a3b4dc109799f0e69f7d318e699bc8f394ce9555c360ffd59682e44e380f1b',
  },
  {
    name: 'Whispers of the Grave',
    spell: 'Speak with Dead',
    spellLevel: 3,
    classicMinimum: 9,
    revisedMinimum: 7,
    phb: '305ee4c5ebf3f8faf32f8797ab21315c09b507b3a6db9d4d72cafb91389dc47a',
    xphb: '5f711970e9f69eca7f618a526284aedbca258fd1a2c45f17236a9a4f15fa4fea',
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
  return id === classicPool || isRevisedInvocationPoolId(id)
}

export function isInvocationPool(choice: NormalizedCharacterChoice): boolean {
  return (
    (choice.id === classicPool || choice.id === getRevisedInvocationPoolId(choice.owner)) &&
    choice.owner.type === 'class' &&
    choice.source.kind === 'optional-feature-progression' &&
    /^optionalfeatureProgression\[\d+\]$/.test(choice.source.field) &&
    choice.optionFilter?.entityType === 'optionalFeature' &&
    choice.optionFilter.featureTypes?.length === 1 &&
    choice.optionFilter.featureTypes[0] === 'EI'
  )
}

export function isRevisedAtWillInvocationOption(option: NormalizedChoiceOptionReference) {
  return (
    option.entityType === 'optionalFeature' &&
    norm(option.source) === 'xphb' &&
    contracts.some((row) => row.xphb && norm(row.name) === norm(option.name))
  )
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
      (selection.choiceId !== classicPool ||
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
    norm(option.source) !== source ||
    option.ref ||
    option.invocationCantrip ||
    !feature ||
    norm(feature.name) !== norm(option.name) ||
    norm(feature.source) !== source
  )
    return undefined

  const rule = contracts.find((candidate) => norm(candidate.name) === norm(feature.name))
  const digest = rule?.[source]
  const minimumLevel = source === 'phb' ? (rule?.classicMinimum ?? 2) : rule?.revisedMinimum
  if (
    !rule ||
    !digest ||
    !minimumLevel ||
    !hasFeatureSourceShape(feature, allowedFields) ||
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
  const grant = parseAdditionalSpellBlocks(feature.additionalSpells)[0].grants[0]
  return {
    reference: formatSpellReference(rule.spell, source.toUpperCase()),
    grant,
    minimumLevel,
    spellLevel: rule.spellLevel ?? 1,
  }
}

function getInvocationLeaf(
  option: NormalizedChoiceOptionReference,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
) {
  const target = getClassChoiceOptionKey(option)
  const candidates = catalogs?.optionalFeatureCandidates
    ? (catalogs.optionalFeatureCandidates.get(target) ?? [])
    : (catalogs?.optionalFeatures ?? []).filter(
        (row) => norm(row.name) === norm(option.name) && norm(row.source) === norm(option.source),
      )
  return candidates.length === 1 ? { feature: candidates[0], target } : undefined
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
