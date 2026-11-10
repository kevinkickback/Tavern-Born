import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import { getClassFeatureIdentity } from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { getCurrentDirectClassFeature } from '@/lib/5etools/directClassFeatureSource'
import {
  getCurrentSelectedClass,
  getEarnedDirectClassFeature,
  hasCurrentSubclassFeatureReplacement,
  permitsClassRuleSource,
} from '@/lib/5etools/earnedClassFeatureSource'
import { optionalDeclarationObject as record } from '@/lib/5etools/optionalClassDeclarationStructure'
import { getOwnedSubclassFeature } from '@/lib/5etools/ownedSubclassFeature'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type {
  Character,
  CharacterClassChoiceSelection,
  CharacterClassEntry,
} from '@/types/character'
import type { NormalizedCharacterChoice, NormalizedChoiceOptionReference } from '@/types/classRules'
import {
  type ClassChoiceFeatureCatalogs,
  scopeClassChoiceFeatureCatalogs,
} from './classChoiceFeatureCatalogs'
import {
  getClassChoiceCatalogOptionKey,
  getClassChoiceDeclaration,
  getFeatureOwnerKey,
} from './classChoiceIdentity'

const primalTarget = 'subclass-feature|primal companion|ranger|xphb|beast master|xphb|3|xphb'
const masteryTarget = 'class-feature|weapon mastery|ranger|xphb|1|xphb'
const rovingTarget = 'class-feature|roving|ranger|xphb|6|xphb'
const formPrefix = 'companion-family:v1:'
const masteryRef = 'companion-family-mastery:v1'

