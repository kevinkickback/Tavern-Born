import { decodePsionicChoiceId, PSIONIC_CLASS_SOURCE } from '@/lib/5etools/psionicIdentity'
import { getPsionicKey } from '@/lib/5etools/psionics'
import type {
  Character,
  CharacterClassChoiceOption,
  CharacterClassChoiceSelection,
} from '@/types/character'

type Actor = Pick<
  Character,
  'classProgression' | 'classChoiceSelections' | 'hitPointGains' | 'mysticDisciplineReplacements'
>
const norm = (value?: string) => value?.trim().toLowerCase()
export const isMysticDisciplineOwner = (name: string, source: string) =>
  norm(name) === 'mystic' && norm(source) === PSIONIC_CLASS_SOURCE.toLowerCase()

export interface MysticDisciplineSlot {
  selection: CharacterClassChoiceSelection
  original: CharacterClassChoiceOption
  current: CharacterClassChoiceOption
  replaced: boolean
}

const key = (option: { name: string; source?: string }) =>
  getPsionicKey(option.name, option.source ?? '')

export function getSavedDisciplineAllocationKey(option: CharacterClassChoiceOption) {
  return JSON.stringify([option.slotLevel, key(option)])
}

/** Replay exact saved identities without relying on catalog availability. */
export function replayMysticDisciplines(character: Actor, beforeAcquisitionAt?: number) {
  const owners = character.classProgression.filter((row) =>
    isMysticDisciplineOwner(row.name, row.source),
  )
  const owner = owners.length === 1 ? owners[0] : undefined
  const rows = (character.classChoiceSelections ?? []).filter((row) => {
    const pool = decodePsionicChoiceId(row.choiceId)?.pool
    return row.kind === 'psionic' && (pool === 'discipline' || pool === 'bonus-discipline')
  })
  const events = character.mysticDisciplineReplacements ?? []
  const talentOwners = new Map(
    (character.classChoiceSelections ?? []).flatMap((row) =>
      decodePsionicChoiceId(row.choiceId)?.pool === 'talent'
        ? row.selected.map((option) => [key(option), row.choiceId] as const)
        : [],
    ),
  )
  const invalidEvents = new Set<number>()
  const conflictingEvents = new Set<number>()
  const conflictingChoices = new Set<string>()
  const slots: MysticDisciplineSlot[] = []
  const limit = Math.min(owner?.levels ?? 0, beforeAcquisitionAt ?? 20)
  const eventLevels = new Map<number, number[]>()
  events.forEach((event, index) => {
    if (beforeAcquisitionAt !== undefined && event.classLevel > beforeAcquisitionAt) return
    const gainCount = character.hitPointGains?.filter(
      (gain) =>
        isMysticDisciplineOwner(gain.className, gain.classSource) &&
        gain.classLevel === event.classLevel,
    ).length
    if (event.classLevel < 2 || event.classLevel > limit || gainCount !== 1) {
      invalidEvents.add(index)
      return
    }
    const indexes = eventLevels.get(event.classLevel) ?? []
    indexes.push(index)
    eventLevels.set(event.classLevel, indexes)
  })
  for (let level = 1; level <= limit; level++) {
    const indexes = eventLevels.get(level) ?? []
    if (indexes.length > 1) for (const index of indexes) invalidEvents.add(index)
    if (indexes.length === 1) {
      const index = indexes[0]
      const event = events[index]
      const matches = slots.filter(
        (slot) =>
          slot.selection.choiceId === event.choiceId &&
          slot.original.slotLevel === event.slotLevel &&
          key(slot.current) === key(event.from),
      )
      if (matches.length !== 1) {
        invalidEvents.add(index)
      } else if (
        talentOwners.has(key(event.to)) ||
        slots.some((slot) => key(slot.current) === key(event.to))
      ) {
        invalidEvents.add(index)
        conflictingEvents.add(index)
      } else {
        matches[0].current = { ...matches[0].original, ...event.to }
        matches[0].replaced = true
      }
    }
    if (level === beforeAcquisitionAt) break
    for (const selection of rows) {
      if (
        selection.subclassName &&
        (norm(selection.subclassName) !== norm(owner?.subclass) ||
          norm(selection.subclassSource) !== norm(owner?.subclassSource))
      )
        continue
      for (const original of selection.selected.filter((option) => option.slotLevel === level)) {
        const talentOwner = talentOwners.get(key(original))
        if (talentOwner) {
          conflictingChoices.add(talentOwner)
          conflictingChoices.add(selection.choiceId)
        }
        const conflicts = slots.filter((slot) => key(slot.current) === key(original))
        if (conflicts.length) {
          conflictingChoices.add(selection.choiceId)
          for (const slot of conflicts) conflictingChoices.add(slot.selection.choiceId)
        }
        slots.push({ selection, original, current: original, replaced: false })
      }
    }
  }
  return { slots, talentOwners, invalidEvents, conflictingEvents, conflictingChoices }
}

export function getMysticDisciplinesKnownBeforeAcquisition(character: Actor, level: number) {
  return new Set(replayMysticDisciplines(character, level).slots.map((slot) => key(slot.current)))
}

/** Explicit removal of a gain or its originating choice retires only dependent events. */
export function retainMysticDisciplineReplacements(character: Actor) {
  const events = character.mysticDisciplineReplacements
  if (!events?.length) return undefined
  const { invalidEvents } = replayMysticDisciplines(character)
  const retained = events.filter((_, index) => !invalidEvents.has(index))
  return retained.length ? retained : undefined
}
