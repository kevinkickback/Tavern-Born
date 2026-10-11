import { parseRaces } from '@/lib/5etools/parsers/races'
import {
  applyRaceAsiChoicesCommand,
  applyRaceSelectionCommand,
} from '@/lib/character/commands/raceCommands'
import { emptyProvenance } from '@/lib/provenance'
import type { Race5e } from '@/types/5etools'
import { makeCharacterFixture } from './characterFixtures'

export const races = parseRaces({
  race: [
    { name: 'Dhampir', source: 'VRGR', lineage: 'VRGR' },
    {
      name: 'Half-Elf',
      source: 'PHB',
      ability: [
        { cha: 2, choose: { from: ['str', 'dex', 'con', 'int', 'wis'], count: 2, amount: 1 } },
      ],
    },
    {
      name: 'Custom Lineage',
      source: 'TCE',
      lineage: true,
      ability: [{ choose: { from: ['str', 'dex', 'con', 'int', 'wis', 'cha'], amount: 2 } }],
      _versions: [{ name: 'Custom Lineage; Darkvision', source: 'TCE' }],
    },
  ],
}) as Race5e[]

export function selectRace(race: Race5e, mode: 0 | 1, choices: string[][], subrace?: Race5e) {
  const initial = makeCharacterFixture({
    race: '',
    raceSource: '',
    background: '',
    backgroundSource: undefined,
  })
  const selected = applyRaceSelectionCommand(
    initial,
    emptyProvenance(),
    race,
    subrace,
    mode,
    () => [],
  )
  const chosen = applyRaceAsiChoicesCommand(
    { ...initial, ...selected.characterPatch },
    selected.provenanceUpdate,
    choices,
  )
  return {
    ...initial,
    ...selected.characterPatch,
    ...chosen.characterPatch,
    provenance: chosen.provenanceUpdate,
  }
}
