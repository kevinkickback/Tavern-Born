import { describe, expect, test } from 'vitest'
import {
  addSpellToCharacter,
  setClassSpellSelectionsAtLevel,
} from '@/lib/character/commands/spellCommands'
import { addSpellGrant, makeSourceTag } from '@/lib/provenance'
import { pruneSpellsForDisabledSources } from '@/lib/sourceConflicts'
import type { Spell5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeNonracialSourceCharacter } from '../fixtures/nonracialSourceCharacter'

describe('nonracial spell source removal', () => {
  test.each([
    '2014',
    '2024',
  ] as const)('%s retracts a removed class printing while preserving an independent allowed printing', (originSystem) => {
    const character = makeNonracialSourceCharacter(originSystem)
    const source = originSystem === '2024' ? 'XPHB' : 'TCE'
    const disabledSource = originSystem === '2024' ? 'XGE' : 'SCAG'
    const retainedSpell = originSystem === '2024' ? 'Toll the Dead|XPHB' : 'Booming Blade|TCE'
    const retainedPreparation = originSystem === '2024' ? 'Bless|XPHB' : 'Magic Missile|PHB'
    const ledgerName = originSystem === '2024' ? 'toll the dead' : 'booming blade'
    const profile = character.spells.spellProfiles.find((entry) => entry.type === 'class')!
    profile.preparedSpells = [retainedPreparation]
    character.spells.spellSlots[1] = { max: 3, used: 2 }
    character.spells.pactSpellSlots = { 1: { max: 2, used: 1 } }
    const before = structuredClone(character)
    expect(characterPersistenceSchema.safeParse(character).success).toBe(true)

    const result = pruneSpellsForDisabledSources(character, ['PHB', source.toLowerCase()], [])!
    expect(result.spells.spellProfiles.find((entry) => entry.type === 'class')!.cantrips).toEqual(
      [],
    )
    expect(
      result.spells.spellProfiles.find((entry) => entry.type === 'class')!.preparedSpells,
    ).toEqual([retainedPreparation])
    expect(result.spells.spellProfiles.find((entry) => entry.type === 'special')!.cantrips).toEqual(
      [retainedSpell],
    )
    expect(result.provenance.spells[ledgerName]).toEqual([
      expect.objectContaining({ sourceType: 'manual', grantSource: source }),
    ])
    expect(result.spells.spellSlots).toEqual(before.spells.spellSlots)
    expect(result.spells.pactSpellSlots).toEqual(before.spells.pactSpellSlots)
    expect(characterPersistenceSchema.safeParse({ ...character, ...result }).success).toBe(true)
    expect(character).toEqual(before)
    expect(pruneSpellsForDisabledSources(character, ['PHB', source, disabledSource], [])).toBeNull()
    expect(
      pruneSpellsForDisabledSources({ ...character, ...result }, ['PHB', source], []),
    ).toBeNull()
  })

  test('a fixed grant of another printing does not protect a disabled class choice', () => {
    const character = makeNonracialSourceCharacter()
    const profile = character.spells.spellProfiles.find((entry) => entry.type === 'class')!
    profile.fixedSpells = ['Toll the Dead|XPHB']
    profile.cantrips.push('Toll the Dead|XPHB')
    character.provenance = addSpellGrant(
      character.provenance,
      'Toll the Dead|XPHB',
      makeSourceTag('class', 'Cleric', 'fixed', 'XPHB'),
    )
    const result = pruneSpellsForDisabledSources(character, ['XPHB'], [])!
    expect(result.spells.spellProfiles.find((entry) => entry.type === 'class')!.cantrips).toEqual([
      'Toll the Dead|XPHB',
    ])
    expect(result.provenance.spells['toll the dead']).toEqual([
      expect.objectContaining({ sourceType: 'manual', grantSource: 'XPHB' }),
      expect.objectContaining({ sourceType: 'class', grantType: 'fixed', grantSource: 'XPHB' }),
    ])
  })

  test('another class owner retains its fixed target while removed class and manual choices retract', () => {
    const character = makeNonracialSourceCharacter()
    character.spells.spellProfiles
      .find((entry) => entry.type === 'special')!
      .cantrips.push('Toll the Dead|XGE')
    character.classProgression.push({ name: 'Wizard', source: 'XPHB', levels: 1 })
    character.spells.spellProfiles.push({
      id: 'class:Wizard|XPHB',
      type: 'class',
      label: 'Wizard',
      className: 'Wizard',
      classSource: 'XPHB',
      cantrips: ['Toll the Dead|XGE'],
      fixedSpells: ['Toll the Dead|XGE'],
      spellsKnown: [],
      preparedSpells: [],
      alwaysPrepared: false,
    })
    for (const tag of [
      makeSourceTag('class', 'Wizard', 'fixed', 'XPHB'),
      makeSourceTag('manual', 'User Choice', 'choice'),
    ]) {
      character.provenance = addSpellGrant(character.provenance, 'Toll the Dead|XGE', tag)
    }
    const before = structuredClone(character)
    const result = pruneSpellsForDisabledSources(character, ['XPHB'], [])!
    expect(result.spells.spellProfiles.find((entry) => entry.className === 'Wizard')).toEqual(
      before.spells.spellProfiles.find((entry) => entry.className === 'Wizard'),
    )
    expect(
      result.spells.spellProfiles.find((entry) => entry.className === 'Cleric')!.cantrips,
    ).toEqual([])
    expect(result.spells.spellProfiles.find((entry) => entry.type === 'special')!.cantrips).toEqual(
      ['Toll the Dead|XPHB'],
    )
    expect(result.provenance.spells['toll the dead']).toEqual([
      expect.objectContaining({ sourceType: 'manual', grantSource: 'XPHB' }),
      expect.objectContaining({
        sourceType: 'class',
        sourceName: 'Wizard',
        grantType: 'fixed',
        grantSource: 'XGE',
      }),
    ])
    expect(character).toEqual(before)
  })

  test('keeps automatic feat setup in the special profile without protecting a class choice', () => {
    const character = makeNonracialSourceCharacter()
    const special = character.spells.spellProfiles.find((entry) => entry.type === 'special')!
    special.cantrips.push('Toll the Dead|XGE')
    special.fixedSpells = ['Toll the Dead|XGE']
    character.provenance = addSpellGrant(
      character.provenance,
      'Toll the Dead|XGE',
      makeSourceTag('feat', 'Magic Initiate', 'choice', 'XPHB'),
    )
    const result = pruneSpellsForDisabledSources(character, ['XPHB'], [])!
    expect(result.spells.spellProfiles.find((entry) => entry.type === 'special')).toEqual(special)
    expect(result.provenance.spells['toll the dead']).toEqual([
      expect.objectContaining({ sourceType: 'manual', grantSource: 'XPHB' }),
      expect.objectContaining({ sourceType: 'feat', grantType: 'choice', grantSource: 'XGE' }),
    ])
  })

  test('removes prepared-only exact selections and their tags without altering retained swap history', () => {
    const character = makeNonracialSourceCharacter()
    const profile = character.spells.spellProfiles.find((entry) => entry.type === 'class')!
    profile.preparedSpells = ['Ceremony|XGE', 'Bless|XPHB']
    profile.spellSwaps = { 1: { removed: 'Bane|XPHB', added: 'Bless|XPHB' } }
    character.provenance = addSpellGrant(character.provenance, 'Ceremony|XGE', {
      ...makeSourceTag('class', 'Cleric', 'choice', 'XPHB'),
      spellGrantedAtLevel: 1,
    })
    const result = pruneSpellsForDisabledSources(character, ['XPHB'], [])!
    const next = result.spells.spellProfiles.find((entry) => entry.type === 'class')!
    expect(next.preparedSpells).toEqual(['Bless|XPHB'])
    expect(next.spellSwaps).toEqual(profile.spellSwaps)
    expect(result.provenance.spells).not.toHaveProperty('ceremony')
  })

  test('keeps current name-only fixed and unknown targets without inferring a printing', () => {
    const character = makeNonracialSourceCharacter()
    const special = character.spells.spellProfiles.find((entry) => entry.type === 'special')!
    special.cantrips.push('Frostbite')
    special.spellsKnown.push('Unknown Spell')
    special.fixedSpells = ['Frostbite']
    character.provenance = addSpellGrant(
      character.provenance,
      'Frostbite',
      makeSourceTag('feat', 'Magic Initiate', 'choice', 'XPHB'),
    )
    character.provenance = addSpellGrant(
      character.provenance,
      'Unknown Spell',
      makeSourceTag('manual', 'User Choice', 'choice'),
    )
    const catalog = [{ name: 'Frostbite', source: 'XGE' }] as Spell5e[]
    const result = pruneSpellsForDisabledSources(character, ['XPHB'], catalog)!
    expect(result.spells.spellProfiles.find((entry) => entry.type === 'special')).toEqual(special)
    expect(result.provenance.spells.frostbite).toEqual(character.provenance.spells.frostbite)
    expect(result.provenance.spells['unknown spell']).toEqual(
      character.provenance.spells['unknown spell'],
    )
    expect(result.provenance.spells['toll the dead']).toEqual([
      expect.objectContaining({ sourceType: 'manual', grantSource: 'XPHB' }),
    ])
  })

  test('matches complete normalized class ownership and retains the remaining per-level choice', () => {
    const initial = makeNonracialSourceCharacter()
    const selection = setClassSpellSelectionsAtLevel(initial, initial.provenance, {
      className: 'Cleric',
      classSource: 'XPHB',
      classLevel: 1,
      selections: [
        { name: 'Toll the Dead|XGE', spellLevel: 0 },
        { name: 'Sacred Flame|XPHB', spellLevel: 0 },
      ],
    })
    const character = {
      ...initial,
      ...selection.characterPatch,
      provenance: selection.provenanceUpdate,
    }
    const tag = character.provenance.spells['toll the dead'].find(
      (entry) => entry.sourceType === 'class',
    )!
    tag.sourceName = ' cleric '
    tag.sourceRef = ' xphb '
    const retained = structuredClone(character.provenance.spells['sacred flame'])
    const result = pruneSpellsForDisabledSources(character, ['xphb'], [])!
    expect(result.spells.spellProfiles.find((entry) => entry.type === 'class')!.cantrips).toEqual([
      'Sacred Flame|XPHB',
    ])
    expect(result.provenance.spells['sacred flame']).toEqual(retained)
    expect(result.provenance.spells['toll the dead']).toEqual([
      expect.objectContaining({ sourceType: 'manual', grantSource: 'XPHB' }),
    ])
    expect(characterPersistenceSchema.safeParse({ ...character, ...result }).success).toBe(true)
  })

  test('retracts selected subclass choice ownership along with the affected class-profile target', () => {
    const initial = makeNonracialSourceCharacter()
    initial.classProgression[0] = {
      ...initial.classProgression[0],
      subclass: 'Knowledge Domain',
      subclassSource: 'PHB',
    }
    const selection = addSpellToCharacter(
      initial,
      initial.provenance,
      'Toll the Dead|XGE',
      'cantrip',
      'class:Cleric|XPHB',
      { sourceType: 'subclass', sourceName: 'Knowledge Domain', sourceRef: 'PHB' },
    )
    const character = {
      ...initial,
      ...selection.characterPatch,
      provenance: selection.provenanceUpdate,
    }
    const result = pruneSpellsForDisabledSources(character, ['XPHB'], [])!
    expect(result.spells.spellProfiles.find((entry) => entry.type === 'class')!.cantrips).toEqual(
      [],
    )
    expect(result.provenance.spells['toll the dead']).toEqual([
      expect.objectContaining({ sourceType: 'manual', grantSource: 'XPHB' }),
    ])
  })
})
