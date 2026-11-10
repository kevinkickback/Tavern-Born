import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, OptionalFeatureLike, Spell5e, SubclassFeature } from '@/types/5etools'
import type { CharacterClassChoiceSelection, CharacterClassEntry } from '@/types/character'
import type { ClassCastingSourceProof } from '@/types/classCasting'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'
import { getClassCastingCopyParent } from './classCastingRules'
import {
  getRevisedInvocationPoolId,
  isRevisedInvocationPoolId,
} from './revisedInvocationPoolIdentity'

export {
  getRevisedInvocationPoolId,
  isRevisedInvocationPoolId,
} from './revisedInvocationPoolIdentity'

import { getSubclassFeatureIdentity } from './classFeatureIdentity'
import { DAMAGE_TYPE_LABELS } from './constants'
import { getCurrentDirectClassFeature } from './directClassFeatureSource'
import { featureOptionRulesSignature } from './featureRulesSignature'
import {
  type ClassFeatureSourceCatalog,
  getFeatureSourceDigest,
  hasFeatureSourceShape,
} from './featureSourceAudit'
import {
  findNativeSubclass,
  getDirectSubclassFeatureReference,
} from './nativeSubclassFeatureSource'
import { matchesNativeSubclassGain } from './nativeSubclassGain'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
} from './optionalClassDeclarationStructure'

export const REVISED_INVOCATION_POOL = 'class:warlock|xphb|choice:eldritch-invocations|1'
type InvocationOwner = { name: string; source: string }
export type InvocationCantripsByOwner = ReadonlyMap<string, readonly Spell5e[]>
type InvocationCatalog = ClassFeatureSourceCatalog & {
  classes?: readonly Class5e[]
  classCastingSources?: readonly ClassCastingSourceProof[]
}

export function getInvocationActorKey(owner: InvocationOwner) {
  return JSON.stringify([norm(owner.name), norm(owner.source)])
}

export function isRevisedInvocationSelection(selection: CharacterClassChoiceSelection) {
  return (
    isRevisedInvocationPoolId(selection.choiceId) &&
    selection.choiceId ===
      getRevisedInvocationPoolId({ name: selection.className, source: selection.classSource }) &&
    selection.kind === 'optional-feature' &&
    selection.classLevel === 1 &&
    !selection.subclassName &&
    !selection.subclassSource
  )
}

export function inheritsRevisedInvocations(
  owner: InvocationOwner,
  sources?: readonly ClassCastingSourceProof[],
) {
  const name = norm(owner.name)
  const source = norm(owner.source)
  if (name === 'warlock' && source === 'xphb') return true
  const parent = getClassCastingCopyParent(['class', name, source], sources ?? [])
  return parent?.[0] === 'class' && parent[1] === 'warlock' && parent[2] === 'xphb'
}

// The authored choice filter omits the range floor and the repeated target's uniqueness.
// Only the exact current prose and prerequisite combination supports these rules.
const damagePrerequisite = 'e43d5e58fc27aa5798036f39004c2099a53f18dc0f87dbab34ca4aa2d0ba235e'
const rules = {
  'agonizing blast': {
    condition: 'damage',
    entries: '855ddf7a24f6c3d3bfec8faf95eb87c8d52c25067585dd6aaef63de9d8a60ef4',
    prerequisite: damagePrerequisite,
  },
  'eldritch spear': {
    condition: 'range',
    entries: '4f7e2d53b4a92776b8e9dee09f8ad0be5597b8881e7b16d7158604d4de0f3a7d',
    prerequisite: damagePrerequisite,
  },
  'repelling blast': {
    condition: 'attack',
    entries: '45539807cd1685ca9835fb81c1dbfc58b17a2278b297bdb0d2d299e5a82c5c45',
    prerequisite: 'e3269cb9a4f5ebd09e46fa1b5ab6754902cb6ee16ca3124f10535d30256df58d',
  },
} as const
const fields = new Set([
  'name',
  'source',
  'page',
  'srd52',
  'featureType',
  'prerequisite',
  'entries',
])
type InvocationRule = (typeof rules)[keyof typeof rules]
const rulesByName = new Map(Object.entries(rules))
const damageTypes = new Set(Object.values(DAMAGE_TYPE_LABELS).map(norm))

function ruleFor(name: string): InvocationRule | undefined {
  return rulesByName.get(norm(name))
}

export function isRevisedTargetedInvocation(option: NormalizedChoiceOptionReference) {
  return (
    option.entityType === 'optionalFeature' &&
    norm(option.source) === 'xphb' &&
    !!ruleFor(option.name)
  )
}

