import { getAvailableSubraces, requiresDraconicAncestry } from '@/lib/calculations/raceUtils'
import type { Race5e } from '@/types/5etools'
import {
  wizardAbilitiesSchema,
  wizardBackgroundSchema,
  wizardBasicsSchema,
  wizardClassSchema,
  wizardContentSchema,
  wizardRaceSchema,
  wizardRulesSchema,
} from '@/types/characterSchema'
import type { CharacterWizardData, ValidationResult, WizardStepId } from './types'

const STEP_SCHEMAS = {
  basics: wizardBasicsSchema,
  rules: wizardRulesSchema,
  content: wizardContentSchema,
  race: wizardRaceSchema,
  class: wizardClassSchema,
  background: wizardBackgroundSchema,
  abilities: wizardAbilitiesSchema,
} as const

interface WizardStepAvailability {
  races: Race5e[]
  classes: unknown[]
  backgrounds: unknown[]
}

export function validateStep(
  step: WizardStepId,
  characterData: CharacterWizardData,
  gameData: WizardStepAvailability | null | undefined,
): ValidationResult {
  if (step === 'race' && (gameData?.races ?? []).length === 0) {
    return {
      valid: false,
      error: 'No races available. Please load game data in Settings first.',
    }
  }
  if (step === 'class' && (gameData?.classes ?? []).length === 0) {
    return {
      valid: false,
      error: 'No classes available. Please load game data in Settings first.',
    }
  }
  if (step === 'background' && (gameData?.backgrounds ?? []).length === 0) {
    return {
      valid: false,
      error: 'No backgrounds available. Please load game data in Settings first.',
    }
  }

  if (
    (step === 'race' || step === 'review') &&
    requiresDraconicAncestry({ name: characterData.race, source: characterData.raceSource })
  ) {
    const race = gameData?.races.find(requiresDraconicAncestry)
    const selectedAncestry = getAvailableSubraces(race).some(
      (ancestry) =>
        ancestry.name === characterData.subrace && ancestry.source === characterData.subraceSource,
    )
    if (!selectedAncestry) {
      return { valid: false, error: 'Choose a draconic ancestry on the Race step.' }
    }
  }

  const schema = STEP_SCHEMAS[step as keyof typeof STEP_SCHEMAS]
  if (!schema) return { valid: true }

  const result = schema.safeParse(characterData)
  if (result.success) return { valid: true }

  return { valid: false, error: result.error.errors[0]?.message ?? 'Validation failed' }
}
