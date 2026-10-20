import {
  isManagedClassSpellProfile,
  managedClassSpellId,
} from '@/lib/character/managedClassSpellIdentity'
import { normalizeKey } from '@/lib/provenance/normalization'
import type { Character, SpellProfile } from '@/types/character'
import type { ManagedClassSpellChoice } from '@/types/classCasting'
import { getSpellReferenceKey } from './spellIdentity'

export function buildClassSpellSelectionsByLevel(params: {
  character: Character
  className?: string
  classSource?: string
}): Map<number, string[]> {
  const { character, className, classSource } = params
  const selections = new Map<number, string[]>()
  if (!className) return selections

  for (const choice of character.managedClassSpellChoices ?? []) {
    if (
      choice.slot[0][1] !== className.trim().toLowerCase() ||
      choice.slot[0][2] !== classSource?.trim().toLowerCase()
    )
      continue
    const level = choice.slot[3]
    selections.set(level, [
      ...(selections.get(level) ?? []),
      `${choice.target.name}|${choice.target.source}`,
    ])
  }
  return selections
}

export function buildSpellSelectionSourceMap(params: {
  spellProfiles: SpellProfile[]
  ledger: Character['provenance']
  choices?: readonly ManagedClassSpellChoice[]
}): Map<string, string> {
  const { spellProfiles, ledger, choices = [] } = params
  const map = new Map<string, string>()

  for (const profile of spellProfiles) {
    for (const spellName of [
      ...profile.cantrips,
      ...profile.spellsKnown,
      ...profile.preparedSpells,
    ]) {
      const key = `${profile.id}|${spellName}`
      const tags = ledger?.spells?.[normalizeKey(spellName)] ?? []

      if (profile.type === 'class' && profile.className) {
        const labels = choices.flatMap((choice) => {
          if (
            !isManagedClassSpellProfile(choice.slot, profile) ||
            getSpellReferenceKey(choice.target.name, choice.target.source) !==
              getSpellReferenceKey(spellName)
          )
            return []
          const tag = tags.find(
            (row) =>
              row.grantVariant === managedClassSpellId(choice.slot) &&
              getSpellReferenceKey(spellName, row.grantSource) === getSpellReferenceKey(spellName),
          )
          return tag ? [`${tag.sourceName} (${tag.sourceRef}) Lv. ${choice.slot[3]} Choice`] : []
        })
        if (labels.length) map.set(key, [...new Set(labels)].join('; '))
        continue
      }

      if (tags.some((tag) => tag.sourceType === 'manual')) {
        map.set(key, 'User Choice')
      }
    }
  }

  return map
}

export { isSpellOnClassList } from './spellUtils'

export function isSpellOnSubclassList(
  spell: {
    classes?: {
      fromSubclass?: Array<{
        class: { name?: string; source?: string }
        subclass: { name?: string; shortName?: string; source?: string }
      }>
    }
  },
  className: string | undefined,
  classSource: string | undefined,
  subclassName: string | undefined,
  subclassSource: string | undefined,
): boolean {
  if (!className || !subclassName) return false

  const targetClassName = className.trim().toLowerCase()
  const targetClassSource = (classSource ?? '').trim().toLowerCase()
  const targetSubclassName = subclassName.trim().toLowerCase()
  const targetSubclassSource = (subclassSource ?? '').trim().toLowerCase()

  return (spell.classes?.fromSubclass ?? []).some((entry) => {
    if (entry.class.name?.trim().toLowerCase() !== targetClassName) return false
    const entryClassSource = entry.class.source?.trim().toLowerCase()
    if (targetClassSource && entryClassSource && entryClassSource !== targetClassSource)
      return false

    const entrySubclassNames = [entry.subclass.name, entry.subclass.shortName]
      .filter((name): name is string => typeof name === 'string')
      .map((name) => name.trim().toLowerCase())
    if (!entrySubclassNames.includes(targetSubclassName)) return false

    const entrySubclassSource = entry.subclass.source?.trim().toLowerCase()
    return (
      !targetSubclassSource || !entrySubclassSource || entrySubclassSource === targetSubclassSource
    )
  })
}
