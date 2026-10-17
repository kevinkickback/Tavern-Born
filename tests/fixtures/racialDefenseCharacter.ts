import { parseRaces } from '@/lib/5etools/parsers/races'
import { upsertManualEffectCommand } from '@/lib/character/commands/effectCommands'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'

export function defenseSelection(
  childFields: Record<string, unknown> = {},
  originSystem: '2014' | '2024' = '2014',
) {
  const race = parseRaces({
    race: [
      {
        name: 'Defense Parent',
        source: 'PHB',
        resist: ['fire'],
        immune: ['acid'],
        conditionImmune: ['poisoned'],
      },
    ],
    subrace: [
      {
        name: 'Defense Child',
        source: 'HB',
        raceName: 'Defense Parent',
        raceSource: 'PHB',
        ...childFields,
      },
    ],
  })[0] as Race5e
  const child = race.subraces![0]
  const character = buildInitialCharacter(
    {
      initial: { name: 'Defense character', originSystem, allowedSources: ['PHB', 'HB'] },
      race,
      subrace: child,
    },
    new Map(),
    () => [],
  )
  return { race, child, character }
}

export function manualFire(character: Character): Character {
  return {
    ...character,
    ...upsertManualEffectCommand(character, {
      id: 'manual-fire',
      label: 'Independent fire',
      source: { kind: 'manual', name: 'Independent fire' },
      target: { kind: 'damage-resistance', damageType: 'fire' },
      operation: { kind: 'grant' },
    }),
  }
}
