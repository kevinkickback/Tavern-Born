import { expect, test } from 'vitest'
import {
  commitFeatOptionsCommand,
  editFeatOptionsCommand,
  replaceBonusFeatSelectionsCommand,
} from '@/lib/character/commands/featCommands'
import { addSpellToCharacter, setProfileSpells } from '@/lib/character/commands/spellCommands'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { getSpellRows } from '@/lib/provenance/summaries'
import type { Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeNonracialSourceCharacter } from '../fixtures/nonracialSourceCharacter'

const special = (character: Character) =>
  character.spells.spellProfiles.find((profile) => profile.type === 'special')!
const apply = (character: Character, result: ReturnType<typeof commitFeatOptionsCommand>) => ({
  ...character,
  ...result.characterPatch,
  provenance: result.provenanceUpdate,
})

function setup(origin: '2014' | '2024' = '2024') {
  const name = origin === '2024' ? 'Toll the Dead' : 'Booming Blade'
  const source = origin === '2024' ? 'XGE' : 'SCAG'
  const other = origin === '2024' ? 'XPHB' : 'TCE'
  const feat =
    origin === '2024'
      ? { name: 'Magic Initiate', source: 'XPHB', fixedGrant: true, grantVariant: 'cleric' }
      : { name: 'Magic Initiate', source: 'PHB' }
  let initial = makeNonracialSourceCharacter(origin)
  if (origin === '2014') {
    initial = apply(initial, replaceBonusFeatSelectionsCommand(initial, initial.provenance, [feat]))
  }
  const reference = `${name}|${source}`
  const options = { spells: [reference] }
  const metadata = [{ name, source, level: 0 }] as Spell5e[]
  const configured = apply(
    initial,
    commitFeatOptionsCommand(initial, initial.provenance, feat, options, metadata),
  )
  return { initial, configured, feat, name, source, other, reference, options, metadata }
}

test.each([
  '2014',
  '2024',
] as const)('%s feat setup retains its exact target separately from manual and class printings', (origin) => {
  const { configured, feat, name, source, other, reference } = setup(origin)
  expect(characterPersistenceSchema.safeParse(configured).success).toBe(true)
  expect(special(configured).cantrips).toEqual([`${name}|${other}`, reference])
  expect(special(configured).fixedSpells).toEqual([reference])
  expect(configured.provenance.spells[name.toLowerCase()]).toEqual([
    expect.objectContaining({ sourceType: 'class', grantSource: source }),
    expect.objectContaining({ sourceType: 'manual', grantSource: other }),
    expect.objectContaining({ sourceType: 'feat', sourceRef: feat.source, grantSource: source }),
  ])
})

test('offline unchanged Edit keeps the established kind; Clear removes only the feat target', () => {
  const { configured, feat, options, name, other, reference } = setup()
  const edited = apply(
    configured,
    editFeatOptionsCommand(configured, configured.provenance, feat, options, options, []),
  )
  expect(special(edited).cantrips).toEqual([`${name}|${other}`, reference])
  expect(special(edited).spellsKnown).toEqual([])
  expect(edited.provenance).toEqual(configured.provenance)
  const cleared = apply(
    edited,
    editFeatOptionsCommand(edited, edited.provenance, feat, options, {}, []),
  )
  expect(special(cleared).cantrips).toEqual([`${name}|${other}`])
  expect(special(cleared).fixedSpells).toEqual([])
  expect(
    cleared.spells.spellProfiles.find((profile) => profile.type === 'class')?.cantrips,
  ).toEqual([reference])
  expect(cleared.provenance.spells[name.toLowerCase()].map((tag) => tag.sourceType)).toEqual([
    'class',
    'manual',
  ])
  expect(characterPersistenceSchema.safeParse(cleared).success).toBe(true)
})

test('same-printing manual and independent feat owners survive one setup Clear', () => {
  const { initial: manual, feat, name } = setup()
  const reference = 'Toll the Dead|XPHB'
  const options = { spells: [reference] }
  const metadata = [{ name, source: 'XPHB', level: 0 }] as Spell5e[]
  const first = apply(
    manual,
    commitFeatOptionsCommand(manual, manual.provenance, feat, options, metadata),
  )
  const otherFeat = { name: 'Magic Initiate', source: 'PHB' }
  const selected = apply(
    first,
    replaceBonusFeatSelectionsCommand(first, first.provenance, [otherFeat]),
  )
  const both = apply(
    selected,
    commitFeatOptionsCommand(selected, selected.provenance, otherFeat, options, metadata),
  )
  const cleared = apply(both, editFeatOptionsCommand(both, both.provenance, feat, options, {}))
  expect(special(cleared).cantrips).toEqual(special(manual).cantrips)
  expect(special(cleared).fixedSpells).toEqual([reference])
  const removed = apply(cleared, replaceBonusFeatSelectionsCommand(cleared, cleared.provenance, []))
  expect(special(removed).cantrips).toEqual(special(manual).cantrips)
  expect(special(removed).fixedSpells).toEqual([])
  expect(
    removed.provenance.spells[name.toLowerCase()].filter((tag) => tag.sourceType === 'feat'),
  ).toEqual([])
})

