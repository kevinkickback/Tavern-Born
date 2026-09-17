import type { Character } from '@/types/character'
import type { CharacterEffect } from '@/types/effects'

function normalizeManualEffect(effect: CharacterEffect): CharacterEffect {
  const id = effect.id.trim()
  const label = effect.label.trim()
  if (!id) throw new Error('A manual effect requires a stable ID.')
  if (!label) throw new Error('A manual effect requires a label.')
  return {
    ...effect,
    id,
    label,
    source: {
      ...effect.source,
      kind: 'manual',
      name: effect.source.name.trim() || label,
    },
    condition: effect.condition?.trim() || undefined,
  }
}

/** Adds or replaces one user-authored declaration without touching source-derived effects. */
export function upsertManualEffectCommand(
  character: Pick<Character, 'manualEffects'>,
  effect: CharacterEffect,
): Pick<Character, 'manualEffects'> {
  const normalized = normalizeManualEffect(effect)
  const current = character.manualEffects ?? []
  const existingIndex = current.findIndex((entry) => entry.id === normalized.id)
  if (existingIndex < 0) return { manualEffects: [...current, normalized] }
  return {
    manualEffects: current.map((entry, index) => (index === existingIndex ? normalized : entry)),
  }
}

/** Removes a manual declaration and its now-orphaned suppression marker atomically. */
export function removeManualEffectCommand(
  character: Pick<Character, 'manualEffects' | 'suppressedEffectIds'>,
  effectId: string,
): Pick<Character, 'manualEffects' | 'suppressedEffectIds'> {
  return {
    manualEffects: (character.manualEffects ?? []).filter((effect) => effect.id !== effectId),
    suppressedEffectIds: (character.suppressedEffectIds ?? []).filter((id) => id !== effectId),
  }
}

/** Enables or suppresses any stable declaration ID without copying its source data into the save. */
export function setEffectSuppressedCommand(
  character: Pick<Character, 'suppressedEffectIds'>,
  effectId: string,
  suppressed: boolean,
): Pick<Character, 'suppressedEffectIds'> {
  const current = new Set(character.suppressedEffectIds ?? [])
  if (suppressed) current.add(effectId)
  else current.delete(effectId)
  return { suppressedEffectIds: [...current].sort() }
}
