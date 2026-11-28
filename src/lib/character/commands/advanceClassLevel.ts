import type { CharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import type { Class5e } from '@/types/5etools'
import { addMulticlass, applyLevelUp, type LevelUpHitPointChoice } from './classCommands'
import { applyCharacterCommandResult } from './featCommandSupport'

export function advanceClassLevel(
  character: CharacterCalculationContext['character'],
  rules: Class5e,
  hitPoints: LevelUpHitPointChoice,
  context: CharacterCalculationContext,
  replacement?: Parameters<typeof applyLevelUp>[5],
) {
  const progression = getCharacterClassEntries(character)
  const matches = (entry: { name: string; source: string }) =>
    entry.name === hitPoints.className && entry.source === hitPoints.classSource
  if (progression.some(matches)) {
    return applyLevelUp(
      character,
      character.provenance,
      progression.map((entry) =>
        matches(entry) ? { ...entry, levels: hitPoints.classLevel } : entry,
      ),
      hitPoints,
      context,
      replacement,
    )
  }
  if (hitPoints.classLevel !== 1 || !progression.length || !matches(rules)) {
    throw new RangeError('Choose an available class to add at level 1.')
  }
  const multiclass = addMulticlass(
    character,
    character.provenance,
    rules.name,
    rules,
    rules.source,
    1,
    context.raceResolution,
    {
      spellsByKey: context.lookups.primary.spellsByKey,
      rawSpellsByKey: context.lookups.raw.spellsByKey,
    },
  )
  const withGrants = applyCharacterCommandResult(character, multiclass)
  const gain = applyLevelUp(
    { ...withGrants, classProgression: progression },
    withGrants.provenance,
    getCharacterClassEntries(withGrants),
    hitPoints,
    context,
  )
  return { ...gain, characterPatch: { ...multiclass.characterPatch, ...gain.characterPatch } }
}