export function isCompanionFamilyOption(option: NormalizedChoiceOptionReference) {
  if (
    option.entityType !== 'creature' ||
    !option.name.trim() ||
    !option.source?.trim() ||
    !option.ref?.startsWith(formPrefix)
  )
    return false
  try {
    const form: unknown = JSON.parse(option.ref.slice(formPrefix.length))
    return (
      Array.isArray(form) &&
      form.length === 2 &&
      form.every(
        (part) => typeof part === 'string' && !!part && part === norm(part) && !/[|{}#]/.test(part),
      ) &&
      option.ref === formPrefix + JSON.stringify(form)
    )
  } catch {
    return false
  }
}
export const isCompanionFamilyMastery = (option: NormalizedChoiceOptionReference) =>
  option.entityType === 'creature' && option.ref === masteryRef && !!option.source?.trim()

function familyContext(
  character: Character,
  entry: CharacterClassEntry,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  if (
    !catalogs ||
    !permitsClassRuleSource(character, entry.subclassSource) ||
    !permitsClassRuleSource(character, 'XPHB')
  )
    return undefined
  const cls = getCurrentSelectedClass(character, entry, catalogs)
  const subclasses = cls?.subclasses?.filter((row) =>
    findClassReference({ name: entry.subclass, source: entry.subclassSource }, [row]),
  )
  const sources = catalogs.companionFamilySources?.filter((row) => findClassReference(entry, [row]))
  if (!cls || subclasses?.length !== 1 || sources?.length !== 1) return undefined
  const [subclass] = subclasses
  const scoped = scopeClassChoiceFeatureCatalogs(
    catalogs,
    getFeatureOwnerKey(entry.name, entry.source, entry.subclass, entry.subclassSource),
  )
  const grant = getOwnedSubclassFeature(cls, subclass, primalTarget, scoped)
  return grant && grant.level <= entry.levels
    ? { cls, subclass, grant, source: sources[0] }
    : undefined
}

function getCompanionFamilySourceForChoice(
  character: Character,
  choice: NormalizedCharacterChoice,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  if (choice.kind !== 'creature' || getClassChoiceDeclaration(choice)?.target !== primalTarget)
    return undefined
  const entry = character.classProgression.find(
    (row) =>
      findClassReference(choice.owner, [row]) &&
      norm(row.subclass) === norm(choice.owner.subclassName) &&
      norm(row.subclassSource) === norm(choice.owner.subclassSource),
  )
  const current = entry && familyContext(character, entry, catalogs)
  return current?.grant.level === choice.level && current.source.families.length
    ? current
    : undefined
}

export const hasAuthoredCompanionFamilies = (
  character: Character,
  choice: NormalizedCharacterChoice,
  catalogs: ClassChoiceFeatureCatalogs,
) => !!getCompanionFamilySourceForChoice(character, choice, catalogs)

export function getCompanionFamilyOptions(
  character: Character,
  choice: NormalizedCharacterChoice,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  const current = getCompanionFamilySourceForChoice(character, choice, catalogs)
  if (!current) return []
  const formKey = (form: { name: string; source?: string }) =>
    JSON.stringify([norm(form.name), norm(form.source)])
  const forms = new Set(choice.options.filter((row) => row.entityType === 'creature').map(formKey))
  const byForm = new Map<
    string,
    NonNullable<ClassChoiceFeatureCatalogs['creatures']>[number] | undefined
  >()
  for (const creature of catalogs.creatures ?? []) {
    const key = formKey(creature)
    if (forms.has(key)) byForm.set(key, byForm.has(key) ? undefined : creature)
  }
  return current.source.families.flatMap((family) =>
    family.creatures.flatMap((form) => {
      if (!permitsClassRuleSource(character, form.source)) return []
      const creature = byForm.get(formKey(form))
      if (!creature || creature.sourceIdentityConflict === true) return []
      const reference: NormalizedChoiceOptionReference = {
        entityType: 'creature',
        name: family.name,
        source: current.source.source,
        ref: formPrefix + JSON.stringify([norm(form.name), norm(form.source)]),
      }
      return [{ family, creature, reference }]
    }),
  )
}

function getSavedCompanionFamily(
  character: Character,
  entry: CharacterClassEntry,
  catalogs?: ClassChoiceFeatureCatalogs,
) {
  const current = familyContext(character, entry, catalogs)
  if (!current || !catalogs) return undefined
  const choices = current.subclass.normalizedRules?.choices.filter(
    (choice) => getClassChoiceDeclaration(choice)?.target === primalTarget,
  )
  if (choices?.length !== 1) return undefined
  const [choice] = choices
  const selected = character.classChoiceSelections?.filter(
    (row) =>
      row.choiceId === choice.id &&
      row.kind === 'creature' &&
      row.classLevel === choice.level &&
      norm(row.className) === norm(entry.name) &&
      norm(row.classSource) === norm(entry.source) &&
      norm(row.subclassName) === norm(entry.subclass) &&
      norm(row.subclassSource) === norm(entry.subclassSource),
  )
  if (
    selected?.length !== 1 ||
    selected[0].selected.length !== 1 ||
    selected[0].selected[0].slotLevel !== choice.level
  )
    return undefined
  const key = getClassChoiceCatalogOptionKey(selected[0].selected[0])
  const match = getCompanionFamilyOptions(character, choice, catalogs).find(
    (row) => !row.family.unusual && getClassChoiceCatalogOptionKey(row.reference) === key,
  )
  return match && { ...match, ...current, selection: selected[0] }
}

export function getCompanionFamilyMasteryOption(
  character: Character,
  choice: NormalizedCharacterChoice,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  if (
    !choice.optionFilter?.requiresMastery ||
    getClassChoiceDeclaration(choice)?.target !== masteryTarget
  )
    return undefined
  const entry = character.classProgression.find((row) => findClassReference(choice.owner, [row]))
  if (!entry || !getEarnedDirectClassFeature(character, entry, catalogs, masteryTarget))
    return undefined
  const current = entry && getSavedCompanionFamily(character, entry, catalogs)
  if (!current) return undefined
  const { family, source } = current
  const masteries = catalogs.itemMasteries?.filter(
    (row) =>
      norm(row.name) === norm(family.mastery.name) &&
      norm(row.source) === norm(family.mastery.source),
  )
  if (
    masteries?.length !== 1 ||
    masteries[0].sourceIdentityConflict ||
    !permitsClassRuleSource(character, family.mastery.source)
  )
    return undefined
  return {
    reference: {
      entityType: 'creature',
      name: family.name,
      source: source.source,
      ref: masteryRef,
    } satisfies NormalizedChoiceOptionReference,
    mastery: masteries[0],
  }
}

/** An intentional family replacement releases only that family's weapon mastery allocation. */
export function retainCompanionFamilyMastery(
  selections: CharacterClassChoiceSelection[],
  previous: CharacterClassChoiceSelection | undefined,
  next: CharacterClassChoiceSelection,
) {
  const old = previous?.selected.find(isCompanionFamilyOption)
  const pet = next.selected.find(isCompanionFamilyOption)
  if (!old || (norm(pet?.name) === norm(old.name) && norm(pet?.source) === norm(old.source)))
    return selections
  return selections.flatMap((row) => {
    if (
      norm(row.className) !== norm(next.className) ||
      norm(row.classSource) !== norm(next.classSource)
    )
      return [row]
    const selected = row.selected.filter(
      (option) =>
        !isCompanionFamilyMastery(option) ||
        norm(option.name) !== norm(old.name) ||
        norm(option.source) !== norm(old.source),
    )
    return selected.length === row.selected.length
      ? [row]
      : selected.length
        ? [{ ...row, selected }]
        : []
  })
}

export function getCompanionFamilyRules(
  character: Character,
  entry: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  const current = getSavedCompanionFamily(character, entry, catalogs)
  if (!current) return undefined
  const { family, cls } = current
  const choices = cls.normalizedRules?.choices.filter(
    (row) => getClassChoiceDeclaration(row)?.target === masteryTarget,
  )
  const choice = choices?.length === 1 ? choices[0] : undefined
  const offered = choice && getCompanionFamilyMasteryOption(character, choice, catalogs)
  const saved = character.classChoiceSelections?.filter((row) => row.choiceId === choice?.id)
  const selection = saved?.length === 1 ? saved[0] : undefined
  const mastery =
    offered &&
    choice &&
    selection?.classLevel === choice.level &&
    selection.kind === choice.kind &&
    !selection.subclassName &&
    !selection.subclassSource &&
    findClassReference(entry, [{ name: selection.className, source: selection.classSource }]) &&
    selection.selected.length <= getRequiredChoiceSelectionCount(choice, entry.levels) &&
    new Set(selection.selected.map(getClassChoiceCatalogOptionKey)).size ===
      selection.selected.length &&
    selection.selected.some(
      (option) =>
        option.slotLevel === choice.level &&
        getClassChoiceCatalogOptionKey(option) ===
          getClassChoiceCatalogOptionKey(offered.reference),
    )
      ? offered.mastery
      : undefined
  const specials =
    entry.levels >= 6
      ? (cls.classFeatureRefs ?? []).flatMap((ref) => {
          const target = getClassFeatureIdentity(ref)
          if (
            !target ||
            ref.level !== 6 ||
            ref.feature?.isClassFeatureVariant !== true ||
            !hasCurrentSubclassFeatureReplacement(
              character,
              entry,
              catalogs,
              cls,
              rovingTarget,
              6,
              target,
            )
          )
            return []
          const variant = getCurrentDirectClassFeature(
            cls,
            catalogs,
            target,
            (row) =>
              permitsClassRuleSource(character, row.source) &&
              typeof row.entries?.[0] === 'string' &&
              row.entries[0].includes('Roving|Ranger|XPHB|6'),
            { includeDisplayOnly: true },
          )
          const intro = variant?.entries?.[1]
          if (typeof intro !== 'string' || !intro.includes('is within 60 feet of you')) return []
          const branches = variant?.entries
            ?.map(record)
            .filter(
              (row) =>
                row.type === 'entries' &&
                row.name === family.specialization &&
                Array.isArray(row.entries),
            )
          return branches?.length === 1 ? [branches[0]] : []
        })
      : []
  return { ...current, mastery, specialization: specials.length === 1 ? specials[0] : undefined }
}
