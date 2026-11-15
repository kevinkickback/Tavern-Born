import { getNormalizedItemTraits } from '@/lib/calculations/itemClassification'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getClassChoiceOptionKey } from '@/lib/character/classChoiceIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, Item5e, Subclass5e } from '@/types/5etools'
import type { Character, CharacterClassChoiceSelection } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import { getNormalizedClassChoiceId } from './classChoiceId'
import { getClassFeatureIdentity, getSubclassFeatureIdentity } from './classFeatureIdentity'
import { getCurrentDirectClassFeature } from './directClassFeatureSource'
import { getItemEntryIdentity } from './itemEntries'
import { getDirectSubclassFeatureReference } from './nativeSubclassFeatureSource'
import { getCurrentNativeSubclassGain } from './nativeSubclassGain'
import { optionalDeclarationObject as record } from './optionalClassDeclarationStructure'
import { getOwnedSubclassFeature } from './ownedSubclassFeature'

const owner = {
  type: 'subclass',
  name: 'Artificer',
  source: 'EFA',
  subclassName: 'Armorer',
  subclassSource: 'EFA',
  featureName: 'Improved Armorer',
  featureSource: 'EFA',
} as const
const gain = 9
const label = 'Armor Replication'
const planName = 'Replicate Magic Item'
const planTarget = getClassFeatureIdentity({
  name: planName,
  className: owner.name,
  classSource: owner.source,
  level: 2,
  source: owner.source,
})!
const featureRef = `${owner.featureName}|${owner.name}|${owner.source}|${owner.subclassName}|${owner.subclassSource}|${gain}|${owner.featureSource}`
export const ARMOR_REPLICATION_CHOICE_ID = getNormalizedClassChoiceId(owner, label, gain)

export function isArtificerReplicatePlanChoice(choice: NormalizedCharacterChoice) {
  return (
    choice.kind === 'item' &&
    choice.source.kind === 'class-table' &&
    choice.owner.type === 'class' &&
    choice.owner.name === owner.name &&
    choice.owner.source === owner.source &&
    choice.owner.featureName === planName &&
    choice.owner.featureSource === owner.source
  )
}

export function getArmorReplication(
  cls: Pick<Class5e, 'name' | 'source'>,
  subclass: Pick<Subclass5e, 'name' | 'source'> | undefined,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
) {
  if (
    cls.name !== owner.name ||
    cls.source !== owner.source ||
    subclass?.name !== owner.subclassName ||
    subclass.source !== owner.subclassSource
  )
    return undefined
  const parents = catalogs?.classes?.filter(
    (row) => row.name === owner.name && row.source === owner.source,
  )
  if (parents?.length !== 1 || parents[0].sourceIdentityConflict || '_copy' in parents[0])
    return undefined
  const [parent] = parents
  const roots = parent.subclasses?.filter(
    (row) =>
      row.name === owner.subclassName &&
      row.source === owner.subclassSource &&
      row.shortName === owner.subclassName &&
      row.className === owner.name &&
      row.classSource === owner.source,
  )
  if (roots?.length !== 1 || roots[0].sourceIdentityConflict || '_copy' in roots[0])
    return undefined
  const target = getSubclassFeatureIdentity({
    name: owner.featureName,
    source: owner.featureSource,
    className: owner.name,
    classSource: owner.source,
    subclassShortName: owner.subclassName,
    subclassSource: owner.subclassSource,
    level: gain,
  })
  if (!target) return undefined
  const ref = getDirectSubclassFeatureReference(roots[0], target)

  const source =
    ref && getCurrentNativeSubclassGain(parent, gain)
      ? getOwnedSubclassFeature(parent, roots[0], target, catalogs)?.feature
      : undefined
  const sections = source?.entries?.map(record).filter((entry) => entry.name === label)
  const introduction = source?.entries?.filter((entry) => typeof entry === 'string')
  const available =
    !!source &&
    !source.sourceIdentityConflict &&
    !source.featureOptionSourceConflict &&
    !source.isClassFeatureVariant &&
    !('_copy' in source) &&
    getSubclassFeatureIdentity(source) === target &&
    introduction?.length === 1 &&
    introduction[0] === 'You gain the following benefits.' &&
    sections?.length === 1 &&
    sections[0].type === 'entries' &&
    Array.isArray(sections[0].entries) &&
    sections[0].entries.length === 2 &&
    sections[0].entries[0] ===
      'You learn an additional plan for your Replicate Magic Item feature, and it must be in the Armor category. If you replace that plan, you must replace it with another Armor plan.' &&
    sections[0].entries[1] ===
      'In addition, you can create an additional item with that feature, and the item must also be in the Armor category.'
  const plans = parent.normalizedRules?.choices.filter(isArtificerReplicatePlanChoice)
  const planSource = catalogs && getCurrentDirectClassFeature(parent, catalogs, planTarget)
  const plan =
    plans?.length === 1 && planSource && !planSource.featureOptionSourceConflict
      ? plans[0]
      : undefined
  const choice: NormalizedCharacterChoice = {
    id: ARMOR_REPLICATION_CHOICE_ID,
    label,
    kind: 'item',
    owner,
    level: gain,
    minimumSelections: 1,
    maximumSelections: 1,
    selectionCountByLevel: Array.from({ length: 20 }, (_, index) => Number(index + 1 >= gain)),
    options: [],
    repeatable: false,
    replacement: plan?.replacement ?? { cadence: 'never' },
    source: {
      kind: 'class-feature-options',
      field: `subclassFeatureRefs:${featureRef}:entries`,
    },
  }
  return { choice, plan, available: available && !!plan }
}

