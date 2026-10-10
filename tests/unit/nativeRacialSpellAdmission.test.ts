import { expect, test } from 'vitest'
import { refreshNativeRacialSpellState } from '@/lib/calculations/nativeRacialSpells'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import { setRacialSpellChoice } from '@/lib/character/commands/spellCommands'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeNativeRacialCharacter, nativeRaceResolution } from '../fixtures/nativeRacialCharacter'

const race: Race5e = {
  name: 'Native parent',
  source: 'PHB',
  additionalSpells: [
    {
      known: { 1: ['light#c', 'detect magic', { choose: { from: ['light#c', 'mage hand#c'] } }] },
    },
  ],
}
const profile = (character: Character) =>
  character.spells.spellProfiles.find((entry) => entry.type === 'racial')!

function choose(
  character: Character,
  index = 0,
  reference = 'light|PHB',
  parent = race,
  child?: Race5e,
) {
  const current = profile(character)
  const result = setRacialSpellChoice(
    character,
    character.provenance,
    current.id,
    current.choices![index].id,
    [reference],
    nativeRaceResolution(parent, child),
  )
  return { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
}

test.each([
  'fixed declaration',
  'fixed materialization',
  'cantrip',
  'leveled spell',
  'pool',
  'selection',
])('saved %s requires exactly a nonempty name and printing without display or casting syntax', (location) => {
  for (const token of [
    'light|PHB|ignored',
    '{@spell light|PHB}',
    'light#c|PHB',
    'light|PHB#c',
    'light',
    ' |PHB',
    'light| ',
  ]) {
    const character = choose(makeNativeRacialCharacter(race))
    const current = profile(character)
    if (location === 'fixed declaration') current.racial!.fixed[0].reference = token
    else if (location === 'fixed materialization') current.fixedSpells![0] = token
    else if (location === 'cantrip') current.cantrips[0] = token
    else if (location === 'leveled spell')
      current.spellsKnown[0] = token.replace('light', 'detect magic')
    else if (location === 'pool') current.choices![0].pool![0] = token
    else current.choices![0].selected[0] = token
    const before = structuredClone(character)
    expect(characterPersistenceSchema.safeParse(character).success, `${location}: ${token}`).toBe(
      false,
    )
    expect(character).toEqual(before)
  }
})

test.each([
  'light#c|PHB',
  'light|PHB#c',
  'light|PHB|ignored',
  '{@spell light|PHB}',
])('coordinated malformed reference %s cannot pass by matching its ownership', (reference) => {
  const character = makeNativeRacialCharacter(race)
  const current = profile(character)
  current.choices = []
  current.racial!.fixed = [{ reference, isCantrip: true }]
  current.fixedSpells = [reference]
  current.cantrips = [reference]
  current.spellsKnown = []
  const sourceSide = reference === 'light|PHB#c'
  character.provenance.spells = {
    [reference === 'light#c|PHB' ? 'light#c' : 'light']: [
      {
        ...character.provenance.spells.light[0],
        grantSource: sourceSide ? 'PHB#c' : 'PHB',
      },
    ],
  }
  expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
})

test.each([
  'fixed',
  'choice',
])('a duplicate %s tag cannot gain identity from casing or its label', (kind) => {
  const character = choose(makeNativeRacialCharacter(race))
  const tag = character.provenance.spells.light.find((entry) => entry.grantType === kind)!
  character.provenance.spells.light.push({
    ...tag,
    sourceName: ' NATIVE PARENT ',
    sourceRef: ' phb ',
    grantSource: ' phb ',
    label: 'Another label',
  })
  expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
})

test('repeated schedules share one fixed tag while independent descriptors, owners and printings survive clear and refresh', () => {
  const parent: Race5e = {
    ...race,
    additionalSpells: [
      {
        known: { 1: ['light#c', { choose: { from: ['light|XPHB#c', 'mage hand#c'] } }] },
        prepared: { 1: [{ choose: { from: ['light#c', 'shocking grasp#c'] } }] },
        innate: { 3: { daily: { 1: ['light#c'] } } },
      },
    ],
  }
  const child: Race5e = {
    name: 'Native child',
    source: 'XPHB',
    additionalSpells: [{ known: { 1: ['light#c'] } }],
  }
  let character = makeNativeRacialCharacter(parent, child, 3)
  character = choose(character, 0, 'light|XPHB', parent, child)
  character = choose(character, 1, 'light|PHB', parent, child)
  expect(profile(character).racial!.fixed.map((target) => target.reference)).toEqual([
    'light|PHB',
    'light|PHB',
  ])
  expect(profile(character).fixedSpells).toEqual(['light|PHB'])
  expect(profile(character).cantrips).toEqual(['light|PHB', 'light|XPHB'])
  expect(character.provenance.spells.light).toHaveLength(4)
  expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
  const before = structuredClone(character)
  const lowered = applyClassProgressionUpdate(character, character.provenance, [
    { name: 'Fighter', source: 'PHB', levels: 1 },
  ])
  const offline = { ...character, ...lowered.characterPatch, provenance: lowered.provenanceUpdate }
  expect(profile(offline).racial!.fixed).toEqual(profile(character).racial!.fixed)
  expect(characterPersistenceSchema.safeParse(offline).success).toBe(true)
  const current = profile(offline)
  const result = setRacialSpellChoice(
    offline,
    offline.provenance,
    current.id,
    current.choices![0].id,
    [],
  )
  const cleared = { ...offline, ...result.characterPatch, provenance: result.provenanceUpdate }
  expect(profile(cleared).cantrips).toEqual(['light|PHB'])
  expect(cleared.provenance.spells.light).toHaveLength(3)
  expect(characterPersistenceSchema.safeParse(cleared).success).toBe(true)
  const restored = refreshNativeRacialSpellState(cleared, nativeRaceResolution(parent, child))
  expect(profile(restored).racial!.fixed).toEqual([{ reference: 'light|PHB', isCantrip: true }])
  expect(restored.provenance.spells.light).toHaveLength(3)
  expect(characterPersistenceSchema.safeParse(restored).success).toBe(true)
  expect(character).toEqual(before)
})

test('canonical saved targets still allow case and surrounding whitespace independently of owner spelling', () => {
  const character = choose(makeNativeRacialCharacter(race))
  const current = profile(character)
  current.racial!.fixed[0].reference = ' LIGHT | phb '
  current.fixedSpells![0] = ' LiGhT | PHB '
  current.cantrips[0] = ' light | PhB '
  current.choices![0].pool![0] = ' LIGHT | phb '
  current.choices![0].selected[0] = ' LiGhT | pHb '
  for (const tag of character.provenance.spells.light) {
    tag.sourceName = ' NATIVE PARENT '
    tag.sourceRef = ' phb '
    tag.grantSource = ' phb '
  }
  expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
})
