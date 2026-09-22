import { getEntityLookupKey, getSubclassLookupKey } from '@/lib/5etools/lookups'
import { parseSpellReference } from '@/lib/calculations/spellIdentity'
import { collectSubclassFeatures } from '@/lib/character/classChoiceOptions'
import type { GameData } from '@/types/5etools'
import type { Character, CharacterClassChoiceOption, Equipment, Feat } from '@/types/character'

export interface GameDataAvailabilityIndex {
  backgrounds: ReadonlySet<string>
  classes: ReadonlySet<string>
  classFeatures: ReadonlySet<string>
  creatures: ReadonlySet<string>
  feats: ReadonlySet<string>
  items: ReadonlySet<string>
  optionalFeatures: ReadonlySet<string>
  races: ReadonlySet<string>
  spells: ReadonlySet<string>
  subclasses: ReadonlySet<string>
  subclassFeatures: ReadonlySet<string>
}

function entityKey(value: { name?: unknown; source?: unknown }): string | null {
  if (typeof value.name !== 'string' || typeof value.source !== 'string') return null
  const key = getEntityLookupKey(value.name, value.source)
  return key === '|' ? null : key
}

function entityKeys(values: readonly unknown[]): Set<string> {
  const keys = new Set<string>()
  for (const value of values) {
    if (!value || typeof value !== 'object') continue
    const key = entityKey(value as { name?: unknown; source?: unknown })
    if (key) keys.add(key)
  }
  return keys
}

export function createGameDataAvailabilityIndex(gameData: GameData): GameDataAvailabilityIndex {
  const races = entityKeys(gameData.races)
  for (const race of gameData.races) {
    for (const subrace of race.subraces ?? []) {
      const key = entityKey(subrace)
      if (key) races.add(key)
    }
  }

  const subclasses = new Set<string>()
  const subclassFeatures = new Set<string>()
  for (const cls of gameData.classes) {
    for (const subclass of cls.subclasses ?? []) {
      subclasses.add(getSubclassLookupKey(cls.name, cls.source, subclass.name, subclass.source))
      if (subclass.shortName) {
        subclasses.add(
          getSubclassLookupKey(cls.name, cls.source, subclass.shortName, subclass.source),
        )
      }
      for (const reference of subclass.subclassFeatureRefs ?? []) {
        const key = reference.feature ? entityKey(reference.feature) : null
        if (key) subclassFeatures.add(key)
      }
      for (const feature of collectSubclassFeatures(subclass)) {
        const key = entityKey(feature)
        if (key) subclassFeatures.add(key)
      }
    }
  }

  return {
    backgrounds: entityKeys(gameData.backgrounds),
    classes: entityKeys(gameData.classes),
    classFeatures: entityKeys(gameData.classFeatures),
    creatures: entityKeys(gameData.creatures ?? []),
    feats: entityKeys(gameData.feats),
    items: entityKeys([...(gameData.items ?? []), ...(gameData.itemsBase ?? [])]),
    optionalFeatures: entityKeys(gameData.optionalfeatures),
    races,
    spells: entityKeys(gameData.spells),
    subclasses,
    subclassFeatures,
  }
}

function referenceIsMissing(
  name: string | undefined,
  source: string | undefined,
  available: ReadonlySet<string>,
): boolean {
  if (!name?.trim() || !source?.trim()) return false
  return !available.has(getEntityLookupKey(name, source))
}

function featIsMissing(feat: Pick<Feat, 'name' | 'source'>, index: GameDataAvailabilityIndex) {
  return referenceIsMissing(feat.name, feat.source, index.feats)
}

function itemIsMissing(item: Pick<Equipment, 'name' | 'source'>, index: GameDataAvailabilityIndex) {
  return referenceIsMissing(item.name, item.source, index.items)
}

function choiceIsMissing(
  choice: CharacterClassChoiceOption,
  index: GameDataAvailabilityIndex,
): boolean {
  const catalogs: Record<CharacterClassChoiceOption['entityType'], ReadonlySet<string>> = {
    classFeature: index.classFeatures,
    creature: index.creatures,
    feat: index.feats,
    item: index.items,
    optionalFeature: index.optionalFeatures,
    subclassFeature: index.subclassFeatures,
  }
  return referenceIsMissing(choice.name, choice.source, catalogs[choice.entityType])
}

function spellReferenceIsMissing(reference: string, index: GameDataAvailabilityIndex): boolean {
  const parsed = parseSpellReference(reference)
  return referenceIsMissing(parsed.name, parsed.source, index.spells)
}

function itemReferenceIsMissing(reference: string, index: GameDataAvailabilityIndex): boolean {
  const [name, source] = reference.split('|')
  return referenceIsMissing(name, source, index.items)
}

/**
 * Reports whether a character has exact, source-qualified saved choices that are absent from the
 * currently loaded catalog. Unqualified legacy/custom values are ignored because their origin
 * cannot be determined reliably.
 */
export function characterUsesContentOutsideCatalog(
  character: Character,
  index: GameDataAvailabilityIndex,
): boolean {
  if (referenceIsMissing(character.race, character.raceSource, index.races)) return true
  if (referenceIsMissing(character.subrace, character.subraceSource, index.races)) return true
  if (referenceIsMissing(character.background, character.backgroundSource, index.backgrounds)) {
    return true
  }

  for (const entry of character.classProgression) {
    if (referenceIsMissing(entry.name, entry.source, index.classes)) return true
    if (
      entry.subclass &&
      entry.subclassSource &&
      !index.subclasses.has(
        getSubclassLookupKey(entry.name, entry.source, entry.subclass, entry.subclassSource),
      )
    ) {
      return true
    }
  }

  if (character.feats.some((feat) => featIsMissing(feat, index))) return true
  if ((character.specialFeats ?? []).some((feat) => featIsMissing(feat, index))) return true
  if (
    (character.classFeatChoices ?? []).some((choice) =>
      choice.feats.some((feat) => featIsMissing(feat, index)),
    )
  ) {
    return true
  }
  if (
    (character.classChoiceSelections ?? []).some(
      (selection) =>
        !selection.inactive && selection.selected.some((choice) => choiceIsMissing(choice, index)),
    )
  ) {
    return true
  }

  if (character.equipment.some((item) => itemIsMissing(item, index))) return true
  if (
    Object.values(character.backgroundEquipmentItemChoices ?? {}).some((reference) =>
      itemReferenceIsMissing(reference, index),
    )
  ) {
    return true
  }
  if (
    Object.values(character.classEquipmentItemChoices ?? {}).some((choices) =>
      Object.values(choices).some((reference) => itemReferenceIsMissing(reference, index)),
    )
  ) {
    return true
  }

  const spellReferences = character.spells.spellProfiles.flatMap((profile) => [
    ...profile.cantrips,
    ...profile.spellsKnown,
    ...profile.preparedSpells,
    ...(profile.fixedSpells ?? []),
    ...(profile.alwaysPreparedSpells ?? []),
    ...(profile.choices ?? []).flatMap((choice) => choice.selected),
    ...Object.values(profile.spellSwaps ?? {}).flatMap((swap) => [swap.removed, swap.added]),
  ])
  if (spellReferences.some((reference) => spellReferenceIsMissing(reference, index))) return true

  return Object.values(character.fixedFeatOptions ?? {}).some((options) =>
    (options.spells ?? []).some((reference) => spellReferenceIsMissing(reference, index)),
  )
}
