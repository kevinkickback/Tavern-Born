import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useCharacterActions } from '@/hooks/character/useCharacterActions'
import { resolveRaceReference } from '@/lib/5etools/entityResolvers'
import { buildClassLookup, buildRaceLookup, buildSpellLookup } from '@/lib/5etools/lookups'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { parseRaceSpellBlocks } from '@/lib/5etools/raceSpells'
import { deriveSpellActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { deriveRaceSpellSelection } from '@/lib/calculations/raceSpellSelection'
import { ensureSpellProfiles } from '@/lib/calculations/spellProfiles'
import { setManagedClassSpellChoiceCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import {
  setRacialCastingAbility,
  setRacialSpellChoice,
} from '@/lib/character/commands/spellCommands'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { getCharacterReadiness } from '@/lib/readiness/characterReadiness'
import type { Class5e, GameData, Race5e, Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import { makeManagedClassSpellFixtures } from '../fixtures/managedClassSpellFixtures'
import { nativeChoiceSpellLookup, nativeRaceResolution } from '../fixtures/nativeRacialCharacter'
import { createCurrentCharacterSheetViewModel } from '../fixtures/pdfTemplates'

const catalog = vi.hoisted(() => ({
  filtered: [] as Race5e[],
  current: {} as Partial<GameData>,
  lookups: {
    racesByKey: {} as Record<string, Race5e>,
    classesByKey: {} as Record<string, Class5e>,
    spellsByKey: {} as Record<string, Spell5e>,
  },
}))
vi.mock('@/hooks/data/useFilteredGameData', () => ({
  useFilteredGameData: () =>
    makeGameDataFixture({
      ...catalog.current,
      races: catalog.filtered,
      spells: Object.values(catalog.lookups.spellsByKey),
    }),
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
  classes: {
    fromClassList: [
      { name: 'Sorcerer', source: 'PHB' },
      { name: 'Wizard', source: 'PHB' },
    ],
  },
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
  catalog.current = {}
  catalog.filtered = []
  catalog.lookups = {
    racesByKey: {},
    classesByKey: {},
    spellsByKey: buildSpellLookup([otherPrinting, shockingGrasp]),
  }
})
afterEach(cleanup)

test.each([
  'missing child',
  'other child printing',
  'missing parent',
  'resolved child',
  'raw fallback',
] as const)('%s retains native ownership while current managed knowledge independently suspends and restores', (availability) => {
  const fixture = makeManagedClassSpellFixtures()
  const child = { name: 'Child', source: 'HB', additionalSpells: [choiceBlock] } as Race5e
  const parent = { name: 'Parent', source: 'PHB', subraces: [child] } as Race5e
  let saved = savedChoice(parent, child)
  saved.classProgression = [{ name: 'Bard', source: 'PHB', levels: 1 }]
  const chosen = setManagedClassSpellChoiceCommand(
    saved,
    saved.provenance,
    {
      slot: [
        ['class', 'bard', 'phb'],
        'class-cantrip',
        'class-feature|spellcasting|bard|phb|1|phb',
        1,
        0,
      ],
      expected: null,
      expectedEmptyRevision: 0,
      target: { name: 'Light', source: 'PHB' },
      policy: 'default',
    },
    fixture.context,
  )
  saved = characterPersistenceSchema.parse({
    ...saved,
    ...chosen.characterPatch,
    provenance: chosen.provenanceUpdate,
  })
  const before = JSON.stringify(saved)
  const selectedRaces =
    availability === 'missing parent'
      ? []
      : availability === 'missing child'
        ? [{ ...parent, subraces: [] }]
        : availability === 'other child printing'
          ? [{ ...parent, subraces: [{ ...child, source: 'OTHER' }] }]
          : [parent]
  install(selectedRaces, availability === 'raw fallback' ? [] : selectedRaces)
  catalog.current = fixture.data
  catalog.lookups.classesByKey = fixture.lookups.classesByKey
  catalog.lookups.spellsByKey = {
    ...fixture.lookups.spellsByKey,
    ...buildSpellLookup([shockingGrasp, otherPrinting]),
  }
  const { result } = renderHook(() => useCharacterActions(saved))
  expect(result.current.some((row) => row.name === 'Light' && row.active)).toBe(true)
  expect(result.current.some((row) => row.name === 'Shocking Grasp' && row.active)).toBe(true)
  const primary = {
    ...fixture.lookups,
    spellsByKey: catalog.lookups.spellsByKey,
    racesByKey: buildRaceLookup(catalog.filtered),
  }
  const raw = { ...primary, racesByKey: catalog.lookups.racesByKey }
  const current = createCharacterCalculationContext(saved, primary, raw)
  expect(current.managedClassSpellStatuses[0].active).toBe(true)
  expect(
    createCharacterSheetViewModel(saved, raw, primary).spellRows.some(
      (row) => row.name === 'Light',
    ),
  ).toBe(true)
  const missing = {
    ...primary,
    spellsByKey: Object.fromEntries(
      Object.entries(primary.spellsByKey).filter(([, row]) => row.name !== 'Light'),
    ),
  }
  const dormant = createCharacterCalculationContext(saved, missing, raw)
  expect(dormant.managedClassSpellStatuses[0].active).toBe(false)
  expect(
    dormant.character.spells.spellProfiles.find((row) => row.type === 'racial')?.cantrips,
  ).toEqual(['Shocking Grasp|PHB'])
  expect(
    createCharacterSheetViewModel(saved, raw, missing).spellRows.some(
      (row) => row.name === 'Light',
    ),
  ).toBe(false)
  expect(
    createCharacterCalculationContext(saved, primary, raw).managedClassSpellStatuses[0].active,
  ).toBe(true)
  expect(JSON.stringify(saved)).toBe(before)
})

test.each([
  'level',
  'class',
] as const)('exact racial filter %s conflict is pending across shared calculation, readiness, Actions and immutable PDF', (field) => {
  const child: Race5e = { name: 'Child', source: 'HB', additionalSpells: [choiceBlock] }
  const parent: Race5e = { name: 'Parent', source: 'PHB', subraces: [child] }
  const character = savedChoice(parent, child)
  const before = structuredClone(character)
  install([parent])
  const exact =
    field === 'level'
      ? { ...shockingGrasp, level: 1 }
      : { ...shockingGrasp, classes: { fromClassList: [{ name: 'Druid', source: 'PHB' }] } }
  catalog.lookups.spellsByKey = buildSpellLookup([exact, otherPrinting])
  const calculation = createCharacterCalculationContext(character, catalog.lookups)
  expect(
    calculation.character.spells.spellProfiles.find((p) => p.type === 'racial')!.cantrips,
  ).toEqual([])
  const readiness = getCharacterReadiness(character, {
    calculation,
    spellsByKey: catalog.lookups.spellsByKey,
  })
  expect(readiness.blockingIssues).toContainEqual(
    expect.objectContaining({ section: 'spells', title: 'Finish Parent (Child) spell choices' }),
  )
  const { result } = renderHook(() => useCharacterActions(character))
  expect(
    result.current.some(
      (action) => action.source.kind === 'spell' && action.name === 'Shocking Grasp',
    ),
  ).toBe(false)
  const pdf = createCurrentCharacterSheetViewModel(character, catalog.lookups)
  expect(pdf.spellRows.some((row) => row.name.toLowerCase() === 'shocking grasp')).toBe(false)
  expect(
    pdf.actions.some(
      (action) => action.source.kind === 'spell' && action.name === 'Shocking Grasp',
    ),
  ).toBe(false)
  expect(character).toEqual(before)
})

function install(races: Race5e[], filtered = races) {
  catalog.filtered = filtered
  catalog.lookups = { ...catalog.lookups, racesByKey: buildRaceLookup(races) }
}

// Establish valid previous rules before the test installs missing or replacement metadata.
function savedChoice(parent: Race5e, child: Race5e): Character {
  const selection = deriveRaceSpellSelection(parent, child)
  const parentHasChoice = parseRaceSpellBlocks(selection.parentAdditionalSpells).some(
    (block) => block.choices.length,
  )
  const childHasChoice = parseRaceSpellBlocks(selection.subraceAdditionalSpells).some(
    (block) => block.choices.length,
  )
  const previousParent = parentHasChoice ? parent : { ...parent, additionalSpells: undefined }
  const previousChild =
    childHasChoice || parentHasChoice ? child : { ...child, additionalSpells: [choiceBlock] }
  let character = buildInitialCharacter(
    { initial: makeCharacterFixture(), race: previousParent, subrace: previousChild },
    new Map(),
    () => [],
  )
  const profile = character.spells.spellProfiles.find(
    (entry) => entry.type === 'racial' && entry.choices?.length,
  )!
  const selected = setRacialSpellChoice(
    character,
    character.provenance,
    profile.id,
    profile.choices![0].id,
    ['Shocking Grasp|PHB'],
    nativeRaceResolution(previousParent, previousChild),
    nativeChoiceSpellLookup,
  )
  character = { ...character, ...selected.characterPatch, provenance: selected.provenanceUpdate }
  const ability = setRacialCastingAbility(
    character,
    character.provenance,
    profile.id,
    'wis',
    nativeRaceResolution(previousParent, previousChild),
  )
  return { ...character, ...ability.characterPatch, provenance: ability.provenanceUpdate }
}

test('an unavailable exact subclass spell printing cannot fall back to a competing printing', () => {
  install([{ name: 'Parent', source: 'PHB' } as Race5e])
  catalog.lookups.classesByKey = buildClassLookup([
    {
      name: 'Cleric',
      source: 'PHB',
      subclasses: [
        {
          name: 'Light Domain',
          shortName: 'Light',
          source: 'PHB',
          className: 'Cleric',
          classSource: 'PHB',
          additionalSpells: [{ prepared: { 1: ['shocking grasp#c|PHB'] } }],
        },
      ],
    } as Class5e,
  ])
  catalog.lookups.spellsByKey = buildSpellLookup([otherPrinting])
  const character = makeCharacterFixture({
    race: 'Parent',
    raceSource: 'PHB',
    subrace: 'Missing',
    subraceSource: 'HB',
    classProgression: [
      { name: 'Cleric', source: 'PHB', levels: 1, subclass: 'Light Domain', subclassSource: 'PHB' },
    ],
  })
  character.spells.spellProfiles = character.spells.spellProfiles.filter(
    (profile) => profile.type === 'special',
  )
  expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
  const context = createCharacterCalculationContext(character, catalog.lookups)
  const direct = deriveSpellActions(character, catalog.lookups.spellsByKey, {
    classes: context.classes,
    raceResolution: context.raceResolution,
  })
  const { result } = renderHook(() => useCharacterActions(character))
  const pdf = createCurrentCharacterSheetViewModel(character, catalog.lookups)
  for (const actions of [direct, result.current, pdf.actions]) {
    expect(actions.some((action) => action.name === 'Shocking Grasp')).toBe(false)
  }
})

function assertSavedChoiceAcrossConsumers(character: Character, expectedProfileName: string) {
  const before = structuredClone(character)
  const { result: actionsResult } = renderHook(() => useCharacterActions(character))
  const context = createCharacterCalculationContext(
    character,
    { racesByKey: buildRaceLookup(catalog.filtered) },
    catalog.lookups,
  )
  const racial = ensureSpellProfiles(character, new Map(), undefined, {
    raceResolution: context.raceResolution,
  }).find((profile) => profile.type === 'racial')
  expect(racial?.raceName).toBe(expectedProfileName)
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
  const pdf = createCurrentCharacterSheetViewModel(character, catalog.lookups)
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
  assertSavedChoiceAcrossConsumers(savedChoice(parent, child), 'Draconic Sorcery')
})

test('a top-level child keeps its existing child-only source-qualified profile identity', () => {
  const parent = { name: 'Parent', source: 'PHB' } as Race5e
  const child = { name: 'Child', source: 'HB', additionalSpells: [choiceBlock] } as Race5e
  install([parent, child])
  assertSavedChoiceAcrossConsumers(savedChoice(parent, child), 'Child')
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
  assertSavedChoiceAcrossConsumers(savedChoice(parent, child), 'Parent')
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
  const character = savedChoice(parent, child)
  const before = structuredClone(character)
  const { result: actionsResult } = renderHook(() => useCharacterActions(character))
  const context = createCharacterCalculationContext(character, catalog.lookups)
  expect(
    ensureSpellProfiles(character, new Map(), undefined, {
      raceResolution: context.raceResolution,
    }).some((profile) => profile.type === 'racial'),
  ).toBe(false)
  expect(actionsResult.current.some((action) => action.source.kind === 'spell')).toBe(false)
  expect(
    createCurrentCharacterSheetViewModel(character, catalog.lookups).actions.some(
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
    createCurrentCharacterSheetViewModel(character, catalog.lookups).actions.filter(
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
  const character = savedChoice(parent, child)
  const currentChild = { ...child, source: 'HB' } as Race5e
  const currentParent = { ...parent, source: 'HB', subraces: [currentChild] } as Race5e
  install([parent, currentParent])
  const selected = { ...character, raceSource: 'HB', subraceSource: 'HB' }
  const { result } = renderHook(() => useCharacterActions(selected))
  expect(result.current.some((action) => action.name === 'Shocking Grasp')).toBe(false)
  expect(
    createCurrentCharacterSheetViewModel(selected, catalog.lookups).actions.some(
      (action) => action.name === 'Shocking Grasp',
    ),
  ).toBe(false)
})

test('unavailable class catalogs suspend saved fixed benefits while racial resolution stays independent', () => {
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
  expect(result.current).not.toContainEqual(expected)
  expect(
    createCurrentCharacterSheetViewModel(character, catalog.lookups).actions,
  ).not.toContainEqual(expected)
  expect(character).toEqual(before)
})

test('unavailable race data preserves the existing saved-profile projection fallback', () => {
  const character = savedChoice(
    { name: 'Parent', source: 'PHB' } as Race5e,
    { name: 'Child', source: 'PHB' } as Race5e,
  )
  const before = structuredClone(character)
  const expected = expect.objectContaining({
    name: 'Shocking Grasp',
    active: true,
    source: expect.objectContaining({ source: 'PHB' }),
  })
  const { result } = renderHook(() => useCharacterActions(character))
  expect(result.current).toContainEqual(expected)
  expect(createCurrentCharacterSheetViewModel(character, catalog.lookups).actions).toContainEqual(
    expected,
  )
  expect(character).toEqual(before)
})

test.each([
  'missing child',
  'other child printing',
] as const)('%s preserves the existing fallback when the saved child cannot resolve', (availability) => {
  const parent = { name: 'Parent', source: 'PHB' } as Race5e
  const child = { name: 'Child', source: 'HB' } as Race5e
  const character = savedChoice(parent, child)
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
  expect(createCurrentCharacterSheetViewModel(character, catalog.lookups).actions).toContainEqual(
    expected,
  )
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
  const character = savedChoice(parent, child)
  const parentSpell = { ...shockingGrasp, name: 'Parent Spell' }
  catalog.lookups.spellsByKey = buildSpellLookup([shockingGrasp, parentSpell])
  install([
    availability === 'missing child'
      ? parent
      : { ...parent, subraces: [{ ...child, source: 'PHB' }] },
  ])
  const before = structuredClone(character)
  const { result, rerender } = renderHook(() => useCharacterActions(character))
  const pdf = createCurrentCharacterSheetViewModel(character, catalog.lookups)
  const names = (actions: typeof result.current) =>
    actions.filter((action) => action.source.kind === 'spell').map((action) => action.name)
  expect(names(result.current)).toEqual(['Shocking Grasp'])
  expect(names(pdf.actions)).toEqual(['Shocking Grasp'])
  const resolution = resolveRaceReference(
    {
      name: character.race,
      source: character.raceSource,
      subraceName: character.subrace,
      subraceSource: character.subraceSource,
    },
    catalog.lookups,
  )
  expect(resolution.parentRace?.name).toBe(parent.name)
  expect(resolution.parentRace?.source).toBe(parent.source)
  expect(resolution.subraceData).toBeUndefined()
  expect(
    names(
      deriveSpellActions(character, catalog.lookups.spellsByKey, {
        classes: [{ name: 'Fighter', source: 'PHB' } as Class5e],
        race: parent,
        raceResolution: resolution,
      }),
    ),
  ).toEqual(['Shocking Grasp'])
  install([{ ...parent, subraces: [{ ...child, _isVersion: true, additionalSpells: [] }] }])
  rerender()
  expect(names(result.current)).toEqual([])
  expect(names(createCurrentCharacterSheetViewModel(character, catalog.lookups).actions)).toEqual(
    [],
  )
  expect(character).toEqual(before)
})
