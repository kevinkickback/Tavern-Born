import { createStartingEquipmentPolicy } from '@/lib/5etools/startingEquipmentPolicy'
import {
  getBackgroundAbilityData,
  isBackgroundAbilitySelectionComplete,
} from '@/lib/calculations/abilityScores'
import { deriveEffectiveAbilityScores } from '@/lib/calculations/characterCalculationContext'
import { getAbilityModifier, getHitDiceFromClass } from '@/lib/calculations/gameRules'
import type { NativeSpellLookups } from '@/lib/calculations/nativeRacialSpellChoices'
import { refreshNativeRacialSpellState } from '@/lib/calculations/nativeRacialSpells'
import { normalizeBackgroundForOriginSystem } from '@/lib/calculations/originSystem'
import { mergeRaceWithSubrace } from '@/lib/calculations/raceUtils'
import { createEmptyCharacter, emptyProvenance } from '@/lib/character/createCharacter'
import { sameStartingReference } from '@/lib/character/startingEquipmentGrants'
import type { Background5e, Class5e, Item5e, Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import {
  applyBackgroundAbilityChoicesCommand,
  applyBackgroundSelectionCommand,
} from './backgroundCommands'
import { applyClassSelectionCommand } from './classCommands'
import {
  applyRaceAsiChoicesCommand,
  applyRaceSelectionCommand,
  type ResolveRaceChoiceOptions,
} from './raceCommands'

export interface InitialCharacterSelections {
  initial: Partial<Character>
  /** A Creator draft containing only the selected race and its configured grants. */
  raceDraft?: Character
  race?: Race5e
  subrace?: Race5e
  subraceIsNested?: boolean
  classEntity?: Class5e
  background?: Background5e
  raceAsiBlockIndex?: 0 | 1
  raceAsiChoices?: string[][]
  classEquipmentChoices?: string[]
  backgroundEquipmentChoices?: string[]
  backgroundAsi?: { blockIndex: number; choices: string[] }
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

export function getInitialEquipmentPolicy(
  character: Character,
  owner: Class5e | Background5e,
  kind: 'class' | 'background',
  authority: InitialCharacterLookups['startingEquipment'],
) {
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

export function buildInitialCharacter(
  selections: InitialCharacterSelections,
  itemLookup: Map<string, Item5e>,
  resolveRaceChoiceOptions: ResolveRaceChoiceOptions,
  spellLookups?: InitialCharacterLookups,
): Character {
  const { raceDraft, race, subrace } = selections
  if (
    raceDraft &&
    (raceDraft.originSystem !== selections.initial.originSystem ||
      raceDraft.race !== race?.name ||
      raceDraft.raceSource !== race.source ||
      raceDraft.subrace !== subrace?.name ||
      raceDraft.subraceSource !== subrace?.source ||
      raceDraft.background ||
      raceDraft.classProgression.length)
  ) {
    throw new RangeError('Review the choices for your selected race.')
  }
  let character = createEmptyCharacter({
    ...raceDraft,
    ...selections.initial,
    raceAsiChoices: selections.raceAsiChoices ?? selections.initial.raceAsiChoices ?? [],
  })
  let ledger = character.provenance ?? emptyProvenance()
  const raceResolution = selections.race
    ? {
        parentRace: selections.race,
        subraceData: selections.subrace,
        mergedRace: selections.subrace
          ? mergeRaceWithSubrace(selections.race, selections.subrace)
          : selections.race,
        subraceIsNested: selections.subraceIsNested ?? false,
      }
    : undefined

  if (selections.background) {
    const result = applyBackgroundSelectionCommand(
      character,
      ledger,
      selections.background,
      selections.backgroundEquipmentChoices ?? [],
      itemLookup,
      undefined,
      getInitialEquipmentPolicy(
        character,
        selections.background,
        'background',
        spellLookups?.startingEquipment,
      ),
    )
    character = applyPatch(character, result.characterPatch)
    ledger = result.provenanceUpdate
  }

  if (selections.backgroundAsi) {
    const { blockIndex, choices } = selections.backgroundAsi
    const background = selections.background
    const abilityData = getBackgroundAbilityData(
      normalizeBackgroundForOriginSystem(background, character.originSystem),
    )
    const block = abilityData.blocks[blockIndex]
    if (
      character.originSystem !== '2024' ||
      !background ||
      choices.length !== block?.weights.length ||
      !isBackgroundAbilitySelectionComplete(abilityData, blockIndex, choices)
    ) {
      throw new RangeError('Review the ability bonuses for your selected background.')
    }
    const result = applyBackgroundAbilityChoicesCommand(
      character,
      ledger,
      background,
      blockIndex,
      choices,
    )
    character = applyPatch(character, result.characterPatch)
    ledger = result.provenanceUpdate
  }

  if (selections.race && !raceDraft) {
    const result = applyRaceSelectionCommand(
      character,
      ledger,
      selections.race,
      selections.subrace,
      selections.raceAsiBlockIndex ?? 0,
      resolveRaceChoiceOptions,
      { ...spellLookups, subraceIsNested: selections.subraceIsNested },
    )
    character = applyPatch(character, result.characterPatch)
    ledger = result.provenanceUpdate
  }
  if (selections.race) {
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
        startingEquipmentPolicy: getInitialEquipmentPolicy(
          character,
          selections.classEntity,
          'class',
          spellLookups?.startingEquipment,
        ),
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
