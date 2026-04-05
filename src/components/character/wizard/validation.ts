import {
  wizardStep1Schema,
  wizardStep2Schema,
  wizardStep3Schema,
  wizardStep4Schema,
  wizardStep5Schema,
  wizardStep6Schema,
} from '@/types/characterSchema';
import type { CharacterWizardData, ValidationResult } from './types';

const STEP_SCHEMAS = {
  1: wizardStep1Schema,
  2: wizardStep2Schema,
  3: wizardStep3Schema,
  4: wizardStep4Schema,
  5: wizardStep5Schema,
  6: wizardStep6Schema,
} as const;

export function validateStep(
  step: number,
  characterData: CharacterWizardData,
  gameData: unknown,
): ValidationResult {
  // Data-availability guards (can't be encoded in schema — requires loaded game data)
  if (step === 3 && (gameData?.races ?? []).length === 0) {
    return {
      valid: false,
      error: 'No races available. Please load game data in Settings first.',
    };
  }
  if (step === 4 && (gameData?.classes ?? []).length === 0) {
    return {
      valid: false,
      error: 'No classes available. Please load game data in Settings first.',
    };
  }
  if (step === 5 && (gameData?.backgrounds ?? []).length === 0) {
    return {
      valid: false,
      error:
        'No backgrounds available. Please load game data in Settings first.',
    };
  }

  const schema = STEP_SCHEMAS[step as keyof typeof STEP_SCHEMAS];
  if (!schema) return { valid: true };

  const result = schema.safeParse(characterData);
  if (result.success) return { valid: true };

  const first = result.error.errors[0];
  const fields = result.error.errors
    .map((e) => e.path[0])
    .filter((p): p is string => typeof p === 'string');

  return {
    valid: false,
    error: first?.message ?? 'Validation failed',
    fields: fields.length > 0 ? fields : undefined,
  };
}
