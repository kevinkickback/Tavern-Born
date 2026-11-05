import { createStartingEquipmentPolicy } from '@/lib/5etools/startingEquipmentPolicy'
import { deriveEffectiveAbilityScores } from '@/lib/calculations/characterCalculationContext'
import { getAbilityModifier, getHitDiceFromClass } from '@/lib/calculations/gameRules'
import type { NativeSpellLookups } from '@/lib/calculations/nativeRacialSpellChoices'
import { refreshNativeRacialSpellState } from '@/lib/calculations/nativeRacialSpells'
import { mergeRaceWithSubrace } from '@/lib/calculations/raceUtils'
import { createEmptyCharacter, emptyProvenance } from '@/lib/character/createCharacter'
import { sameStartingReference } from '@/lib/character/startingEquipmentGrants'
import type { Background5e, Class5e, Item5e, Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { applyBackgroundSelectionCommand } from './backgroundCommands'
import { applyClassSelectionCommand } from './classCommands'
import {
  applyRaceAsiChoicesCommand,
  applyRaceSelectionCommand,
  type ResolveRaceChoiceOptions,
} from './raceCommands'

export interface InitialCharacterSelections {
  initial: Partial<Character>
  race?: Race5e
  subrace?: Race5e
  classEntity?: Class5e
  background?: Background5e
  raceAsiBlockIndex?: 0 | 1
  raceAsiChoices?: string[][]
  classEquipmentChoices?: string[]
  backgroundEquipmentChoices?: string[]
}

export interface InitialCharacterLookups extends NativeSpellLookups {
  classChoiceFeatureCatalogs?: import('@/lib/character/classChoiceFeatureCatalogs').ClassChoiceFeatureCatalogs
  startingEquipment?: {
    rawItems: readonly Item5e[]
    availableItems: readonly Item5e[]
    classes: readonly Class5e[]
    backgrounds: readonly Background5e[]
    itemTypes: Readonly<Record<string, string>>
  }
}

function applyPatch(character: Character, patch: Partial<Character>): Character {
  return { ...character, ...patch }
}

export function buildInitialCharacter(
  selections: InitialCharacterSelections,
  itemLookup: Map<string, Item5e>,
  resolveRaceChoiceOptions: ResolveRaceChoiceOptions,
  spellLookups?: InitialCharacterLookups,
): Character {
  let character = createEmptyCharacter({
    ...selections.initial,
    raceAsiChoices: selections.raceAsiChoices ?? selections.initial.raceAsiChoices,
  })
  let ledger = character.provenance ?? emptyProvenance()
  const equipmentPolicy = (owner: Class5e | Background5e, kind: 'class' | 'background') => {
    const authority = spellLookups?.startingEquipment
    if (!authority) return undefined
    const owners = (kind === 'class' ? authority.classes : authority.backgrounds).filter((row) =>
      sameStartingReference(row, owner),
    )
    const current = kind === 'class' ? owners[0] : owner
    return createStartingEquipmentPolicy(
      character,
      {
        name: owner.name,
        source: owner.source,
        kind,
        sourceIdentityConflict:
          owners.length > 1 ||
          owner.sourceIdentityConflict === true ||
          owners[0]?.sourceIdentityConflict === true,
        entries: Array.isArray(current?.entries) ? current.entries : undefined,
      },
      current?.startingEquipment,
      authority.rawItems,
      authority.availableItems,
      authority.itemTypes,
      owners.length > 0,
    )
  }
  const raceResolution = selections.race
    ? {
        parentRace: selections.race,
        subraceData: selections.subrace,
        mergedRace: selections.subrace
          ? mergeRaceWithSubrace(selections.race, selections.subrace)
          : selections.race,
        subraceIsNested: false,
      }
    : undefined

  // Background is applied before race: under the 2024 origin system, the race and
  // background commands each independently re-validate the full origin invariant set
  // (e.g. "exactly one background origin feat"), so background's grant must already
  // be in the ledger by the time the race command's check runs.
  if (selections.background) {
    const result = applyBackgroundSelectionCommand(
      character,
      ledger,
      selections.background,
      selections.backgroundEquipmentChoices ?? [],
      itemLookup,
      undefined,
      equipmentPolicy(selections.background, 'background'),
    )
    character = applyPatch(character, result.characterPatch)
    ledger = result.provenanceUpdate
  }

  if (selections.race) {
    const result = applyRaceSelectionCommand(
      character,
      ledger,
      selections.race,
      selections.subrace,
      selections.raceAsiBlockIndex ?? 0,
      resolveRaceChoiceOptions,
      spellLookups,
    )
    character = applyPatch(character, result.characterPatch)
    ledger = result.provenanceUpdate

    const raceAsiResult = applyRaceAsiChoicesCommand(
      character,
      ledger,
      selections.raceAsiChoices ?? selections.initial.raceAsiChoices ?? [],
    )
    character = applyPatch(character, raceAsiResult.characterPatch)
    ledger = raceAsiResult.provenanceUpdate
  }

  if (selections.classEntity) {
    const classKey = `${selections.classEntity.name}|${selections.classEntity.source ?? ''}`
    character = applyPatch(character, {
      classEquipmentChoices: {
        ...(character.classEquipmentChoices ?? {}),
        [classKey]: selections.classEquipmentChoices ?? [],
      },
    })
    const result = applyClassSelectionCommand(
      character,
      ledger,
      selections.classEntity,
      undefined,
      itemLookup,
      {
        ...spellLookups,
        raceResolution,
        startingEquipmentPolicy: equipmentPolicy(selections.classEntity, 'class'),
      },
    )
    character = applyPatch(character, result.characterPatch)
    ledger = result.provenanceUpdate

    const startingMaxHP = Math.max(
      1,
      getHitDiceFromClass(selections.classEntity) +
        getAbilityModifier(
          deriveEffectiveAbilityScores(
            { ...character, provenance: ledger },
            selections.race,
            selections.subrace,
            selections.background,
          ).total.constitution,
        ),
    )
    character = applyPatch(character, {
      hitPoints: { ...character.hitPoints, current: startingMaxHP },
      hitPointsInitialized: true,
    })
  }

  return refreshNativeRacialSpellState(
    { ...character, provenance: ledger },
    raceResolution,
    spellLookups,
  )
}
