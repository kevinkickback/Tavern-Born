import { expect, test } from 'vitest'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { buildRacialSpellProfile } from '@/lib/calculations/spellProfiles'
import {
  applyRaceSelectionCommand,
  applySubraceSelectionCommand,
} from '@/lib/character/commands/raceCommands'
import { setRacialSpellChoice } from '@/lib/character/commands/spellCommands'
import { addSpellGrant, emptyProvenance, makeSourceTag } from '@/lib/provenance'
import type { Race5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

test('removing version spells retracts the persisted racial profile and keeps independent profiles and usage', () => {
  const race = (
    parseRaces({
      race: [
        {
          name: 'Caster',
          source: 'PHB',
          additionalSpells: [{ innate: { 1: { daily: { 1: ['light#c'] } } } }],
          _versions: [{ name: 'Caster; Removed', additionalSpells: null }],
        },
      ],
    }) as Race5e[]
  )[0]
  const fixture = makeCharacterFixture({ race: 'Caster', raceSource: 'PHB' })
  const independent = fixture.spells.spellProfiles.map((profile) => ({
    ...profile,
    cantrips: ['light'],
    spellsKnown: ['shield'],
    fixedSpells: ['shield'],
    preparedSpells: ['shield'],
  }))
  const initial = {
    ...fixture,
    spells: {
      ...fixture.spells,
      spellSlots: { 1: { max: 2, used: 1 } },
      spellProfiles: [
        ...independent,
        buildRacialSpellProfile({
          raceName: 'Caster',
          raceSource: 'PHB',
          additionalSpells: race.additionalSpells ?? [],
          totalLevel: 1,
        }),
      ],
    },
  }
  let ledger = addSpellGrant(
    emptyProvenance(),
    'light',
    makeSourceTag('race', 'Caster', 'fixed', 'PHB'),
  )
  ledger = addSpellGrant(ledger, 'light', makeSourceTag('class', 'Fighter', 'choice', 'PHB'))
  const before = structuredClone(initial)
  expect(
    initial.spells.spellProfiles.find((entry) => entry.type === 'racial')?.fixedSpells,
  ).toEqual(['light'])
  const result = applySubraceSelectionCommand(initial, ledger, race, race.subraces?.[0], () => [])
  expect(result.provenanceUpdate.spells.light).toEqual([
    expect.objectContaining({ sourceType: 'class' }),
  ])
  expect(result.characterPatch.spells?.spellProfiles).toEqual(independent)
  expect(result.characterPatch.spells?.spellSlots).toEqual(initial.spells.spellSlots)
  expect(initial).toEqual(before)
})

test('reselecting the same version preserves a valid saved choice, casting ability and its ownership', () => {
  const race = (
    parseRaces({
      race: [
        {
          name: 'Caster',
          source: 'PHB',
          additionalSpells: [
            {
              ability: { choose: ['int', 'wis'] },
              known: { _: [{ choose: 'level=0|class=Wizard' }] },
            },
          ],
          _versions: [{ name: 'Caster; Version' }],
        },
      ],
    }) as Race5e[]
  )[0]
  const original = makeCharacterFixture({ race: '', raceSource: '' })
  const initial = applyRaceSelectionCommand(
    original,
    emptyProvenance(),
    race,
    race.subraces?.[0],
    0,
    () => [],
  )
  const current = { ...original, ...initial.characterPatch }
  const profile = current.spells.spellProfiles.find((entry) => entry.type === 'racial')
  if (!profile) throw new Error('Initial racial profile is required')
  expect(profile.id).toBe('racial:Version Caster|PHB')
  const choice = setRacialSpellChoice(
    current,
    initial.provenanceUpdate,
    profile.id,
    'direct-_-choose-0',
    ['Light|PHB'],
  )
  const selected = { ...current, ...choice.characterPatch }
  selected.spells = {
    ...selected.spells,
    spellProfiles: selected.spells.spellProfiles.map((entry) =>
      entry.id === profile.id ? { ...entry, castingAbility: 'wis' } : entry,
    ),
  }
  const before = structuredClone(selected)
  const result = applySubraceSelectionCommand(
    selected,
    choice.provenanceUpdate,
    race,
    race.subraces?.[0],
    () => [],
  )
  expect(
    result.characterPatch.spells?.spellProfiles.find((entry) => entry.id === profile.id),
  ).toMatchObject({
    castingAbility: 'wis',
    cantrips: ['Light|PHB'],
    choices: [{ id: 'direct-_-choose-0', selected: ['Light|PHB'] }],
  })
  expect(result.provenanceUpdate.spells.light).toEqual([
    expect.objectContaining({
      sourceType: 'subrace',
      sourceName: 'Version',
      sourceRef: 'PHB',
      grantType: 'choice',
      grantVariant: 'direct-_-choose-0',
    }),
  ])
  expect(selected).toEqual(before)
})

test('a different source printing with the same name does not inherit an old profile choice', () => {
  const original = makeCharacterFixture({ race: '', raceSource: '' })
  const makeRace = (source: string) =>
    ({
      name: 'Caster',
      source,
      additionalSpells: [{ ability: 'int', known: { _: [{ choose: 'level=0|class=Wizard' }] } }],
    }) as Race5e
  const initial = applyRaceSelectionCommand(
    original,
    emptyProvenance(),
    makeRace('PHB'),
    undefined,
    0,
    () => [],
  )
  const current = { ...original, ...initial.characterPatch }
  const saved = setRacialSpellChoice(
    current,
    initial.provenanceUpdate,
    'racial:Caster|PHB',
    'direct-_-choose-0',
    ['Light|PHB'],
  )
  const result = applyRaceSelectionCommand(
    { ...current, ...saved.characterPatch },
    saved.provenanceUpdate,
    makeRace('HB'),
    undefined,
    0,
    () => [],
  )
  expect(
    result.characterPatch.spells?.spellProfiles.filter((entry) => entry.type === 'racial'),
  ).toEqual([
    expect.objectContaining({
      id: 'racial:Caster|HB',
      cantrips: [],
      choices: [expect.objectContaining({ selected: [] })],
    }),
  ])
  expect(result.provenanceUpdate.spells.light).toBeUndefined()
})

test('changed choice rules discard incompatible saved selections and casting abilities', () => {
  const original = makeCharacterFixture({ race: '', raceSource: '' })
  const race = {
    name: 'Caster',
    source: 'PHB',
    additionalSpells: [
      { ability: { choose: ['int', 'wis'] }, known: { _: [{ choose: 'level=0|class=Wizard' }] } },
    ],
  } as Race5e
  const initial = applyRaceSelectionCommand(
    original,
    emptyProvenance(),
    race,
    undefined,
    0,
    () => [],
  )
  const current = { ...original, ...initial.characterPatch }
  const saved = setRacialSpellChoice(
    current,
    initial.provenanceUpdate,
    'racial:Caster|PHB',
    'direct-_-choose-0',
    ['Light|PHB'],
  )
  const selected = { ...current, ...saved.characterPatch }
  selected.spells = {
    ...selected.spells,
    spellProfiles: selected.spells.spellProfiles.map((entry) =>
      entry.type === 'racial' ? { ...entry, castingAbility: 'wis' } : entry,
    ),
  }
  const changed = {
    ...race,
    additionalSpells: [{ ability: 'cha', known: { _: [{ choose: 'level=0|class=Sorcerer' }] } }],
  } as Race5e
  const result = applySubraceSelectionCommand(
    selected,
    saved.provenanceUpdate,
    changed,
    undefined,
    () => [],
  )
  expect(
    result.characterPatch.spells?.spellProfiles.find((entry) => entry.type === 'racial'),
  ).toMatchObject({
    castingAbility: 'cha',
    cantrips: [],
    choices: [
      expect.objectContaining({ selected: [], filter: { level: 0, classes: ['Sorcerer'] } }),
    ],
  })
  expect(result.provenanceUpdate.spells.light).toBeUndefined()
})

test('traditional child replacement keeps fixed parent ownership and replaces child spells', () => {
  const race = {
    name: 'Caster',
    source: 'PHB',
    additionalSpells: [{ known: { 1: ['light#c'] } }],
    subraces: [
      { name: 'Old', source: 'PHB', additionalSpells: [{ known: { 1: ['thaumaturgy#c'] } }] },
      { name: 'New', source: 'PHB' },
    ],
  } as Race5e
  const original = makeCharacterFixture({ race: '', raceSource: '' })
  const initial = applyRaceSelectionCommand(
    original,
    emptyProvenance(),
    race,
    race.subraces?.[0],
    0,
    () => [],
  )
  expect(initial.provenanceUpdate.spells.light).toEqual([
    expect.objectContaining({ sourceType: 'race' }),
  ])
  expect(initial.provenanceUpdate.spells.thaumaturgy).toEqual([
    expect.objectContaining({ sourceType: 'subrace', sourceName: 'Old' }),
  ])
  const result = applySubraceSelectionCommand(
    { ...original, ...initial.characterPatch },
    initial.provenanceUpdate,
    race,
    race.subraces?.[1],
    () => [],
  )
  expect(result.provenanceUpdate.spells.light).toEqual([
    expect.objectContaining({ sourceType: 'race' }),
  ])
  expect(result.provenanceUpdate.spells.thaumaturgy).toBeUndefined()
  expect(
    result.characterPatch.spells?.spellProfiles.find((entry) => entry.type === 'racial'),
  ).toMatchObject({ id: 'racial:New Caster|PHB', cantrips: ['light'], fixedSpells: ['light'] })
})

test('inherited version spell blocks materialize once and returning to the base rebuilds its profile', () => {
  const race = (
    parseRaces({
      race: [
        {
          name: 'Caster',
          source: 'PHB',
          additionalSpells: [{ known: { 1: ['light#c'] } }],
          _versions: [{ name: 'Caster; Version' }],
        },
      ],
    }) as Race5e[]
  )[0]
  const original = makeCharacterFixture({ race: '', raceSource: '' })
  const initial = applyRaceSelectionCommand(
    original,
    emptyProvenance(),
    race,
    race.subraces?.[0],
    0,
    () => [],
  )
  expect(
    initial.characterPatch.spells?.spellProfiles.find((entry) => entry.type === 'racial'),
  ).toMatchObject({
    id: 'racial:Version Caster|PHB',
    fixedSpells: ['light'],
    cantrips: ['light'],
    choices: undefined,
  })
  expect(initial.provenanceUpdate.spells.light).toEqual([
    expect.objectContaining({ sourceType: 'subrace', sourceName: 'Version' }),
  ])
  const restored = applySubraceSelectionCommand(
    { ...original, ...initial.characterPatch },
    initial.provenanceUpdate,
    race,
    undefined,
    () => [],
  )
  expect(
    restored.characterPatch.spells?.spellProfiles.filter((entry) => entry.type === 'racial'),
  ).toEqual([
    expect.objectContaining({
      id: 'racial:Caster|PHB',
      fixedSpells: ['light'],
      cantrips: ['light'],
    }),
  ])
  expect(restored.provenanceUpdate.spells.light).toEqual([
    expect.objectContaining({ sourceType: 'race', sourceName: 'Caster' }),
  ])
})

test('actual multiclass levels gate profile and ledger grants together', () => {
  const race = {
    name: 'Caster',
    source: 'PHB',
    additionalSpells: [{ known: { 1: ['light#c'], 3: ['darkness'], 5: ['invisibility'] } }],
  } as Race5e
  const initial = makeCharacterFixture({
    race: '',
    raceSource: '',
    classProgression: [
      { name: 'Fighter', source: 'PHB', levels: 2 },
      { name: 'Rogue', source: 'PHB', levels: 1 },
    ],
  })
  const result = applyRaceSelectionCommand(initial, emptyProvenance(), race, undefined, 0, () => [])
  expect(
    result.characterPatch.spells?.spellProfiles.find((entry) => entry.type === 'racial'),
  ).toMatchObject({ cantrips: ['light'], spellsKnown: ['darkness'] })
  expect(result.provenanceUpdate.spells.darkness).toHaveLength(1)
  expect(result.provenanceUpdate.spells.invisibility).toBeUndefined()
})

test('selecting a spell-granting race at level five returns its actual level grants in profile and provenance', () => {
  const race = {
    name: 'Caster',
    source: 'PHB',
    additionalSpells: [{ known: { 1: ['light#c'], 3: ['darkness'], 5: ['invisibility'] } }],
  } as Race5e
  const initial = makeCharacterFixture({
    race: '',
    raceSource: '',
    classProgression: [{ name: 'Fighter', source: 'PHB', levels: 5 }],
  })
  const result = applyRaceSelectionCommand(initial, emptyProvenance(), race, undefined, 0, () => [])
  expect(result.provenanceUpdate.spells.darkness).toEqual([
    expect.objectContaining({ sourceType: 'race', sourceName: 'Caster', sourceRef: 'PHB' }),
  ])
  expect(result.provenanceUpdate.spells.invisibility).toHaveLength(1)
  expect(
    result.characterPatch.spells?.spellProfiles.find((profile) => profile.type === 'racial'),
  ).toMatchObject({ cantrips: ['light'], spellsKnown: ['darkness', 'invisibility'] })
})

test('child changes retract stale parent spell ownership after a catalog update while retaining independent grants', () => {
  const parent = {
    name: 'Caster',
    source: 'PHB',
    additionalSpells: [{ known: { 1: ['light#c'] } }],
    subraces: [
      { name: 'Old', source: 'PHB' },
      { name: 'New', source: 'PHB' },
    ],
  } as Race5e
  const original = makeCharacterFixture({ race: '', raceSource: '' })
  const initial = applyRaceSelectionCommand(
    original,
    emptyProvenance(),
    parent,
    parent.subraces?.[0],
    0,
    () => [],
  )
  expect(initial.provenanceUpdate.spells.light).toEqual([
    expect.objectContaining({ sourceType: 'race' }),
  ])
  const ledger = addSpellGrant(
    initial.provenanceUpdate,
    'light',
    makeSourceTag('class', 'Fighter', 'choice', 'PHB'),
  )
  const updatedParent = { ...parent, additionalSpells: undefined }
  const result = applySubraceSelectionCommand(
    { ...original, ...initial.characterPatch },
    ledger,
    updatedParent,
    parent.subraces?.[1],
    () => [],
  )
  expect(result.characterPatch.spells?.spellProfiles.some((entry) => entry.type === 'racial')).toBe(
    false,
  )
  expect(result.provenanceUpdate.spells.light).toEqual([
    expect.objectContaining({ sourceType: 'class' }),
  ])
})

test('a reduced choice count preserves the first valid selection and retracts only excess racial ownership', () => {
  const race = {
    name: 'Caster',
    source: 'PHB',
    additionalSpells: [{ known: { _: [{ choose: 'level=0|class=Wizard', count: 2 }] } }],
  } as Race5e
  const original = makeCharacterFixture({ race: '', raceSource: '' })
  const initial = applyRaceSelectionCommand(
    original,
    emptyProvenance(),
    race,
    undefined,
    0,
    () => [],
  )
  const current = { ...original, ...initial.characterPatch }
  const chosen = setRacialSpellChoice(
    current,
    initial.provenanceUpdate,
    'racial:Caster|PHB',
    'direct-_-choose-0',
    ['Light|PHB', 'Mage Hand|PHB'],
  )
  const independent = addSpellGrant(
    chosen.provenanceUpdate,
    'Mage Hand',
    makeSourceTag('class', 'Fighter', 'choice', 'PHB'),
  )
  const reduced = {
    ...race,
    additionalSpells: [{ known: { _: [{ choose: 'level=0|class=Wizard', count: 1 }] } }],
  } as Race5e
  const result = applyRaceSelectionCommand(
    { ...current, ...chosen.characterPatch },
    independent,
    reduced,
    undefined,
    0,
    () => [],
  )
  expect(
    result.characterPatch.spells?.spellProfiles.find((entry) => entry.type === 'racial'),
  ).toMatchObject({
    cantrips: ['Light|PHB'],
    choices: [expect.objectContaining({ count: 1, selected: ['Light|PHB'] })],
  })
  expect(result.provenanceUpdate.spells.light).toEqual([
    expect.objectContaining({ sourceType: 'race', grantType: 'choice' }),
  ])
  expect(result.provenanceUpdate.spells['mage hand']).toEqual([
    expect.objectContaining({ sourceType: 'class' }),
  ])
})

test('a changed block-choice pool removes an unavailable saved selection', () => {
  const race = {
    name: 'Caster',
    source: 'PHB',
    additionalSpells: [{ known: { 1: ['light#c'] } }, { known: { 1: ['mage hand#c'] } }],
  } as Race5e
  const original = makeCharacterFixture({ race: '', raceSource: '' })
  const initial = applyRaceSelectionCommand(
    original,
    emptyProvenance(),
    race,
    undefined,
    0,
    () => [],
  )
  const current = { ...original, ...initial.characterPatch }
  const chosen = setRacialSpellChoice(
    current,
    initial.provenanceUpdate,
    'racial:Caster|PHB',
    'block-choice',
    ['light'],
  )
  const changed = {
    ...race,
    additionalSpells: [{ known: { 1: ['druidcraft#c'] } }, { known: { 1: ['mage hand#c'] } }],
  } as Race5e
  const result = applyRaceSelectionCommand(
    { ...current, ...chosen.characterPatch },
    chosen.provenanceUpdate,
    changed,
    undefined,
    0,
    () => [],
  )
  expect(
    result.characterPatch.spells?.spellProfiles.find((entry) => entry.type === 'racial'),
  ).toMatchObject({
    cantrips: [],
    choices: [
      expect.objectContaining({
        id: 'block-choice',
        selected: [],
        pool: ['druidcraft', 'mage hand'],
      }),
    ],
  })
  expect(result.provenanceUpdate.spells.light).toBeUndefined()
})