export function isArmorReplicationSelection(selection: CharacterClassChoiceSelection) {
  const [option] = selection.selected
  return (
    selection.choiceId === ARMOR_REPLICATION_CHOICE_ID &&
    selection.kind === 'item' &&
    norm(selection.className) === norm(owner.name) &&
    norm(selection.classSource) === norm(owner.source) &&
    norm(selection.subclassName) === norm(owner.subclassName) &&
    norm(selection.subclassSource) === norm(owner.subclassSource) &&
    selection.classLevel === gain &&
    selection.selected.length === 1 &&
    option?.entityType === 'item' &&
    option.slotLevel === gain &&
    !!option.source?.trim() &&
    option.ref === undefined &&
    option.invocationCantrip === undefined
  )
}

export function getReservedArtificerPlanKeys(character: Character | undefined, choiceId: string) {
  if (
    !character?.classProgression.some(
      (entry) =>
        norm(entry.name) === norm(owner.name) &&
        norm(entry.source) === norm(owner.source) &&
        norm(entry.subclass) === norm(owner.subclassName) &&
        norm(entry.subclassSource) === norm(owner.subclassSource) &&
        entry.levels >= gain,
    )
  )
    return new Set<string>()
  const armorChoice = choiceId === ARMOR_REPLICATION_CHOICE_ID
  const selections = character.classChoiceSelections?.filter((row) => row.choiceId === choiceId)
  if (armorChoice && selections?.length !== 1) return new Set<string>()
  return new Set(
    selections
      ?.filter((row) =>
        armorChoice
          ? isArmorReplicationSelection(row)
          : !row.inactive &&
            norm(row.className) === norm(owner.name) &&
            norm(row.classSource) === norm(owner.source) &&
            !row.subclassName &&
            !row.subclassSource,
      )
      .flatMap(({ selected }) =>
        selected.filter((option) => option.entityType === 'item').map(getClassChoiceOptionKey),
      ),
  )
}

export function createArmorPlanClassifier(items: readonly Item5e[]) {
  const exact = new Map<string, Item5e | undefined>()
  for (const item of items) {
    const key = getItemEntryIdentity(item.name, item.source)
    exact.set(key, exact.has(key) || item.sourceIdentityConflict ? undefined : item)
  }
  const resolve = (name: string, source: string) => exact.get(getItemEntryIdentity(name, source))
  const isArmor = (item: Item5e, parents: ReadonlySet<Item5e>): boolean => {
    if (parents.has(item) || parents.size >= 8) return false
    if (getNormalizedItemTraits(item).isArmor) return true
    const next = new Set([...parents, item])
    if (Array.isArray(item.items))
      return (
        item.items.length > 0 &&
        item.items.every((value) => {
          const [name, source, ...other] = typeof value === 'string' ? value.split('|') : []
          const child = name && source && !other.length ? resolve(name, source) : undefined
          return !!child && isArmor(child, next)
        })
      )
    // An authored generic plan can describe a suit or shield even when its own item type is GV.
    return (
      !!item.magicVariantReference &&
      Array.isArray(item.requires) &&
      item.requires.length > 0 &&
      item.requires.every((requirement) => {
        const rule = record(requirement)
        const base =
          typeof rule.name === 'string' && typeof rule.source === 'string'
            ? resolve(rule.name, rule.source)
            : undefined
        return (
          rule.armor === true ||
          (typeof rule.type === 'string' && getNormalizedItemTraits({ type: rule.type }).isArmor) ||
          (!!base && getNormalizedItemTraits(base).isArmor)
        )
      })
    )
  }
  return (name: string, source: string | undefined) => {
    const item = source && resolve(name, source)
    return !!item && isArmor(item, new Set())
  }
}
