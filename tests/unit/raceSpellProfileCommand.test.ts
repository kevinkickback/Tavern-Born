import { expect, test } from 'vitest'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { refreshNativeRacialSpellState } from '@/lib/calculations/nativeRacialSpells'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import {
  applyRaceSelectionCommand,
  applySubraceSelectionCommand,
} from '@/lib/character/commands/raceCommands'
import {
  setRacialCastingAbility,
  setRacialSpellChoice,
} from '@/lib/character/commands/spellCommands'
import { addSpellGrant, makeSourceTag } from '@/lib/provenance'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeNativeRacialCharacter, nativeRaceResolution } from '../fixtures/nativeRacialCharacter'

const racial = (character: Character) =>
  character.spells.spellProfiles.filter((profile) => profile.type === 'racial')
const commit = (
  character: Character,
  result: { characterPatch: Partial<Character>; provenanceUpdate: Character['provenance'] },
): Character => ({ ...character, ...result.characterPatch, provenance: result.provenanceUpdate })
const choiceRace = {
  name: 'Caster',
  source: 'PHB',
  additionalSpells: [
    {
      ability: { choose: ['int', 'wis'] },
      known: { _: [{ choose: 'level=0|class=Wizard', count: 2 }] },
    },
  ],
} as Race5e

function select(character: Character, race: Race5e, child?: Race5e) {
  const profile = racial(character).find((entry) => entry.choices?.length)!
  return commit(
    character,
    setRacialSpellChoice(
      character,
      character.provenance,
      profile.id,
      profile.choices![0].id,
      ['Light|PHB'],
      nativeRaceResolution(race, child),
    ),
  )
}

test('complete version removal retracts native spells while preserving class/special preparation and runtime usage', () => {
  const race = parseRaces({
    race: [
      {
        name: 'Caster',
        source: 'PHB',
        additionalSpells: [{ known: { 1: ['light#c'] } }],
        _versions: [{ name: 'Caster; Removed', additionalSpells: null }],
      },
    ],
  })[0] as Race5e
  const character = makeNativeRacialCharacter(race)
  character.spells.spellProfiles.find((profile) => profile.type === 'special')!.cantrips = [
    'Light|PHB',
  ]
  character.spells.spellSlots = { 1: { max: 3, used: 2 } }
  character.spells.pactSpellSlots = { 2: { max: 2, used: 1 } }
  character.provenance = addSpellGrant(
    character.provenance,
    'Light|PHB',
    makeSourceTag('manual', 'User Choice', 'choice'),
  )
  const before = structuredClone(character)
  const result = commit(
    character,
    applySubraceSelectionCommand(
      character,
      character.provenance,
      race,
      race.subraces![0],
      () => [],
    ),
  )
  expect(racial(result)).toEqual([])
  expect(result.provenance.spells.light).toEqual([
    expect.objectContaining({ sourceType: 'manual' }),
  ])
  expect(result.spells.spellSlots).toEqual({ 1: { max: 3, used: 2 } })
  expect(result.spells.pactSpellSlots).toEqual({ 2: { max: 2, used: 1 } })
  expect(result.spells.spellProfiles.filter((profile) => profile.type !== 'racial')).toEqual(
    before.spells.spellProfiles.filter((profile) => profile.type !== 'racial'),
  )
  expect(character).toEqual(before)
  expect(characterPersistenceSchema.safeParse(result).success).toBe(true)
})

test('reselecting an exact version preserves setup on the actual child owner', () => {
  const race = parseRaces({
    race: [{ ...choiceRace, _versions: [{ name: 'Caster; Version' }] }],
  })[0] as Race5e
  const child = race.subraces![0]
  let character = select(makeNativeRacialCharacter(race, child), race, child)
  character = commit(
    character,
    setRacialCastingAbility(character, character.provenance, racial(character)[0].id, 'wis'),
  )
  const result = commit(
    character,
    applySubraceSelectionCommand(character, character.provenance, race, child, () => []),
  )
  expect(racial(result)).toEqual(racial(character))
  expect(result.provenance.spells.light).toEqual([
    expect.objectContaining({
      sourceType: 'subrace',
      sourceName: 'Version',
      sourceRef: 'PHB',
      grantType: 'choice',
    }),
  ])
  expect(characterPersistenceSchema.safeParse(result).success).toBe(true)
})