function isRevisedInvocationCantripPool(choice: NormalizedCharacterChoice) {
  return (
    isRevisedInvocationPoolId(choice.id) &&
    choice.id === getRevisedInvocationPoolId(choice.owner) &&
    choice.kind === 'optional-feature' &&
    choice.level === 1 &&
    choice.owner.type === 'class' &&
    !choice.owner.subclassName &&
    !choice.owner.subclassSource &&
    choice.source.kind === 'optional-feature-progression' &&
    choice.source.field === 'optionalfeatureProgression[0]' &&
    choice.optionFilter?.entityType === 'optionalFeature' &&
    choice.optionFilter.featureTypes?.length === 1 &&
    choice.optionFilter.featureTypes[0] === 'EI'
  )
}

export function isCurrentRevisedInvocationCantripPool(
  choice: NormalizedCharacterChoice,
  catalogs: InvocationCatalog | undefined,
) {
  return !!getCurrentRevisedInvocationClass(choice, catalogs)
}

function getCurrentRevisedInvocationClass(
  choice: NormalizedCharacterChoice,
  catalogs: InvocationCatalog | undefined,
) {
  if (
    !catalogs ||
    !isRevisedInvocationCantripPool(choice) ||
    !inheritsRevisedInvocations(choice.owner, catalogs.classCastingSources)
  )
    return undefined
  const owners = catalogs.classes?.filter(
    (cls) =>
      norm(cls.name) === norm(choice.owner.name) && norm(cls.source) === norm(choice.owner.source),
  )
  const owner = owners?.length === 1 ? owners[0] : undefined
  if (!owner || owner.sourceIdentityConflict || '_copy' in owner) return undefined
  const current = owner.normalizedRules?.choices.filter((row) => row.id === choice.id)
  return current?.length === 1 &&
    (current[0] === choice ||
      featureOptionRulesSignature(current, false) ===
        featureOptionRulesSignature([choice], false)) &&
    Array.isArray(owner.optionalfeatureProgression) &&
    getFeatureSourceDigest(owner.optionalfeatureProgression, false) ===
      '07ec5fcd1fb2bff359ddc92e4900ec27e0316720862f921c802714c4daa1eefb' &&
    getFeatureSourceDigest([...choice.selectionCountByLevel], false) ===
      '7406adbb58b0e3cd19a4dae40030d4022265f705f8b00a62bd5a2fa854b2fbed' &&
    !!getCurrentDirectClassFeature(
      owner,
      catalogs,
      'class-feature|eldritch invocations|warlock|xphb|1|xphb',
      (row) => {
        if (!Array.isArray(row.entries)) return false
        const [first, ...rest] = row.entries
        return (
          typeof first === 'string' &&
          getFeatureSourceDigest(
            [
              first.replace(
                '{@filter Eldritch Invocation Options|optionalfeatures|feature type=EI|source===extend}',
                '{@filter Eldritch Invocation Options|optionalfeatures|feature type=EI|source=XPHB}',
              ),
              ...rest,
            ],
            false,
          ) === '6dd42ca613df38fd3cb19e56fbe7c0b0ec85f5a71b18487d06c911e7e6f3b9aa'
        )
      },
    )
    ? owner
    : undefined
}

/** The configured menu may extend the bundled list. Each used option still needs its exact link. */
export function hasCurrentRevisedInvocationOption(
  choice: NormalizedCharacterChoice,
  catalogs: InvocationCatalog | undefined,
  option: Pick<NormalizedChoiceOptionReference, 'name' | 'source'>,
) {
  const owner = getCurrentRevisedInvocationClass(choice, catalogs)
  if (!owner || !catalogs) return false
  const key = `${norm(option.name)}|${norm(option.source)}`
  return !!getCurrentDirectClassFeature(
    owner,
    catalogs,
    'class-feature|eldritch invocation options|warlock|xphb|1|xphb',
    (feature) => {
      if (!Array.isArray(feature.entries)) return false
      const [intro, value, ...extra] = feature.entries
      const menu = record(value)
      if (
        intro !== 'Eldritch Invocation options appear in alphabetical order.' ||
        extra.length ||
        menu.type !== 'options' ||
        menu.count !== 1 ||
        !Array.isArray(menu.entries) ||
        Object.keys(menu).some((field) => !['type', 'count', 'entries'].includes(field))
      )
        return false
      const rows = menu.entries
        .map(record)
        .filter(
          (row) =>
            typeof row.optionalfeature === 'string' &&
            row.optionalfeature.split('|').map(norm).join('|') === key,
        )
      const [row] = rows
      return (
        rows.length === 1 &&
        row.type === 'refOptionalfeature' &&
        Object.keys(row).every((field) =>
          ['type', 'optionalfeature', 'preserve'].includes(field),
        ) &&
        record(row.preserve).prerequisite === true &&
        Object.keys(record(row.preserve)).length === 1
      )
    },
  )
}

