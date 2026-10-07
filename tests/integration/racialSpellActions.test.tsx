import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useCharacterActions } from '@/hooks/character/useCharacterActions'
import { useCharacterRaceData } from '@/hooks/character/useCharacterRaceData'
import { resolveRaceReference } from '@/lib/5etools/entityResolvers'
import { buildRaceLookup, buildSpellLookup } from '@/lib/5etools/lookups'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { deriveSpellActions } from '@/lib/calculations/actions'
import { ensureSpellProfiles } from '@/lib/calculations/spellProfiles'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { Class5e, Race5e, Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const catalog = vi.hoisted(() => ({
  filtered: [] as Race5e[],
  lookups: {
    racesByKey: {} as Record<string, Race5e>,
    spellsByKey: {} as Record<string, Spell5e>,
  },
}))
vi.mock('@/hooks/data/useFilteredGameData', () => ({
  useFilteredGameData: () => ({ races: catalog.filtered }),
}))
vi.mock('@/hooks/data/useGameData', () => ({
  useRaceLookup: () => catalog.lookups.racesByKey,
  useItemPropertyLookup: () => ({}),
}))
vi.mock('@/store/gameDataStore', () => ({
  useGameDataStore: (
    selector: (state: { gameData: { lookups: typeof catalog.lookups } }) => unknown,
  ) => selector({ gameData: { lookups: catalog.lookups } }),
}))

const shockingGrasp = {
  name: 'Shocking Grasp',
  source: 'PHB',
  level: 0,
  school: 'V',
  time: [{ number: 1, unit: 'action' }],
  range: { type: 'point', distance: { type: 'touch' } },
  duration: [{ type: 'instant' }],
  entries: ['A melee spell attack.'],
} as Spell5e
const otherPrinting = {
  ...shockingGrasp,
  source: 'XPHB',
  time: [{ number: 1, unit: 'bonus' }],
} as Spell5e
const choiceBlock = {
  ability: { choose: ['int', 'wis', 'cha'] },
  known: { _: [{ choose: 'level=0|class=Sorcerer', count: 1 }] },
}

beforeEach(() => {
  catalog.filtered = []
  catalog.lookups = {
    racesByKey: {},
    spellsByKey: buildSpellLookup([otherPrinting, shockingGrasp]),
  }
})
afterEach(cleanup)

function install(races: Race5e[], filtered = races) {
  catalog.filtered = filtered
  catalog.lookups = { ...catalog.lookups, racesByKey: buildRaceLookup(races) }
}

function savedChoice(parent: Race5e, child: Race5e, profileName: string): Character {
  const character = makeCharacterFixture({
    race: parent.name,
    raceSource: parent.source,
    subrace: child.name,
    subraceSource: child.source,
  })
  character.spells.spellProfiles.push({
    id: `racial:${profileName}|${child.source}`,
    type: 'racial',
    label: 'Racial Spells',
    raceName: profileName,
    raceSource: child.source,
    castingAbility: 'wis',
    choices: [
      {
        id: 'direct-_-choose-0',
        count: 1,
        isCantrip: true,
        filter: { level: 0, classes: ['Sorcerer'] },
        selected: ['Shocking Grasp|PHB'],
      },
    ],
    cantrips: ['Shocking Grasp|PHB'],
    spellsKnown: [],
    preparedSpells: [],
    alwaysPrepared: true,
  })
  return character
}

function assertSavedChoiceAcrossConsumers(character: Character, expectedProfileName: string) {
  const before = structuredClone(character)
  const { result: raceResult } = renderHook(() => useCharacterRaceData(character))
  const { result: actionsResult } = renderHook(() => useCharacterActions(character))
  expect(raceResult.current.displayName).toBe(expectedProfileName)
  const racial = ensureSpellProfiles(character, new Map(), {
    name: raceResult.current.displayName ?? '',
    source: raceResult.current.displaySource,
    additionalSpells: raceResult.current.mergedAdditionalSpells,
  }).find((profile) => profile.type === 'racial')
  expect(racial?.cantrips).toEqual(['Shocking Grasp|PHB'])
  expect(racial?.choices?.[0].selected).toEqual(['Shocking Grasp|PHB'])
  expect(racial?.castingAbility).toBe('wis')
  const expected = expect.objectContaining({
    name: 'Shocking Grasp',
    kind: 'action',
    active: true,
    source: expect.objectContaining({ source: 'PHB' }),
  })
  expect(actionsResult.current).toContainEqual(expected)
  const pdf = createCharacterSheetViewModel(character, catalog.lookups)
  expect(pdf.actions).toContainEqual(expected)
  expect(pdf.spellRows).toContainEqual(expect.objectContaining({ name: 'Shocking Grasp' }))
  expect(character).toEqual(before)
}

test.each([
  'visible',
  'raw fallback',
  'hidden child',
] as const)('a saved nested version choice reaches spell, action and PDF projections with %s data', (visibility) => {
  const parent = (
    parseRaces({
      race: [
        {
          name: 'Kobold',
          source: 'MPMM',
          additionalSpells: [choiceBlock],
          _versions: [{ name: 'Kobold; Draconic Sorcery', source: 'MPMM' }],
        },
      ],
    }) as Race5e[]
  )[0]
  install(
    [parent],
    visibility === 'visible'
      ? [parent]
      : visibility === 'hidden child'
        ? [{ ...parent, subraces: [] }]
        : [],
  )
  const child = parent.subraces?.[0]
  expect(child?.name).toBe('Draconic Sorcery')
  if (!child) throw new Error('Expected the parsed version')
  assertSavedChoiceAcrossConsumers(
    savedChoice(parent, child, 'Draconic Sorcery Kobold'),
    'Draconic Sorcery Kobold',
  )
})

test('a top-level child keeps its existing child-only source-qualified profile identity', () => {
  const parent = { name: 'Parent', source: 'PHB' } as Race5e
  const child = { name: 'Child', source: 'HB', additionalSpells: [choiceBlock] } as Race5e
  install([parent, child])
  assertSavedChoiceAcrossConsumers(savedChoice(parent, child, 'Child'), 'Child')
})

test('named traditional parent spell blocks use only the selected child in every projection', () => {
  const child = { name: 'Selected', source: 'PHB' } as Race5e
  const parent = {
    name: 'Parent',
    source: 'PHB',
    subraces: [child],
    additionalSpells: [
      { name: 'Selected', ...choiceBlock },
      { name: 'Other', known: { 1: ['light#c'] } },
    ],
  } as Race5e
  install([parent])
  assertSavedChoiceAcrossConsumers(savedChoice(parent, child, 'Selected Parent'), 'Selected Parent')
})

test.each([
  null,
  [],
])('a complete version removing spells with %j does not restore stale parent actions', (additionalSpells) => {
  const parent = (
    parseRaces({
      race: [
        {
          name: 'Parent',
          source: 'PHB',
          additionalSpells: [{ known: { 1: ['shocking grasp#c'] } }],
          _versions: [{ name: 'Parent; Removed', additionalSpells }],
        },
      ],
    }) as Race5e[]
  )[0]
  install([parent])
  const child = parent.subraces?.[0]
  if (!child) throw new Error('Expected the parsed version')
  const character = savedChoice(parent, child, 'Removed Parent')
  const before = structuredClone(character)
  const { result: raceResult } = renderHook(() => useCharacterRaceData(character))
  const { result: actionsResult } = renderHook(() => useCharacterActions(character))
  expect(raceResult.current.mergedAdditionalSpells).toEqual([])
  expect(actionsResult.current.some((action) => action.source.kind === 'spell')).toBe(false)
  expect(
    createCharacterSheetViewModel(character, catalog.lookups).actions.some(
      (action) => action.source.kind === 'spell',
    ),
  ).toBe(false)
  expect(character).toEqual(before)
})

test('an inherited complete version fixed spell appears once in action and PDF projections', () => {
  const parent = (
    parseRaces({
      race: [
        {
          name: 'Parent',
          source: 'PHB',
          additionalSpells: [{ known: { 1: ['shocking grasp#c'] } }],
          _versions: [{ name: 'Parent; Inherited' }],
        },
      ],
    }) as Race5e[]
  )[0]
  install([parent])
  const character = makeCharacterFixture({
    race: 'Parent',
    raceSource: 'PHB',
    subrace: 'Inherited',
    subraceSource: 'PHB',
  })
  const { result } = renderHook(() => useCharacterActions(character))
  expect(result.current.filter((action) => action.name === 'Shocking Grasp')).toHaveLength(1)
  expect(
    createCharacterSheetViewModel(character, catalog.lookups).actions.filter(
      (action) => action.name === 'Shocking Grasp',
    ),
  ).toHaveLength(1)
})

test('different same-name race printings cannot borrow a stored racial choice', () => {
  const child = { name: 'Child', source: 'PHB' } as Race5e
  const parent = {
    name: 'Parent',
    source: 'PHB',
    subraces: [child],
    additionalSpells: [choiceBlock],
  } as Race5e
  const character = savedChoice(parent, child, 'Child Parent')
  const currentChild = { ...child, source: 'HB' } as Race5e
  const currentParent = { ...parent, source: 'HB', subraces: [currentChild] } as Race5e
  install([parent, currentParent])
  const selected = { ...character, raceSource: 'HB', subraceSource: 'HB' }
  const { result } = renderHook(() => useCharacterActions(selected))
  expect(result.current.some((action) => action.name === 'Shocking Grasp')).toBe(false)
  expect(
    createCharacterSheetViewModel(selected, catalog.lookups).actions.some(
      (action) => action.name === 'Shocking Grasp',
    ),
  ).toBe(false)
})

test('a resolved race without spells preserves independent class grants when its class catalog is unavailable', () => {
  install([{ name: 'Parent', source: 'PHB' } as Race5e])
  const character = makeCharacterFixture({ race: 'Parent', raceSource: 'PHB' })
  character.spells.spellProfiles = character.spells.spellProfiles.map((profile) =>
    profile.type === 'class'
      ? { ...profile, cantrips: ['Shocking Grasp|PHB'], fixedSpells: ['Shocking Grasp|PHB'] }
      : profile,
  )
  const before = structuredClone(character)
  const expected = expect.objectContaining({ name: 'Shocking Grasp', active: true })
  const { result } = renderHook(() => useCharacterActions(character))
  expect(result.current).toContainEqual(expected)
  expect(createCharacterSheetViewModel(character, catalog.lookups).actions).toContainEqual(expected)
  expect(character).toEqual(before)
})

test('unavailable race data preserves the existing saved-profile projection fallback', () => {
  const character = savedChoice(
    { name: 'Parent', source: 'PHB' } as Race5e,
    { name: 'Child', source: 'PHB' } as Race5e,
    'Child Parent',
  )
  const before = structuredClone(character)
  const expected = expect.objectContaining({
    name: 'Shocking Grasp',
    active: true,
    source: expect.objectContaining({ source: 'PHB' }),
  })
  const { result } = renderHook(() => useCharacterActions(character))
  expect(result.current).toContainEqual(expected)
  expect(createCharacterSheetViewModel(character, catalog.lookups).actions).toContainEqual(expected)
  expect(character).toEqual(before)
})

test.each([
  'missing child',
  'other child printing',
] as const)('%s preserves the existing fallback when the saved child cannot resolve', (availability) => {
  const parent = { name: 'Parent', source: 'PHB' } as Race5e
  const child = { name: 'Child', source: 'HB' } as Race5e
  const character = savedChoice(parent, child, 'Child Parent')
  install([
    availability === 'missing child'
      ? parent
      : { ...parent, subraces: [{ ...child, source: 'PHB' }] },
  ])
  const before = structuredClone(character)
  const expected = expect.objectContaining({
    name: 'Shocking Grasp',
    active: true,
    source: expect.objectContaining({ source: 'PHB' }),
  })
  const { result } = renderHook(() => useCharacterActions(character))
  expect(result.current).toContainEqual(expected)
  expect(createCharacterSheetViewModel(character, catalog.lookups).actions).toContainEqual(expected)
  expect(character).toEqual(before)
})

test.each([
  'missing child',
  'other child printing',
] as const)('%s does not replace saved profiles with a parent spell block', (availability) => {
  const parent = {
    name: 'Parent',
    source: 'PHB',
    additionalSpells: [{ known: { 1: ['parent spell#c'] } }],
  } as Race5e
  const child = { name: 'Child', source: 'HB' } as Race5e
  const character = savedChoice(parent, child, 'Child Parent')
  const parentSpell = { ...shockingGrasp, name: 'Parent Spell' }
  catalog.lookups.spellsByKey = buildSpellLookup([shockingGrasp, parentSpell])
  install([
    availability === 'missing child'
      ? parent
      : { ...parent, subraces: [{ ...child, source: 'PHB' }] },
  ])
  const before = structuredClone(character)
  const { result, rerender } = renderHook(() => useCharacterActions(character))
  const pdf = createCharacterSheetViewModel(character, catalog.lookups)
  const names = (actions: typeof result.current) =>
    actions.filter((action) => action.source.kind === 'spell').map((action) => action.name)
  expect(names(result.current)).toEqual(['Shocking Grasp'])
  expect(names(pdf.actions)).toEqual(['Shocking Grasp'])
  expect(
    names(
      deriveSpellActions(character, catalog.lookups.spellsByKey, {
        classes: [{ name: 'Fighter', source: 'PHB' } as Class5e],
        race: parent,
        raceResolution: resolveRaceReference(character, catalog.lookups),
      }),
    ),
  ).toEqual(['Shocking Grasp'])
  install([{ ...parent, subraces: [{ ...child, _isVersion: true, additionalSpells: [] }] }])
  rerender()
  expect(names(result.current)).toEqual([])
  expect(names(createCharacterSheetViewModel(character, catalog.lookups).actions)).toEqual([])
  expect(character).toEqual(before)
})
