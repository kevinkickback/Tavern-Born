import { getEntityLookupKey } from '@/lib/5etools/lookups'
import type { CharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import type { Character } from '@/types/character'
import { readinessClassKey, readinessIssue } from './readinessIssue'
import type { CharacterReadinessIssue } from './types'

export function validateSourceReferences(
  character: Character,
  calculation: CharacterCalculationContext,
): CharacterReadinessIssue[] {
  const issues: CharacterReadinessIssue[] = []
  if (character.race && !calculation.raceResolution.parentRace) {
    issues.push(
      readinessIssue(
        `source:race:${getEntityLookupKey(character.race, character.raceSource)}`,
        'blocking',
        'sources',
        `Restore the source for ${character.race}`,
        'The selected race or species cannot be resolved from the enabled or cached content.',
      ),
    )
  }
  if (character.subrace && !calculation.raceResolution.subraceData) {
    issues.push(
      readinessIssue(
        `source:subrace:${getEntityLookupKey(character.subrace, character.subraceSource)}`,
        'blocking',
        'sources',
        `Restore the source for ${character.subrace}`,
        'The selected subrace cannot be resolved from the enabled or cached content.',
      ),
    )
  }
  if (character.background && !calculation.background) {
    issues.push(
      readinessIssue(
        `source:background:${getEntityLookupKey(character.background, character.backgroundSource)}`,
        'blocking',
        'sources',
        `Restore the source for ${character.background}`,
        'The selected background cannot be resolved from the enabled or cached content.',
      ),
    )
  }
  const resolvedClasses = new Set(calculation.classes.map(readinessClassKey))
  for (const entry of getCharacterClassEntries(character)) {
    if (resolvedClasses.has(readinessClassKey(entry))) continue
    issues.push(
      readinessIssue(
        `source:class:${readinessClassKey(entry)}`,
        'blocking',
        'sources',
        `Restore the source for ${entry.name}`,
        'A selected class cannot be resolved from the enabled or cached content.',
      ),
    )
  }
  return issues
}