const celestial = {
  className: 'Warlock',
  name: 'Celestial Patron',
  source: 'XPHB',
  shortName: 'celestial',
}
const celestialIntro = 'subclass-feature|celestial patron|warlock|xphb|celestial|xphb|3|xphb'
const celestialSpells = 'subclass-feature|celestial spells|warlock|xphb|celestial|xphb|3|xphb'

/** The native patron's level-3 table corroborates its two exact fixed-known cantrips. */
export function hasCurrentCelestialInvocationCantrips(
  cls: Class5e,
  entry: CharacterClassEntry,
  catalogs: {
    subclassFeatures: readonly SubclassFeature[]
    subclassFeatureCandidates?: ReadonlyMap<string, readonly SubclassFeature[]>
  },
) {
  if (
    norm(entry.subclass) !== norm(celestial.name) ||
    norm(entry.subclassSource) !== norm(celestial.source) ||
    entry.levels < 3 ||
    !matchesNativeSubclassGain(cls, 'class-feature|warlock subclass|warlock|xphb|3|xphb', 3)
  )
    return false
  const subclass = findNativeSubclass(cls, celestial)
  const blocks = subclass?.additionalSpells
  if (
    !subclass ||
    blocks?.length !== 1 ||
    getFeatureSourceDigest([blocks[0].known], false) !==
      'e587a4ba71b4a603a8191087342af7737423d7a81e906f25bbe8ddaef0c080ee'
  )
    return false
  const isExactLeaf = (row: SubclassFeature | undefined) =>
    !!row &&
    !row.sourceIdentityConflict &&
    getSubclassFeatureIdentity(row) === celestialSpells &&
    Array.isArray(row.entries) &&
    getFeatureSourceDigest(row.entries, false) ===
      '2160f9f3dbdebf26d249fbf843867b9fcd809c6e6fc56373b7f98b0a94564aee'
  const intro = getDirectSubclassFeatureReference(subclass, celestialIntro)?.feature
  if (
    !intro ||
    intro.sourceIdentityConflict ||
    getSubclassFeatureIdentity(intro) !== celestialIntro
  )
    return false
  const refs = (intro.entries ?? [])
    .map(record)
    .filter(
      (row) =>
        typeof row.subclassFeature === 'string' &&
        decodeOptionalDeclaration(row.subclassFeature, 'subclassFeature')?.target ===
          celestialSpells,
    )
  const [ref] = refs
  const mirrors =
    catalogs.subclassFeatureCandidates?.get(celestialSpells) ??
    catalogs.subclassFeatures.filter((row) => getSubclassFeatureIdentity(row) === celestialSpells)
  return (
    refs.length === 1 &&
    ref.type === 'refSubclassFeature' &&
    typeof ref.subclassFeature === 'string' &&
    exactOptionalDeclarationReference(ref, ref.subclassFeature, 'subclassFeature') &&
    Object.keys(ref).every(
      (key) => key === 'type' || key === 'subclassFeature' || key === 'feature',
    ) &&
    isExactLeaf(ref.feature as SubclassFeature | undefined) &&
    mirrors.length > 0 &&
    mirrors.every(isExactLeaf)
  )
}
export function getRevisedInvocationCantripRule(feature: OptionalFeatureLike) {
  const rule = ruleFor(feature.name)
  const prerequisite = feature.prerequisite?.[0]?.level
  if (
    !rule ||
    norm(feature.source) !== 'xphb' ||
    !hasFeatureSourceShape(feature, fields) ||
    !Array.isArray(feature.featureType) ||
    feature.featureType.length !== 1 ||
    feature.featureType[0] !== 'EI' ||
    !Array.isArray(feature.entries) ||
    getFeatureSourceDigest(feature.entries, false) !== rule.entries ||
    !Array.isArray(feature.prerequisite) ||
    getFeatureSourceDigest(feature.prerequisite, false) !== rule.prerequisite ||
    typeof prerequisite !== 'object'
  )
    return undefined
  return { condition: rule.condition, prerequisite }
}

export function meetsInvocationCantripCondition(
  spell: Spell5e,
  condition: InvocationRule['condition'],
) {
  if (spell.level !== 0) return false
  if (
    !Array.isArray(spell.damageInflict) ||
    !spell.damageInflict.some((value) => typeof value === 'string' && damageTypes.has(value))
  )
    return false
  if (condition === 'damage') return true
  if (condition === 'attack')
    return (
      Array.isArray(spell.spellAttack) &&
      spell.spellAttack.some((value) => typeof value === 'string' && /^[mro]$/i.test(value))
    )
  const range = spell.range
  return (
    range?.type === 'point' &&
    range.distance?.type === 'feet' &&
    typeof range.distance.amount === 'number' &&
    Number.isFinite(range.distance.amount) &&
    range.distance.amount >= 10
  )
}
