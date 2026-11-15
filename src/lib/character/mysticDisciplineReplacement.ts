import { getSelectedSubclassData } from '@/lib/5etools/classData'
import {
  getCurrentSelectedClass,
  permitsClassRuleSource,
} from '@/lib/5etools/earnedClassFeatureSource'
import { normalizePsionicChoices, psionicSlotIsCurrent } from '@/lib/5etools/psionicChoices'
import { getPsionicKey, resolvePsionic } from '@/lib/5etools/psionics'
import type { Character, MysticDisciplineReplacement } from '@/types/character'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import {
  isMysticDisciplineOwner,
  type MysticDisciplineSlot,
  replayMysticDisciplines,
} from './mysticDisciplineHistory'

const key = (option: { name: string; source?: string }) =>
  getPsionicKey(option.name, option.source ?? '')

export function getMysticDisciplineState(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
) {
  const owners = character.classProgression.filter((row) =>
    isMysticDisciplineOwner(row.name, row.source),
  )
  const owner = owners.length === 1 ? owners[0] : undefined
  const cls = owner && getCurrentSelectedClass(character, owner, catalogs)
  const choices =
    cls && owner
      ? normalizePsionicChoices(cls, getSelectedSubclassData(cls, owner), catalogs).choices
      : []
  const replay = replayMysticDisciplines(character)
  const slots = replay.slots.map((slot) => {
    const choice = choices.find((row) => row.id === slot.selection.choiceId)
    const printing = resolvePsionic(slot.current, catalogs?.psionics)
    const original = slot.replaced ? resolvePsionic(slot.original, catalogs?.psionics) : printing
    const originalQualifies =
      !original ||
      (original.type === 'D' &&
        (!choice?.optionFilter?.psionicOrders ||
          choice.optionFilter.psionicOrders.includes(original.order ?? '')))
    const available =
      !replay.invalidEvents.size &&
      !replay.conflictingChoices.has(slot.selection.choiceId) &&
      !!owner &&
      !!choice &&
      permitsClassRuleSource(character, slot.current.source) &&
      psionicSlotIsCurrent(
        choice,
        slot.selection.selected,
        slot.original.slotLevel,
        owner.levels,
      ) &&
      printing?.type === 'D' &&
      originalQualifies
    return { ...slot, printing: available ? printing : undefined }
  })
  return { owner, slots, talentKeys: replay.talentOwners.keys() }
}

export function getMysticDisciplineReplacementOptions(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  className: string,
  classSource: string,
  classLevel: number,
) {
  if (!isMysticDisciplineOwner(className, classSource)) return undefined
  const { owner, slots, talentKeys } = getMysticDisciplineState(character, catalogs)
  if (!owner || classLevel !== owner.levels + 1) return undefined
  const reserved = new Set([...talentKeys, ...slots.map((slot) => key(slot.current))])
  const incoming = (catalogs?.psionics ?? []).filter(
    (row) =>
      row.type === 'D' &&
      !reserved.has(key(row)) &&
      permitsClassRuleSource(character, row.source) &&
      resolvePsionic(row, catalogs?.psionics),
  )
  const outgoing = slots.filter((slot) => !!slot.printing)
  return incoming.length && outgoing.length ? { incoming, outgoing } : undefined
}

export function getMysticDisciplineSlotKey(slot: MysticDisciplineSlot) {
  return JSON.stringify([slot.selection.choiceId, slot.original.slotLevel, key(slot.current)])
}

export function verifyMysticDisciplineReplacement(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  gain: { className: string; classSource: string; classLevel: number },
  request: Omit<MysticDisciplineReplacement, 'classLevel'>,
): MysticDisciplineReplacement {
  const options = getMysticDisciplineReplacementOptions(
    character,
    catalogs,
    gain.className,
    gain.classSource,
    gain.classLevel,
  )
  const source = options?.outgoing.find(
    (row) =>
      row.selection.choiceId === request.choiceId &&
      row.original.slotLevel === request.slotLevel &&
      key(row.current) === key(request.from),
  )
  const target = options?.incoming.find((row) => key(row) === key(request.to))
  if (!source || !source.current.source || !target)
    throw new RangeError(
      'Review the current known disciplines and choose a different available discipline.',
    )
  return {
    classLevel: gain.classLevel,
    choiceId: source.selection.choiceId,
    slotLevel: source.original.slotLevel,
    from: { name: source.current.name, source: source.current.source },
    to: { name: target.name, source: target.source },
  }
}