test.each([
  'parent',
  'child',
])('changing the %s printing resets the complete context, including an unchanged child name', (which) => {
  const child = { ...choiceRace, name: 'Child', source: 'MTF' } as Race5e
  const race = { name: 'Parent', source: 'PHB' } as Race5e
  const character = select(makeNativeRacialCharacter(race, child), race, child)
  const nextParent = which === 'parent' ? { ...race, source: 'XPHB' } : race
  const nextChild = which === 'child' ? { ...child, source: 'PHB' } : child
  const result = commit(
    character,
    applyRaceSelectionCommand(character, character.provenance, nextParent, nextChild, 0, () => []),
  )
  expect(racial(result)[0].id).not.toBe(racial(character)[0].id)
  expect(racial(result)[0].cantrips).toEqual([])
  expect(result.provenance.spells.light).toBeUndefined()
  expect(characterPersistenceSchema.safeParse(result).success).toBe(true)
})

test('changed descriptor count or filter resets incompatible setup and preserves independent exact ownership', () => {
  const character = select(makeNativeRacialCharacter(choiceRace), choiceRace)
  character.provenance = addSpellGrant(
    character.provenance,
    'Light|PHB',
    makeSourceTag('manual', 'User Choice', 'choice'),
  )
  character.spells.spellProfiles.find((profile) => profile.type === 'special')!.cantrips = [
    'Light|PHB',
  ]
  for (const descriptor of [
    { choose: 'level=0|class=Wizard', count: 1 },
    { choose: 'level=0|class=Sorcerer', count: 2 },
  ]) {
    const updated = {
      ...choiceRace,
      additionalSpells: [{ ability: 'cha', known: { _: [descriptor] } }],
    } as Race5e
    const result = commit(
      character,
      applyRaceSelectionCommand(character, character.provenance, updated, undefined, 0, () => []),
    )
    expect(racial(result)[0]).toMatchObject({
      castingAbility: 'cha',
      cantrips: [],
      choices: [expect.objectContaining({ selected: [] })],
    })
    expect(result.provenance.spells.light).toEqual([
      expect.objectContaining({ sourceType: 'manual' }),
    ])
    expect(characterPersistenceSchema.safeParse(result).success).toBe(true)
  }
})

test.each([
  { choose: ['int', 'wis'] },
  'wis',
])('removing a casting rule clears its saved value', (ability) => {
  const race = {
    name: 'Caster',
    source: 'PHB',
    additionalSpells: [{ ability, known: { 1: ['shocking grasp#c'] } }],
  } as Race5e
  const character = makeNativeRacialCharacter(race)
  racial(character)[0].castingAbility = 'wis'
  const updated = { ...race, additionalSpells: [{ known: { 1: ['shocking grasp#c'] } }] } as Race5e
  const result = commit(
    character,
    applyRaceSelectionCommand(character, character.provenance, updated, undefined, 0, () => []),
  )
  expect(racial(result)[0].castingAbility).toBeUndefined()
  expect(racial(result)[0].cantrips).toEqual(['shocking grasp|PHB'])
})

test('ordinary child replacement retains mandatory parent ownership and retracts the old child suite', () => {
  const race = {
    name: 'Caster',
    source: 'PHB',
    additionalSpells: [{ known: { 1: ['light#c'] } }],
  } as Race5e
  const old = {
    name: 'Old',
    source: 'MTF',
    additionalSpells: [{ known: { 1: ['thaumaturgy#c'] } }],
  } as Race5e
  const child = { name: 'New', source: 'PHB' } as Race5e
  const character = makeNativeRacialCharacter(race, old)
  const result = commit(
    character,
    applySubraceSelectionCommand(character, character.provenance, race, child, () => []),
  )
  expect(racial(result)).toEqual([
    expect.objectContaining({ raceName: 'Caster', cantrips: ['light|PHB'], choices: [] }),
  ])
  expect(result.provenance.spells.light).toEqual([
    expect.objectContaining({ sourceType: 'race', sourceName: 'Caster' }),
  ])
  expect(result.provenance.spells.thaumaturgy).toBeUndefined()
})

