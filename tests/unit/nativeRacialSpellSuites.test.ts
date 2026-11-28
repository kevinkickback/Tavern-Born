import { describe, expect, test } from 'vitest'
import { getCreatorRacialSpellPending } from '@/components/character/wizard/creatorChoiceGroups'
import { parseRaceSpellBlocks } from '@/lib/5etools/raceSpells'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import {
  applyRaceSelectionCommand,
  applySubraceSelectionCommand,
} from '@/lib/character/commands/raceCommands'
import { setRacialCastingAbility } from '@/lib/character/commands/spellCommands'
import type { Class5e, Race5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeSpellFixture } from '../fixtures/gameDataFixtures'

function applyRaceAtLevel(race: Race5e, child?: Race5e, level = 1) {
  const initial = buildInitialCharacter(
    {
      initial: {
        name: 'Native racial spell suites',
        originSystem: '2014',
        allowedSources: ['AAG', 'MTF'],
      },
      race: { name: 'Human', source: 'PHB' } as Race5e,
      classEntity: {
        name: 'Fighter',
        source: 'PHB',
        hd: { number: 1, faces: 10 },
      } as Class5e,
      background: { name: 'Acolyte', source: 'PHB' },
    },
    new Map(),
    () => [],
  )
  expect(characterPersistenceSchema.safeParse(initial).success).toBe(true)
  const progression = applyClassProgressionUpdate(initial, initial.provenance, [
    { name: 'Fighter', source: 'PHB', levels: level },
  ])
  const advanced = {
    ...initial,
    ...progression.characterPatch,
    provenance: progression.provenanceUpdate,
  }
  const selection = applyRaceSelectionCommand(
    advanced,
    advanced.provenance,
    race,
    child,
    0,
    () => [],
  )
  return { ...advanced, ...selection.characterPatch, provenance: selection.provenanceUpdate }
}