test('Sources and offline PDF retain distinct target printings with their original owners', () => {
  const { configured } = setup()
  const before = structuredClone(configured)
  expect(
    getSpellRows(configured.provenance).filter((row) => row.itemName === 'Toll The Dead'),
  ).toEqual([
    expect.objectContaining({ itemSource: 'XGE', sourceTypes: ['class', 'feat'] }),
    expect.objectContaining({ itemSource: 'XPHB', sourceTypes: ['manual'] }),
  ])
  const vm = createCharacterSheetViewModel(configured, {})
  expect([...vm.spellRows].sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''))).toEqual([
    expect.objectContaining({ id: 'toll the dead|xge', level: 'C' }),
    expect.objectContaining({ id: 'toll the dead|xphb', level: 'C' }),
  ])
  expect(configured).toEqual(before)
})

test.each([0, 1])('replacement preserves exact printing and kind %s', (level) => {
  const { configured, feat, options, name, other, reference } = setup()
  const replacement = 'Light|PHB'
  const edited = apply(
    configured,
    editFeatOptionsCommand(
      configured,
      configured.provenance,
      feat,
      options,
      { spells: [replacement] },
      [{ name: 'Light', source: 'PHB', level }] as Spell5e[],
    ),
  )
  expect(special(edited).cantrips).toEqual(
    level === 0 ? [`${name}|${other}`, replacement] : [`${name}|${other}`],
  )
  expect(special(edited).spellsKnown).toEqual(level === 1 ? [replacement] : [])
  expect(special(edited).fixedSpells).toEqual([replacement])
  expect(edited.spells.spellProfiles.find((profile) => profile.type === 'class')?.cantrips).toEqual(
    [reference],
  )
})

test('unavailable new printing rejects the whole edit, including unrelated options', () => {
  const { configured, initial, feat, options, name } = setup()
  for (const character of [initial, configured]) {
    const selections = { spells: ['Toll the Dead|ABSENT'], skills: ['Arcana'], abilityScore: 'wis' }
    const result =
      character === initial
        ? commitFeatOptionsCommand(character, character.provenance, feat, selections, [
            { name, source: 'XPHB', level: 0 },
          ] as Spell5e[])
        : editFeatOptionsCommand(character, character.provenance, feat, options, selections, [])
    expect(result.characterPatch).toEqual({})
    expect(result.provenanceUpdate).toBe(character.provenance)
  }
})

test('an unqualified new selection does not infer a printing from the available catalog', () => {
  const { initial, feat, metadata } = setup()
  const result = commitFeatOptionsCommand(
    initial,
    initial.provenance,
    feat,
    { spells: ['Toll the Dead'] },
    metadata,
  )
  expect(result).toEqual({ characterPatch: {}, provenanceUpdate: initial.provenance })
})

test.each([
  false,
  true,
])('special bulk replacement retains exact fixed targets, reversed=%s', (reverse) => {
  const { configured, feat, options } = setup()
  const manual = apply(
    configured,
    addSpellToCharacter(
      configured,
      configured.provenance,
      'Bless|XPHB',
      'spell',
      'special:unrestricted',
    ),
  )
  const before = apply(
    manual,
    editFeatOptionsCommand(
      manual,
      manual.provenance,
      feat,
      options,
      { spells: ['Toll the Dead|XGE', 'Bless|PHB'] },
      [
        { name: 'Toll the Dead', source: 'XGE', level: 0 },
        { name: 'Bless', source: 'PHB', level: 1 },
      ] as Spell5e[],
    ),
  )
  const reorder = (values: string[]) => (reverse ? [...values].reverse() : values)
  const bulk = apply(
    before,
    setProfileSpells(
      before,
      before.provenance,
      'special:unrestricted',
      reorder(special(before).cantrips),
      reorder([...special(before).spellsKnown, 'bless|phb']),
    ),
  )
  expect([...special(bulk).cantrips].sort()).toEqual(['Toll the Dead|XGE', 'Toll the Dead|XPHB'])
  expect(
    special(bulk)
      .spellsKnown.map((value) => value.toLowerCase())
      .sort(),
  ).toEqual(['bless|phb', 'bless|xphb'])
  expect(bulk.provenance).toEqual(before.provenance)
  const clearedManual = apply(
    bulk,
    setProfileSpells(bulk, bulk.provenance, 'special:unrestricted', [], []),
  )
  expect(special(clearedManual).cantrips).toEqual(['Toll the Dead|XGE'])
  expect(special(clearedManual).spellsKnown.map((value) => value.toLowerCase())).toEqual([
    'bless|phb',
  ])
  expect(special(clearedManual).fixedSpells).toEqual(['Toll the Dead|XGE', 'Bless|PHB'])
  expect(clearedManual.provenance.spells.bless).toEqual([
    expect.objectContaining({ sourceType: 'feat', grantSource: 'PHB' }),
  ])
  expect(clearedManual.fixedFeatOptions).toEqual(before.fixedFeatOptions)
})