test('inherited versions materialize once; returning to the base creates the parent profile', () => {
  const race = parseRaces({
    race: [
      {
        name: 'Caster',
        source: 'PHB',
        additionalSpells: [{ known: { 1: ['light#c'] } }],
        _versions: [{ name: 'Caster; Version' }],
      },
    ],
  })[0] as Race5e
  const character = makeNativeRacialCharacter(race, race.subraces![0])
  expect(racial(character)).toEqual([
    expect.objectContaining({ raceName: 'Version', cantrips: ['light|PHB'] }),
  ])
  expect(character.provenance.spells.light).toHaveLength(1)
  const result = commit(
    character,
    applySubraceSelectionCommand(character, character.provenance, race, undefined, () => []),
  )
  expect(racial(result)).toEqual([
    expect.objectContaining({ raceName: 'Caster', cantrips: ['light|PHB'] }),
  ])
  expect(result.provenance.spells.light).toEqual([expect.objectContaining({ sourceType: 'race' })])
})

test('progression commits 1→5→1 and multiclass total gates in the same saved write', () => {
  const race = {
    name: 'Caster',
    source: 'PHB',
    additionalSpells: [{ known: { 1: ['light#c'], 3: ['darkness'], 5: ['invisibility'] } }],
  } as Race5e
  let character = makeNativeRacialCharacter(race)
  for (const [progression, expected] of [
    [
      [
        { name: 'Fighter', source: 'PHB', levels: 2 },
        { name: 'Rogue', source: 'PHB', levels: 1 },
      ],
      ['darkness|PHB'],
    ],
    [[{ name: 'Fighter', source: 'PHB', levels: 5 }], ['darkness|PHB', 'invisibility|PHB']],
    [[{ name: 'Fighter', source: 'PHB', levels: 1 }], []],
  ] as const) {
    character = commit(
      character,
      applyClassProgressionUpdate(
        character,
        character.provenance,
        [...progression],
        nativeRaceResolution(race),
      ),
    )
    expect(racial(character)[0].spellsKnown).toEqual(expected)
    expect(Object.keys(character.provenance.spells)).toEqual([
      'light',
      ...expected.map((name) => name.split('|')[0]),
    ])
    expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
  }
})

test('either unavailable context member freezes the whole snapshot through level changes, then exact restoration reevaluates', () => {
  const parent = {
    name: 'Parent',
    source: 'PHB',
    additionalSpells: [{ known: { 1: ['light#c'], 5: ['darkness'] } }],
  } as Race5e
  const child = {
    name: 'Child',
    source: 'MTF',
    additionalSpells: [{ known: { 1: ['mage hand#c'], 5: ['invisibility'] } }],
  } as Race5e
  const initial = makeNativeRacialCharacter(parent, child, 5)
  for (const missing of [
    { parentRace: parent, subraceData: undefined },
    { parentRace: undefined, subraceData: child },
  ]) {
    const unavailable = { ...nativeRaceResolution(parent, child), ...missing }
    const lowered = commit(
      initial,
      applyClassProgressionUpdate(
        initial,
        initial.provenance,
        [{ name: 'Fighter', source: 'PHB', levels: 1 }],
        unavailable,
      ),
    )
    expect(racial(lowered)).toEqual(racial(initial))
    expect(lowered.provenance.spells).toEqual(initial.provenance.spells)
    const restored = refreshNativeRacialSpellState(lowered, nativeRaceResolution(parent, child))
    expect(racial(restored).map((profile) => profile.spellsKnown)).toEqual([[], []])
    expect(Object.keys(restored.provenance.spells)).toEqual(['light', 'mage hand'])
    expect(characterPersistenceSchema.safeParse(restored).success).toBe(true)
  }
})
