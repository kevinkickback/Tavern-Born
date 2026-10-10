import { expect, test } from 'vitest'
import { FiveEToolsDataLoader } from '@/lib/5etools/dataLoader'
import { parseRaceSpellBlocks } from '@/lib/5etools/raceSpells'
import { getNativeExpandedSpellReferences } from '@/lib/calculations/nativeRacialSpells'
import { reconcileRaceSpellProfileCommand } from '@/lib/character/commands/raceSpellProfileCommand'
import type { RaceAdditionalSpells } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeNativeRacialCharacter, nativeRaceResolution } from '../fixtures/nativeRacialCharacter'

async function loadRace(block: unknown) {
  const raw = { race: [{ name: 'Parser boundary', source: 'PHB', additionalSpells: [block] }] }
  const before = structuredClone(raw)
  const failures: string[] = []
  const loader = new FiveEToolsDataLoader(
    { type: 'local', path: 'C:/test-fixture', isValid: true, availableResources: ['races.json'] },
    { type: 'local', readJson: async () => raw },
  )
  const data = await loader.loadAllData({ onResourceFailure: (name) => failures.push(name) })
  expect(failures).toEqual([])
  expect(raw).toEqual(before)
  return data.races[0]
}

test.each([
  ['unknown schedule member', { innate: { 1: { will: ['light#c'], weekly: ['darkness'] } } }],
  ['expanded level beyond nine', { expanded: { s1: ['command'], s10: ['darkness'] } }],
  ['unknown expanded member', { expanded: { s1: ['command'], spell: ['darkness'] } }],
  ['string instead of spell list', { known: { 1: { _: 'light' } } }],
  ['scalar schedule', { known: { 1: false } }],
  ['array instead of level map', { known: [['light#c']] }],
  ['unknown block semantics', { known: { 1: ['light#c'] }, spell: { 1: ['darkness'] } }],
  ['unknown descriptor semantics', { known: { 1: [{ choose: 'level=0', all: 'level=1' }] } }],
  [
    'conflicting choice counts',
    { known: { 1: [{ choose: { from: ['light#c'], count: 2 }, count: 1 }] } },
  ],
  ['extra filter equality', { known: { 1: [{ choose: 'level=0=1|class=Wizard' }] } }],
  ['repeated filter level', { known: { 1: [{ choose: 'level=1|level=0|class=Wizard' }] } }],
] as const)('loaded %s rejects before creation or replacement can save a partial suite', async (_, block) => {
  const race = await loadRace(block)
  expect(() => makeNativeRacialCharacter(race)).toThrow(/native spell/i)
  const previous = makeNativeRacialCharacter({
    name: 'Previous caster',
    source: 'PHB',
    additionalSpells: [{ known: { 1: ['mage hand#c'] }, ability: 'int' }],
  })
  const before = structuredClone(previous)
  expect(() =>
    reconcileRaceSpellProfileCommand(previous, previous.provenance, race, undefined),
  ).toThrow(/native spell/i)
  expect(previous).toEqual(before)
  expect(characterPersistenceSchema.safeParse(previous).success).toBe(true)
})

test.each([
  { known: null },
  { known: { 1: null } },
  { known: { 1: { will: null } } },
  { innate: { 1: { daily: [] } } },
  { innate: { 1: { rest: { 1: 'light' } } } },
  { expanded: [] },
  { expanded: { s0: 'light#c' } },
  { expanded: { s0: [null] } },
  { known: { 1: [{ choose: { from: ['light#c'], other: true } }] } },
  { known: { 1: [{ choose: 'level=0', count: null }] } },
  { known: { 1: [{ choose: { from: ['light#c'], count: null } }] } },
  { known: { 1: [{ choose: { from: ['light#c'], count: 0 }, count: 0 }] } },
  { known: { 1: [{ choose: { from: [] } }] } },
  { known: { 1: [{ choose: null }] } },
  { known: { 1: [''] } },
  { known: { 1: [' |PHB'] } },
  { known: { 1: ['light#unknown'] } },
  { known: { 1: ['light|PHB|ignored'] } },
  { known: { 1: ['light#c|PHB#2'] } },
  { ability: { choices: ['int'] } },
  { ability: 'unknown' },
  { ability: { choose: [] } },
  { ability: { choose: ['int', 'unknown'] } },
  { ability: null },
  { name: 5 },
])('rejects malformed declared rules at the central parser: %j', (block) => {
  expect(() => parseRaceSpellBlocks([block as unknown as RaceAdditionalSpells])).toThrow(
    /native spell/i,
  )
})

test('complete supported schedules retain exact targets, choices, ability and s0–s9 eligibility', async () => {
  const race = await loadRace({
    name: 'Complete native suite',
    ability: { choose: [' INT ', 'wis', 'int'] },
    known: { _: ['Light#c|XPHB'], 1: { _: [{ choose: 'class=Wizard', count: 2 }] } },
    innate: {
      1: {
        will: ['mage hand|PHB#c'],
        ritual: ['detect magic'],
        rest: { '2e': ['shield'] },
        daily: { pb: ['speak with animals'] },
      },
    },
    prepared: { 3: ['misty step#2|PHB'] },
    expanded: { s0: ['friends#c'], s1: ['command'], s9: ['wish'] },
  })
  const character = makeNativeRacialCharacter(race, undefined, 3)
  expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
  const profile = character.spells.spellProfiles.find((entry) => entry.type === 'racial')!
  expect(profile.cantrips).toEqual(['Light|XPHB', 'mage hand|PHB'])
  expect(profile.spellsKnown).toEqual([
    'detect magic|PHB',
    'shield|PHB',
    'speak with animals|PHB',
    'misty step|PHB',
  ])
  expect(profile.castingAbilityOptions).toEqual(['int', 'wis'])
  expect(profile.choices).toEqual([
    expect.objectContaining({ count: 2, filter: { level: 0, classes: ['Wizard'] } }),
  ])
  expect([...getNativeExpandedSpellReferences(character, nativeRaceResolution(race))]).toEqual([
    'friends|PHB',
    'command|PHB',
    'wish|PHB',
  ])
})

test('explicit target pools support both count locations, while omitted rules and empty lists stay empty', () => {
  for (const descriptor of [
    { choose: { from: ['light#c', 'mage hand#c'], count: 2 } },
    { choose: { from: ['light#c', 'mage hand#c'] }, count: 2 },
    { choose: { from: ['light#c', 'mage hand#c'], count: 2 }, count: 2 },
  ]) {
    expect(parseRaceSpellBlocks([{ known: { 1: [descriptor] } }])[0].choices).toEqual([
      expect.objectContaining({ count: 2, pool: ['light|PHB', 'mage hand|PHB'] }),
    ])
  }
  expect(parseRaceSpellBlocks(undefined)).toEqual([])
  expect(parseRaceSpellBlocks([])).toEqual([])
  expect(parseRaceSpellBlocks([{ known: { 1: [] }, expanded: { s0: [] } }])[0].grants).toEqual([])
})
