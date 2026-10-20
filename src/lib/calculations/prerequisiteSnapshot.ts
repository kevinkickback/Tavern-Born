import { findClassReference } from '@/lib/5etools/classReference'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import type { Class5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { AbilityName } from './abilityScores'
import type { PrereqCharacterSnapshot } from './prerequisiteRules'
import { collectKnownSpells, ensureSpellProfiles } from './spellProfiles.profiles'

/** The caller supplies already effective features; this layer never projects class choices. */
interface BuildPrerequisiteSnapshotParams {
  character: Character | null
  classProgression?: CharacterClassEntry[]
  classLookup?: Readonly<Record<string, Class5e | undefined>>
  effectiveAbilityScores?: Partial<Record<AbilityName, number>>
}

export function buildEffectivePrerequisiteSnapshot({
  character,
  classProgression = getCharacterClassEntries(character),
  classLookup,
  effectiveAbilityScores,
}: BuildPrerequisiteSnapshotParams): PrereqCharacterSnapshot {
  const profileSpells = character ? collectKnownSpells(ensureSpellProfiles(character)) : null

  return {
    progression: classProgression.map((entry) => {
      const subclass = findClassReference(
        entry,
        Object.values(classLookup ?? {}),
      )?.subclasses?.find(
        (candidate) =>
          candidate.name === entry.subclass && candidate.source === entry.subclassSource,
      )
      return subclass ? { ...entry, subclassShortName: subclass.shortName } : entry
    }),
    race: character?.race,
    raceSource: character?.raceSource,
    abilityScores: effectiveAbilityScores ?? {},
    features: character?.features ?? [],
    spells: {
      cantrips: profileSpells?.cantrips ?? [],
      spellsKnown: profileSpells?.spellsKnown ?? [],
      preparedSpells: profileSpells?.preparedSpells ?? [],
    },
  }
}
