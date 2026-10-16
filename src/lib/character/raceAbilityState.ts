import { applyRaceAbilityGrants } from '@/lib/provenance/applyRaceGrants'
import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
import { getSelectedRaceAbilityChoices, isSelectedRaceOwner } from '@/lib/provenance/raceOwnership'
import { resolveRaceAsiChoicesInLedger } from '@/lib/provenance/resolveRaceAsiChoices'
import type { ChoiceRecord, ProvenanceLedger } from '@/lib/provenance/types'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { normalizeAbilityName } from '../calculations/abilityScores'
import { normalizeRaceSelectionForOriginSystem } from '../calculations/originSystem'

export function hasResolvedRaceAbilitySelection(
  character: Character,
  race: Race5e | undefined,
  subrace: Race5e | undefined,
): boolean {
  return (
    !!race &&
    !!character.raceSource &&
    normalizeOwnerIdentity(character.race) === normalizeOwnerIdentity(race.name) &&
    normalizeOwnerIdentity(character.raceSource) === normalizeOwnerIdentity(race.source) &&
    normalizeOwnerIdentity(character.subrace) === normalizeOwnerIdentity(subrace?.name) &&
    normalizeOwnerIdentity(character.subraceSource) === normalizeOwnerIdentity(subrace?.source)
  )
}

/** Rebuild only the selected ability relation, retaining every other domain and owner. */
export function rebuildRaceAbilityGrants(
  ledger: ProvenanceLedger,
  race: Race5e,
  subrace: Race5e | undefined,
  mode: 0 | 1,
): ProvenanceLedger {
  const selection = {
    race: race.name,
    raceSource: race.source,
    subrace: subrace?.name,
    subraceSource: subrace?.source,
  }
  return applyRaceAbilityGrants(
    race,
    subrace,
    {
      ...ledger,
      abilityBonuses: ledger.abilityBonuses.filter(
        (record) => !isSelectedRaceOwner(record.sourceTag, selection),
      ),
      choices: ledger.choices.filter(
        (choice) =>
          choice.domain !== 'abilityBonuses' || !isSelectedRaceOwner(choice.sourceTag, selection),
      ),
    },
    mode,
  )
}

function choiceRules(record: ChoiceRecord): string {
  return JSON.stringify([
    record.chooseCount,
    record.amount,
    record.optionPool.map(normalizeAbilityName).sort(),
  ])
}

/** Current exact rules and the last acknowledged ability snapshot form one pure relation. */
export function refreshRaceAbilityState(
  character: Character,
  race: Race5e | undefined,
  subrace: Race5e | undefined,
): Character {
  const ledger = character.provenance
  if (
    !ledger ||
    character.originSystem === '2024' ||
    !hasResolvedRaceAbilitySelection(character, race, subrace)
  )
    return character

  const normalized = normalizeRaceSelectionForOriginSystem(race, subrace, character.originSystem)
  if (!normalized.race) return character
  // Keep the saved selection's literal owner spelling; loaded data supplies mechanics only.
  const currentRace = {
    ...normalized.race,
    name: character.race,
    source: character.raceSource ?? normalized.race.source,
  }
  const currentChild = normalized.subrace
    ? {
        ...normalized.subrace,
        name: character.subrace ?? normalized.subrace.name,
        source: character.subraceSource ?? normalized.subrace.source,
      }
    : undefined
  const rebuilt = rebuildRaceAbilityGrants(
    ledger,
    currentRace,
    currentChild,
    (character.raceAsiBlockIndex ?? 0) as 0 | 1,
  )
  const previous = getSelectedRaceAbilityChoices(ledger, character)
  const current = getSelectedRaceAbilityChoices(rebuilt, character)
  const previousSlots = character.raceAsiChoices ?? []
  const slots: string[][] = current.map(() => [])
  const accepted = current.map(() => new Set<string>())
  let layoutChanged = false

  for (const owner of ['race', 'subrace'] as const) {
    const before = previous.filter((record) => record.sourceTag.sourceType === owner)
    const after = current.filter((record) => record.sourceTag.sourceType === owner)
    const unchanged =
      before.length === after.length &&
      before.every((record, index) => choiceRules(record) === choiceRules(after[index]))
    if (unchanged) {
      after.forEach((record, index) => {
        slots[current.indexOf(record)] = previousSlots[previous.indexOf(before[index])] ?? []
        accepted[current.indexOf(record)] = new Set(before[index].selected)
      })
      continue
    }
    layoutChanged = true
    const matches = new Map<(typeof current)[number], (typeof previous)[number]>()
    for (const record of after) {
      const signature = choiceRules(record)
      const oldMatches = before.filter((candidate) => choiceRules(candidate) === signature)
      if (
        oldMatches.length === 1 &&
        after.filter((candidate) => choiceRules(candidate) === signature).length === 1
      )
        matches.set(record, oldMatches[0])
    }
    const oldRemaining = before.filter((record) => ![...matches.values()].includes(record))
    const newRemaining = after.filter((record) => !matches.has(record))
    if (oldRemaining.length === 1 && newRemaining.length === 1)
      matches.set(newRemaining[0], oldRemaining[0])
    for (const [record, old] of matches) {
      // Dormant rejected/out-of-count raw values cannot become new benefits after refresh.
      accepted[current.indexOf(record)] = new Set(old.selected)
      slots[current.indexOf(record)] = previousSlots[previous.indexOf(old)] ?? []
    }
  }

  // Reordering can introduce duplicate overlap even in an otherwise unchanged owner.
  if (layoutChanged) {
    const used = new Set<string>()
    slots.forEach((block, index) => {
      slots[index] = block.slice(0, current[index].chooseCount).map((value) => {
        const ability = normalizeAbilityName(value)
        if (
          !ability ||
          !accepted[index].delete(ability) ||
          used.has(ability) ||
          !current[index].optionPool.includes(ability)
        )
          return ''
        used.add(ability)
        return ability
      })
    })
  }
  const fixedKey = (state: ProvenanceLedger) =>
    JSON.stringify(
      state.abilityBonuses
        .filter((record) => isSelectedRaceOwner(record.sourceTag, character))
        .map((record) => [record.sourceTag.sourceType, record.ability, record.value])
        .sort(),
    )
  if (!layoutChanged && fixedKey(ledger) === fixedKey(rebuilt)) return character

  const raceAsiChoices = layoutChanged ? slots : character.raceAsiChoices
  const provenance = resolveRaceAsiChoicesInLedger(
    character,
    layoutChanged ? rebuilt : { ...ledger, abilityBonuses: rebuilt.abilityBonuses },
    raceAsiChoices ?? [],
  )
  return { ...character, raceAsiChoices, provenance }
}
