import { CharacterWizardData, ValidationResult } from './types'

export function validateStep(
  step: number,
  characterData: CharacterWizardData,
  gameData: any
): ValidationResult {
  const races = gameData?.races || []
  const classes = gameData?.classes || []
  const backgrounds = gameData?.backgrounds || []

  switch (step) {
    case 1:
      if (!characterData.name.trim()) {
        return { valid: false, error: 'Please enter a character name', fields: ['name'] }
      }
      break
    case 2:
      if (!characterData.abilityScoreMethod) {
        return { valid: false, error: 'Please select an ability score generation method' }
      }
      if (characterData.allowedSources.length === 0) {
        return { valid: false, error: 'Please select at least one source book' }
      }
      break
    case 3:
      if (races.length === 0) {
        return { valid: false, error: 'No races available. Please load game data in Settings first.' }
      }
      if (!characterData.race) {
        return { valid: false, error: 'Please select a race' }
      }
      break
    case 4:
      if (classes.length === 0) {
        return { valid: false, error: 'No classes available. Please load game data in Settings first.' }
      }
      if (!characterData.class) {
        return { valid: false, error: 'Please select a class' }
      }
      break
    case 5:
      if (backgrounds.length === 0) {
        return { valid: false, error: 'No backgrounds available. Please load game data in Settings first.' }
      }
      if (!characterData.background) {
        return { valid: false, error: 'Please select a background' }
      }
      break
    case 6:
      if (!characterData.abilityScoreMethod) {
        return { valid: false, error: 'Please select an ability score method' }
      }
      break
  }
  
  return { valid: true }
}
