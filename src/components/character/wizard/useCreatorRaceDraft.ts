import { useEffect, useRef, useState } from 'react'
import type { useWizardGameData } from '@/hooks/data/useWizardGameData'
import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import {
  applyRaceAsiChoicesCommand,
  applyRaceAsiDistributionCommand,
  applySubraceSelectionCommand,
  type ResolveRaceChoiceOptions,
} from '@/lib/character/commands/raceCommands'
import { createCharacterEditingDraft } from '@/store/characterEditingContext'
import type { Race5e } from '@/types/5etools'
import type { CharacterWizardData } from './types'

export function useCreatorRaceDraft(
  active: boolean,
  data: CharacterWizardData,
  resolution: ResolvedRaceReference,
  rules: ReturnType<typeof useWizardGameData>,
  resolveRaceChoiceOptions: ResolveRaceChoiceOptions,
) {
  const [draft, setDraft] = useState<{
    parentKey: string
    childKey: string
    previousSubrace?: Race5e
    previousSubraceIsNested: boolean
    store: ReturnType<typeof createCharacterEditingDraft>
  }>()
  const [error, setError] = useState<string>()
  const appliedInputs = useRef<{ store: NonNullable<typeof draft>['store']; key: string }>(
    undefined,
  )
  const { parentRace, subraceData, subraceIsNested } = resolution
  const parentKey = JSON.stringify([
    data.race,
    data.raceSource,
    data.originSystem,
    [...data.allowedSources].sort(),
    data.variantRules.preferNewerPrintings,
  ])
  const childKey = JSON.stringify([data.subrace, data.subraceSource])
  const inputKey = JSON.stringify([
    data.name,
    data.abilityScores,
    data.variantRules,
    data.raceAsiBlockIndex,
    data.raceAsiChoices,
    data.raceSize,
  ])
  const available = rules.races.some(
    (race) =>
      !race.sourceIdentityConflict && race.name === data.race && race.source === data.raceSource,
  )
  const current = draft?.parentKey === parentKey && draft.childKey === childKey ? draft : undefined

  useEffect(() => {
    if (!active || !available || !parentRace || (data.subrace && !subraceData)) return
    if (current) return
    try {
      const previous = draft?.store.getState().activeCharacter
      const spellOptions = { ...rules.creationLookups, subraceIsNested }
      const character =
        previous && draft?.parentKey === parentKey
          ? applyCharacterCommandResult(
              previous,
              applySubraceSelectionCommand(
                previous,
                previous.provenance,
                parentRace,
                subraceData,
                resolveRaceChoiceOptions,
                {
                  ...spellOptions,
                  previousSubrace: draft.previousSubrace,
                  previousSubraceIsNested: draft.previousSubraceIsNested,
                },
              ),
            )
          : buildInitialCharacter(
              {
                initial: {
                  name: data.name,
                  originSystem: data.originSystem,
                  abilityScores: data.abilityScores,
                  allowedSources: data.allowedSources,
                  variantRules: data.variantRules,
                },
                race: parentRace,
                subrace: subraceData,
                subraceIsNested,
                raceAsiBlockIndex: data.raceAsiBlockIndex,
                raceAsiChoices: data.raceAsiChoices,
              },
              rules.itemLookup,
              resolveRaceChoiceOptions,
              rules.creationLookups,
            )
      setDraft({
        parentKey,
        childKey,
        previousSubrace: subraceData,
        previousSubraceIsNested: subraceIsNested,
        store: createCharacterEditingDraft(character),
      })
      setError(undefined)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not prepare race choices.')
    }
  }, [
    active,
    available,
    childKey,
    current,
    data,
    draft,
    parentKey,
    parentRace,
    resolveRaceChoiceOptions,
    rules.creationLookups,
    rules.itemLookup,
    subraceData,
    subraceIsNested,
  ])

  useEffect(() => {
    const character = current?.store.getState().activeCharacter
    if (!active || !current || !parentRace || !character) return
    if (appliedInputs.current?.store === current.store && appliedInputs.current.key === inputKey)
      return
    try {
      const distributed = applyCharacterCommandResult(
        character,
        applyRaceAsiDistributionCommand(
          character,
          character.provenance,
          parentRace,
          subraceData,
          data.raceAsiBlockIndex,
        ),
      )
      const resolved = applyCharacterCommandResult(
        distributed,
        applyRaceAsiChoicesCommand(distributed, distributed.provenance, data.raceAsiChoices),
      )
      current.store.getState().updateCharacter(character.id, {
        ...resolved,
        name: data.name,
        abilityScores: data.abilityScores,
        variantRules: data.variantRules,
        raceSize: data.raceSize,
      })
      appliedInputs.current = { store: current.store, key: inputKey }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update race choices.')
    }
  }, [
    active,
    current,
    data.abilityScores,
    data.name,
    data.raceAsiBlockIndex,
    data.raceAsiChoices,
    data.raceSize,
    data.variantRules,
    inputKey,
    parentRace,
    subraceData,
  ])
  return {
    store: current?.store,
    error,
    reset: () => {
      setDraft(undefined)
      setError(undefined)
    },
  }
}
