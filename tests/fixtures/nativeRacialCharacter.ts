import type { ResolvedRaceReference } from '@/lib/5etools/entityResolvers'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import type { Class5e, Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'

export function nativeRaceResolution(race: Race5e, child?: Race5e): ResolvedRaceReference {
  return { parentRace: race, subraceData: child, mergedRace: race, subraceIsNested: !!child }
}

/** Exercise current creation/progression writers rather than manufacturing saved spell state. */
export function makeNativeRacialCharacter(
  race: Race5e,
  child?: Race5e,
  level = 1,
  originSystem: '2014' | '2024' = '2014',
): Character {
  const initial = buildInitialCharacter(
    {
      initial: {
        name: 'Native spell lifecycle',
        originSystem,
        allowedSources: ['AAG', 'MTF', 'XGE'],
      },
      race,
      subrace: child,
      classEntity: { name: 'Fighter', source: 'PHB', hd: { faces: 10, number: 1 } } as Class5e,
      background: { name: 'Acolyte', source: 'PHB' },
    },
    new Map(),
    () => [],
  )
  if (level === 1) return initial
  const result = applyClassProgressionUpdate(
    initial,
    initial.provenance,
    [{ name: 'Fighter', source: 'PHB', levels: level }],
    nativeRaceResolution(race, child),
  )
  return { ...initial, ...result.characterPatch, provenance: result.provenanceUpdate }
}
