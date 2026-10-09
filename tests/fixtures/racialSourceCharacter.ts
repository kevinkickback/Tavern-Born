import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { setRacialSpellChoice } from '@/lib/character/commands/spellCommands'
import { addSpellGrant, makeSourceTag } from '@/lib/provenance'
import type { Class5e, Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { nativeRaceResolution } from './nativeRacialCharacter'

/** Level-one native High Elf Lineage grammar, independent of the optional local data tree. */
export function makeRacialSourceCharacter(): Character {
  const parent = { name: 'Elf', source: 'XPHB' } as Race5e
  const child = {
    name: 'High Elf Lineage',
    source: 'XPHB',
    _isVersion: true,
    additionalSpells: [
      {
        ability: { choose: ['int', 'wis', 'cha'] },
        known: { 1: { _: [{ choose: 'level=0|class=Wizard' }] } },
      },
    ],
  } as Race5e

  const initial = buildInitialCharacter(
    {
      initial: { name: 'Source pruning', originSystem: '2024', allowedSources: ['XGE'] },
      race: parent,
      subrace: child,
      classEntity: { name: 'Fighter', source: 'XPHB', hd: { faces: 10, number: 1 } } as Class5e,
      background: {
        name: 'Acolyte',
        source: 'XPHB',
        feats: [{ 'magic initiate; cleric|xphb': true }],
      },
    },
    new Map(),
    () => [],
  )
  const profile = initial.spells.spellProfiles.find((entry) => entry.type === 'racial')!
  const selection = setRacialSpellChoice(
    initial,
    initial.provenance,
    profile.id,
    profile.choices![0].id,
    ['Toll the Dead|XGE'],
    nativeRaceResolution(parent, child),
  )
  const character = {
    ...initial,
    ...selection.characterPatch,
    provenance: selection.provenanceUpdate,
  }
  character.spells.spellProfiles.find((entry) => entry.type === 'special')!.cantrips = [
    'Toll the Dead|XPHB',
  ]
  character.provenance = addSpellGrant(
    character.provenance,
    'Toll the Dead|XPHB',
    makeSourceTag('manual', 'User Choice', 'choice'),
  )
  return character
}
