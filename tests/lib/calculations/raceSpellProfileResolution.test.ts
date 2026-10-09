import { beforeEach, describe, expect, test } from 'vitest'
import { resolveRaceReference } from '@/lib/5etools/entityResolvers'
import { buildRaceLookup } from '@/lib/5etools/lookups'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { deriveRaceSpellSelection } from '@/lib/calculations/raceSpellSelection'
import { ensureSpellProfiles } from '@/lib/calculations/spellProfiles'
import type { Race5e } from '@/types/5etools'
import { makeCharacterFixture } from '../../fixtures/characterFixtures'

let filtered: Race5e[] = []
let raw: Race5e[] = []

function installRace(record: Record<string, unknown>): Race5e {
  const race = (
    parseRaces({ race: [{ name: 'Test Race', source: 'TEST', ...record }] }) as Race5e[]
  )[0]
  filtered = [race]
  raw = [race]
  return race
}

function profiles(race: Race5e, subrace: Race5e) {
  const character = makeCharacterFixture({
    race: race.name,
    raceSource: race.source,
    subrace: subrace.name,
    subraceSource: subrace.source,
  })
  const resolution = resolveRaceReference(
    {
      name: character.race,
      source: character.raceSource,
      subraceName: character.subrace,
      subraceSource: character.subraceSource,
    },
    { racesByKey: buildRaceLookup(filtered) },
    { racesByKey: buildRaceLookup(raw) },
  )
  return ensureSpellProfiles(character, new Map(), undefined, { raceResolution: resolution })
}

describe('resolved racial spell profiles', () => {
  beforeEach(() => {
    filtered = []
    raw = []
  })

  test('one inherited version spell stays fixed instead of becoming a choice against itself', () => {
    const race = installRace({
      additionalSpells: [{ ability: 'int', innate: { 1: ['light'] } }],
      _versions: [{ name: 'Test Race; Complete', source: 'TEST' }],
    })
    const racial = profiles(race, race.subraces![0]).find((profile) => profile.type === 'racial')
    expect(racial?.fixedSpells).toEqual(['light|PHB'])
    expect(racial?.choices).toEqual([])
  })

  test('an inherited version choice retains its filter and count', () => {
    const race = installRace({
      additionalSpells: [
        { ability: 'int', known: { _: [{ choose: 'level=0|class=Sorcerer', count: 1 }] } },
      ],
      _versions: [{ name: 'Test Race; Choice', source: 'TEST' }],
    })
    expect(
      profiles(race, race.subraces![0]).find((profile) => profile.type === 'racial')?.choices,
    ).toEqual([expect.objectContaining({ count: 1, filter: { level: 0, classes: ['Sorcerer'] } })])
  })

  test('a complete version removal does not restore parent grants', () => {
    const race = installRace({
      additionalSpells: [{ innate: { 1: ['light'] } }],
      _versions: [{ name: 'Test Race; Removed', source: 'TEST', additionalSpells: null }],
    })
    expect(profiles(race, race.subraces![0]).some((profile) => profile.type === 'racial')).toBe(
      false,
    )
  })

  test('traditional subraces retain additive parent and child blocks', () => {
    const parentBlock = { innate: { 1: ['light'] } }
    const childBlock = { innate: { 1: ['mage hand'] } }
    const race = installRace({
      additionalSpells: [parentBlock],
      subraces: [{ name: 'Traditional', source: 'TEST', additionalSpells: [childBlock] }],
    })
    expect(deriveRaceSpellSelection(race, race.subraces![0]).additionalSpells).toEqual([
      parentBlock,
      childBlock,
    ])
  })

  test('traditional filtering retains unnamed and matching parent blocks', () => {
    const shared = { innate: { 1: ['light'] } }
    const selected = { name: 'Selected', innate: { 1: ['mage hand'] } }
    const race = installRace({
      additionalSpells: [shared, selected, { name: 'Other', innate: { 1: ['minor illusion'] } }],
      subraces: [{ name: 'Selected', source: 'TEST' }],
    })
    expect(deriveRaceSpellSelection(race, race.subraces![0]).additionalSpells).toEqual([
      shared,
      selected,
    ])
  })

  test('complete raw versions establish spell removals when the parent is filtered out', () => {
    const race = installRace({
      additionalSpells: [{ innate: { 1: ['light'] } }],
      _versions: [{ name: 'Test Race; Removed', source: 'TEST', additionalSpells: null }],
    })
    filtered = []
    expect(profiles(race, race.subraces![0]).some((profile) => profile.type === 'racial')).toBe(
      false,
    )
  })
})
