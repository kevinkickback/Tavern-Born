import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { addSpellToCharacter } from '@/lib/character/commands/spellCommands'
import type { Class5e, Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { makeManagedClassSpellFixtures } from './managedClassSpellFixtures'

export function makeNonracialSourceCharacter(originSystem: '2014' | '2024' = '2024'): Character {
  const source = originSystem === '2024' ? 'XPHB' : 'PHB'
  const className = originSystem === '2024' ? 'Cleric' : 'Wizard'
  const removedSpell = 'Toll the Dead|XGE'
  const retainedSpell = 'Toll the Dead|XPHB'
  const initial = buildInitialCharacter(
    {
      initial: {
        name: 'Class source pruning',
        originSystem,
        allowedSources: originSystem === '2024' ? ['XGE'] : ['XGE', 'XPHB'],
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
  const [name, targetSource] = removedSpell.split('|')
  const selection = setManagedClassSpellChoiceCommand(
    initial,
    initial.provenance,
    {
      slot: [
        ['class', className.toLowerCase(), source.toLowerCase()],
        'class-cantrip',
        `class-feature|spellcasting|${className.toLowerCase()}|${source.toLowerCase()}|1|${source.toLowerCase()}`,
        1,
        0,
      ],
      expected: null,
      expectedEmptyRevision: 0,
      target: { name, source: targetSource },
      policy: 'ignore-class-list',
    },
    makeManagedClassSpellFixtures().context,
  )
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
