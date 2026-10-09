import { describe, expect, test } from 'vitest'
import {
  deriveNativeRacialSpellProfiles,
  getNativeRacialSpellOwners,
  refreshNativeRacialSpellState,
} from '@/lib/calculations/nativeRacialSpells'
import {
  setRacialCastingAbility,
  setRacialSpellChoice,
  setRacialSpellSuite,
} from '@/lib/character/commands/spellCommands'
import type { Race5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import {
  makeNativeRacialCharacter,
  nativeChoiceSpellLookup,
  nativeRaceResolution,
} from '../../fixtures/nativeRacialCharacter'

const race = {
  name: 'Caster',
  source: 'PHB',
  additionalSpells: [
    {
      ability: { choose: ['int', 'wis'] },
      known: {
        _: [{ choose: 'level=0|class=Wizard', count: 2 }],
        5: [{ choose: 'level=1|class=Cleric' }],
      },
      innate: {
        1: ['light#c'],
        3: { daily: { 1: ['hellish rebuke'] } },
        5: { daily: { 1: ['darkness'] } },
      },
    },
  ],
} as Race5e
const resolution = nativeRaceResolution(race)
const apply = (
  character: ReturnType<typeof makeNativeRacialCharacter>,
  result: ReturnType<typeof setRacialSpellChoice>,
) => ({ ...character, ...result.characterPatch, provenance: result.provenanceUpdate })

describe('current native racial profiles', () => {
  test('mandatory suite retains level gates, exact kinds, daily metadata and block-local descriptors', () => {
    const character = makeNativeRacialCharacter(race, undefined, 3)
    const profile = character.spells.spellProfiles.find((entry) => entry.type === 'racial')!
    expect(profile.racial).toMatchObject({
      ownerType: 'race',
      mode: 'mandatory',
      context: { parent: { name: 'Caster', source: 'PHB' } },
      fixed: [
        { reference: 'light|PHB', isCantrip: true },
        { reference: 'hellish rebuke|PHB', isCantrip: false, dailyUses: 1 },
      ],
    })
    expect(profile.cantrips).toEqual(['light|PHB'])
    expect(profile.spellsKnown).toEqual(['hellish rebuke|PHB'])
    expect(profile.choices).toEqual([
      expect.objectContaining({
        level: 0,
        count: 2,
        selected: [],
        filter: { level: 0, classes: ['Wizard'] },
      }),
    ])
    expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
    expect(
      setRacialSpellSuite(character, character.provenance, profile.id, undefined, resolution)
        .characterPatch,
    ).toEqual({})
  })
  test('whole alternative blocks remain unselected, select all members and clear without resurrection', () => {
    const alternatives = {
      ...race,
      additionalSpells: [
        {
          name: 'First',
          ability: 'int',
          known: { 1: ['light#c', 'mage hand#c'] },
          innate: { 3: { daily: { 1: ['shield'] } }, 5: { daily: { 1: ['darkness'] } } },
        },
        { name: 'Second', ability: 'wis', known: { 1: ['sacred flame#c'] } },
      ],
    } as Race5e
    const live = nativeRaceResolution(alternatives)
    let character = makeNativeRacialCharacter(alternatives, undefined, 5)
    const owner = getNativeRacialSpellOwners(character, live)![0]
    expect(character.spells.spellProfiles.find((entry) => entry.id === owner.id)?.cantrips).toEqual(
      [],
    )
    character = apply(
      character,
      setRacialSpellSuite(character, character.provenance, owner.id, owner.suites[0].id, live),
    )
    expect(character.spells.spellProfiles.find((entry) => entry.id === owner.id)).toMatchObject({
      cantrips: ['light|PHB', 'mage hand|PHB'],
      spellsKnown: ['shield|PHB', 'darkness|PHB'],
      castingAbility: 'int',
    })
    expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
    character = apply(
      character,
      setRacialSpellSuite(character, character.provenance, owner.id, owner.suites[1].id, live),
    )
    expect(Object.keys(character.provenance.spells)).toEqual(['sacred flame'])
    character = apply(
      character,
      setRacialSpellSuite(character, character.provenance, owner.id, undefined),
    )
    expect(refreshNativeRacialSpellState(character, live).provenance.spells).toEqual({})
    expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
  })
  test('independent descriptors can share targets and Clear retains fixed membership', () => {
    const shared = {
      ...race,
      additionalSpells: [
        {
          ability: 'int',
          known: {
            1: [
              'light#c',
              { choose: 'level=0|class=Wizard', count: 2 },
              { choose: 'level=0|class=Cleric' },
            ],
          },
        },
      ],
    } as Race5e
    const live = nativeRaceResolution(shared)
    let character = makeNativeRacialCharacter(shared)
    const profile = character.spells.spellProfiles.find((entry) => entry.type === 'racial')!
    character = apply(
      character,
      setRacialSpellChoice(
        character,
        character.provenance,
        profile.id,
        profile.choices![0].id,
        ['Light|PHB', 'Mage Hand|PHB'],
        live,
        nativeChoiceSpellLookup,
      ),
    )
    character = apply(
      character,
      setRacialSpellChoice(
        character,
        character.provenance,
        profile.id,
        profile.choices![1].id,
        ['Light|PHB'],
        live,
        nativeChoiceSpellLookup,
      ),
    )
    expect(character.provenance.spells.light).toHaveLength(3)
    character = apply(
      character,
      setRacialSpellChoice(character, character.provenance, profile.id, profile.choices![0].id, []),
    )
    expect(
      character.spells.spellProfiles.find((entry) => entry.id === profile.id)?.cantrips,
    ).toEqual(['Light|PHB'])
    expect(character.provenance.spells.light).toHaveLength(2)
    expect(character.provenance.spells['mage hand']).toBeUndefined()
    expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
  })
  test('over-quota, duplicate logical printings and unqualified targets reject without partial writes', () => {
    const character = makeNativeRacialCharacter(race)
    const profile = character.spells.spellProfiles.find((entry) => entry.type === 'racial')!
    for (const selected of [
      ['Light|PHB', 'Light|XPHB'],
      ['Light'],
      ['Light|PHB', 'Mage Hand|PHB', 'Fire Bolt|PHB'],
    ])
      expect(
        setRacialSpellChoice(
          character,
          character.provenance,
          profile.id,
          profile.choices![0].id,
          selected,
          resolution,
          nativeChoiceSpellLookup,
        ).characterPatch,
      ).toEqual({})
  })
  test('casing and semantic reorder retain scoped choices and ability; changed block semantics reset them', () => {
    let character = makeNativeRacialCharacter(race)
    const profile = character.spells.spellProfiles.find((entry) => entry.type === 'racial')!
    character = apply(
      character,
      setRacialSpellChoice(
        character,
        character.provenance,
        profile.id,
        profile.choices![0].id,
        ['Mage Hand|PHB'],
        resolution,
        nativeChoiceSpellLookup,
      ),
    )
    character = apply(
      character,
      setRacialCastingAbility(character, character.provenance, profile.id, 'wis'),
    )
    const reordered = {
      ...race,
      name: 'CASTER',
      source: 'phb',
      additionalSpells: [
        {
          innate: {
            5: { daily: { 1: ['DARKNESS'] } },
            3: { daily: { 1: ['HELLISH REBUKE'] } },
            1: ['LIGHT#c'],
          },
          known: {
            5: [{ choose: 'class=cleric|level=1' }],
            _: [{ choose: 'class=wizard|level=0', count: 2 }],
          },
          ability: { choose: ['WIS', 'INT'] },
        },
      ],
    } as Race5e
    const refreshed = deriveNativeRacialSpellProfiles(character, nativeRaceResolution(reordered))[0]
    expect(refreshed.id).toBe(profile.id)
    expect(refreshed.choices?.[0].selected).toEqual(['Mage Hand|PHB'])
    expect(refreshed.castingAbility).toBe('wis')
    const changed = {
      ...race,
      additionalSpells: [{ ability: 'cha', known: { _: [{ choose: 'level=0|class=Sorcerer' }] } }],
    } as Race5e
    expect(
      deriveNativeRacialSpellProfiles(character, nativeRaceResolution(changed))[0],
    ).toMatchObject({
      castingAbility: 'cha',
      cantrips: [],
      choices: [expect.objectContaining({ selected: [] })],
    })
  })
  test('ambiguous duplicate suites and descriptors reject instead of sharing player setup', () => {
    for (const additionalSpells of [
      [{ known: { 1: ['light#c'] } }, { known: { 1: ['LIGHT#c'] } }],
      [{ known: { 1: [{ choose: 'level=0|class=Wizard' }, { choose: 'class=wizard|level=0' }] } }],
    ])
      expect(() =>
        makeNativeRacialCharacter({ name: 'Duplicate', source: 'PHB', additionalSpells } as Race5e),
      ).toThrow(/Ambiguous duplicate/)
  })
})

test('same-pool descriptors with distinct daily limits configure and clear independently through strict reopen', () => {
  const scheduled: Race5e = {
    name: 'Schedule caster',
    source: 'PHB',
    additionalSpells: [
      {
        innate: {
          1: {
            daily: {
              1: [{ choose: { from: ['light#c', 'mage hand#c'] } }],
              2: [{ choose: { from: ['light#c', 'mage hand#c'] } }],
            },
          },
        },
      },
    ],
  }
  const live = nativeRaceResolution(scheduled)
  let character = makeNativeRacialCharacter(scheduled)
  const profile = character.spells.spellProfiles.find((entry) => entry.type === 'racial')!
  expect(profile.choices).toHaveLength(2)
  expect(profile.choices?.map((choice) => choice.dailyUses)).toEqual([1, 2])
  for (const choice of profile.choices!)
    character = apply(
      character,
      setRacialSpellChoice(
        character,
        character.provenance,
        profile.id,
        choice.id,
        ['Light|PHB'],
        live,
        nativeChoiceSpellLookup,
      ),
    )
  character = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(character)))
  expect(character.provenance.spells.light).toHaveLength(2)
  character = apply(
    character,
    setRacialSpellChoice(character, character.provenance, profile.id, profile.choices![0].id, []),
  )
  expect(character.spells.spellProfiles.find((entry) => entry.id === profile.id)!.cantrips).toEqual(
    ['Light|PHB'],
  )
  expect(character.provenance.spells.light).toEqual([
    expect.objectContaining({ grantVariant: profile.choices![1].id }),
  ])
  expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
})

test('Forest Gnome proficiency-based daily spell applies at level three and remains a typed saved expression', () => {
  const race: Race5e = { name: 'Gnome', source: 'XPHB' }
  const child: Race5e = {
    name: 'Forest Gnome Lineage',
    source: 'XPHB',
    _isVersion: true,
    additionalSpells: [
      {
        ability: { choose: ['int', 'wis', 'cha'] },
        known: { 1: ['minor illusion|xphb#c'] },
        innate: { 3: { daily: { pb: ['speak with animals|xphb'] } } },
      },
    ],
  }
  const character = makeNativeRacialCharacter(race, child, 3, '2024')
  const profile = character.spells.spellProfiles.find((entry) => entry.type === 'racial')!
  expect(profile.racial?.fixed).toEqual([
    { reference: 'minor illusion|xphb', isCantrip: true },
    { reference: 'speak with animals|xphb', isCantrip: false, dailyUses: 'pb' },
  ])
  expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
})