describe('native racial spell suites and actual owners', () => {
  test('another printing of an already selected cantrip cannot keep a Creator pick pending', () => {
    const character = applyRaceAtLevel({
      name: 'Cantrip lineage',
      source: 'PHB',
      additionalSpells: [
        {
          known: { 1: { _: [{ choose: 'level=0|class=Wizard', count: 2 }] } },
          ability: 'int',
        },
      ],
    })
    const profile = character.spells.spellProfiles.find(({ type }) => type === 'racial')!
    const [choice] = profile.choices!
    const selected = { ...profile, choices: [{ ...choice, selected: ['Light|PHB'] }] }
    const cantrip = (name: string, source: string) =>
      makeSpellFixture({
        name,
        source,
        level: 0,
        classes: { fromClassList: [{ name: 'Wizard', source: 'PHB' }] },
      })
    expect(
      getCreatorRacialSpellPending(selected, [cantrip('Light', 'PHB'), cantrip('Light', 'XPHB')])
        .picks.size,
    ).toBe(0)
    expect(
      getCreatorRacialSpellPending(selected, [
        cantrip('Light', 'PHB'),
        cantrip('Mage Hand', 'PHB'),
      ]).picks.has(choice.id),
    ).toBe(true)
  })

  test('retains an unchanged parent casting choice and size across ordinary child replacement', () => {
    const west = { name: 'West', source: 'PHB' }
    const east = { name: 'East', source: 'PHB' }
    const version = { name: 'Version', source: 'PHB', _isVersion: true, size: ['S', 'M'] }
    const parent: Race5e = {
      name: 'Parent',
      source: 'PHB',
      size: ['S', 'M'],
      additionalSpells: [{ known: { 1: ['light#c'] }, ability: { choose: ['int', 'cha'] } }],
      subraces: [west, east, version],
    }
    const base = { ...applyRaceAtLevel(parent, west), raceSize: 'M' as const }
    const profile = base.spells.spellProfiles.find(({ type }) => type === 'racial')!
    const picked = applyCharacterCommandResult(
      base,
      setRacialCastingAbility(base, base.provenance, profile.id, 'cha', {
        parentRace: parent,
        subraceData: west,
        mergedRace: undefined,
        subraceIsNested: true,
      }),
    )
    const replace = (character: typeof picked, previousSubrace: Race5e, next: Race5e) =>
      applyCharacterCommandResult(
        character,
        applySubraceSelectionCommand(character, character.provenance, parent, next, () => [], {
          previousSubrace,
          previousSubraceIsNested: true,
          subraceIsNested: true,
        }),
      )
    const eastCharacter = replace(picked, west, east)
    expect(eastCharacter.raceSize).toBe('M')
    expect(eastCharacter.spells.spellProfiles.find(({ type }) => type === 'racial')).toMatchObject({
      castingAbility: 'cha',
      cantrips: ['light|PHB'],
      racial: { context: { child: east } },
    })
    expect(characterPersistenceSchema.safeParse(eastCharacter).success).toBe(true)
    const versionCharacter = replace(eastCharacter, east, version)
    expect(versionCharacter.raceSize).toBeUndefined()
    expect(versionCharacter.spells.spellProfiles.some(({ type }) => type === 'racial')).toBe(false)
  })

  test('unselected Astral Elf alternatives declare no active spell or descriptor ownership', () => {
    // Native Astral Elf/AAG has three alternative one-cantrip blocks.
    const character = applyRaceAtLevel({
      name: 'Astral Elf',
      source: 'AAG',
      additionalSpells: [
        { known: { 1: ['dancing lights#c'] }, ability: { choose: ['int', 'wis', 'cha'] } },
        { known: { 1: ['light#c'] }, ability: { choose: ['int', 'wis', 'cha'] } },
        { known: { 1: ['sacred flame#c'] }, ability: { choose: ['int', 'wis', 'cha'] } },
      ],
    } as Race5e)
    const profiles = character.spells.spellProfiles.filter((profile) => profile.type === 'racial')
    expect(profiles).toHaveLength(1)
    expect(profiles[0].cantrips).toEqual([])
    expect(profiles[0].spellsKnown).toEqual([])
    expect(profiles[0].fixedSpells ?? []).toEqual([])
    expect(profiles[0].choices ?? []).toEqual([])
    expect(character.provenance.spells).toEqual({})
    expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
  })

  test('ordinary Tiefling and Fierna retain both complete mandatory suites at level five', () => {
    const child = {
      name: 'Fierna',
      source: 'MTF',
      additionalSpells: [
        {
          innate: {
            3: { daily: { 1: ['charm person#2'] } },
            5: { daily: { 1: ['suggestion'] } },
          },
          ability: 'cha',
          known: { 1: ['friends#c'] },
        },
      ],
    } as Race5e
    const parent = {
      name: 'Tiefling',
      source: 'PHB',
      additionalSpells: [
        {
          innate: {
            3: { daily: { 1: ['hellish rebuke#2'] } },
            5: { daily: { 1: ['darkness'] } },
          },
          ability: 'cha',
          known: { 1: ['thaumaturgy#c'] },
        },
      ],
      subraces: [child],
    } as Race5e
    const character = applyRaceAtLevel(parent, child, 5)
    const profiles = character.spells.spellProfiles.filter((profile) => profile.type === 'racial')
    expect(profiles).toHaveLength(2)
    const parentProfile = profiles.find((profile) => profile.raceName === 'Tiefling')!
    const childProfile = profiles.find((profile) => profile.raceName === 'Fierna')!
    expect(parentProfile.cantrips).toEqual(['thaumaturgy|PHB'])
    expect(parentProfile.spellsKnown).toEqual(['hellish rebuke|PHB', 'darkness|PHB'])
    expect(childProfile.cantrips).toEqual(['friends|PHB'])
    expect(childProfile.spellsKnown).toEqual(['charm person|PHB', 'suggestion|PHB'])
    expect(character.provenance.spells['hellish rebuke']).toEqual([
      expect.objectContaining({
        sourceType: 'race',
        sourceName: 'Tiefling',
        sourceRef: 'PHB',
        grantSource: 'PHB',
        grantType: 'fixed',
      }),
    ])
    expect(character.provenance.spells.friends).toEqual([
      expect.objectContaining({
        sourceType: 'subrace',
        sourceName: 'Fierna',
        sourceRef: 'MTF',
        grantSource: 'PHB',
        grantType: 'fixed',
      }),
    ])
    expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
  })

  test('an independent child grant cannot replace the parent descriptor or casting ability', () => {
    const child = {
      name: 'Child',
      source: 'PHB',
      additionalSpells: [{ known: { 1: ['light#c'] }, ability: 'wis' }],
    } as Race5e
    const character = applyRaceAtLevel(
      {
        name: 'Parent',
        source: 'PHB',
        additionalSpells: [
          { known: { _: [{ choose: 'level=0|class=Wizard', count: 2 }] }, ability: 'int' },
        ],
        subraces: [child],
      } as Race5e,
      child,
    )
    const profiles = character.spells.spellProfiles.filter((profile) => profile.type === 'racial')
    expect(profiles).toHaveLength(2)
    const parentProfile = profiles.find((profile) => profile.raceName === 'Parent')!
    const childProfile = profiles.find((profile) => profile.raceName === 'Child')!
    expect(parentProfile.castingAbility).toBe('int')
    expect(parentProfile.choices).toEqual([
      expect.objectContaining({
        count: 2,
        isCantrip: true,
        filter: { level: 0, classes: ['Wizard'] },
        selected: [],
      }),
    ])
    expect(parentProfile.cantrips).toEqual([])
    expect(childProfile.castingAbility).toBe('wis')
    expect(childProfile.cantrips).toEqual(['light|PHB'])
    expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
  })

  test('the native parser preserves block names for choose-only suites', () => {
    const blocks = parseRaceSpellBlocks([
      { name: 'High Elf', known: { 1: { _: [{ choose: 'level=0|class=Wizard' }] } } },
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ name: 'High Elf' })
    expect(blocks[0].grants).toEqual([])
    expect(blocks[0].choices).toEqual([
      expect.objectContaining({
        count: 1,
        level: 1,
        isCantrip: true,
        filter: { level: 0, classes: ['Wizard'] },
      }),
    ])
  })
})
