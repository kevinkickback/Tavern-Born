import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import {
  addSpellToCharacter,
  setClassSpellSelectionsAtLevel,
} from '@/lib/character/commands/spellCommands'
import type { Class5e, Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'

export function makeNonracialSourceCharacter(originSystem: '2014' | '2024' = '2024'): Character {
  const source = originSystem === '2024' ? 'XPHB' : 'PHB'
  const className = originSystem === '2024' ? 'Cleric' : 'Wizard'
  const removedSpell = originSystem === '2024' ? 'Toll the Dead|XGE' : 'Booming Blade|SCAG'
  const retainedSpell = originSystem === '2024' ? 'Toll the Dead|XPHB' : 'Booming Blade|TCE'
  const initial = buildInitialCharacter(
    {
      initial: {
        name: 'Class source pruning',
        originSystem,
        allowedSources: originSystem === '2024' ? ['XGE'] : ['SCAG', 'TCE'],
      },
      race: { name: 'Human', source } as Race5e,
      classEntity: {
        name: className,
        source,
        hd: { faces: originSystem === '2024' ? 8 : 6, number: 1 },
      } as Class5e,
      background: {
        name: 'Acolyte',
        source,
        ...(originSystem === '2024' ? { feats: [{ 'magic initiate; cleric|xphb': true }] } : {}),
      },
    },
    new Map(),
    () => [],
  )
  const selection = setClassSpellSelectionsAtLevel(initial, initial.provenance, {
    className,
    classSource: source,
    classLevel: 1,
    selections: [{ name: removedSpell, spellLevel: 0 }],
  })
  const character = {
    ...initial,
    ...selection.characterPatch,
    provenance: selection.provenanceUpdate,
  }
  const manual = addSpellToCharacter(
    character,
    character.provenance,
    retainedSpell,
    'cantrip',
    'special:unrestricted',
  )
  return { ...character, ...manual.characterPatch, provenance: manual.provenanceUpdate }
}
