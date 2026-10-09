import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useCharacterActions } from '@/hooks/character/useCharacterActions'
import { resolveRaceReference } from '@/lib/5etools/entityResolvers'
import { buildClassLookup, buildRaceLookup, buildSpellLookup } from '@/lib/5etools/lookups'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { deriveSpellActions } from '@/lib/calculations/actions'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { ensureSpellProfiles } from '@/lib/calculations/spellProfiles'
import { applyLevelUp } from '@/lib/character/commands/classCommands'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import type { Class5e, Race5e, Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const catalog = vi.hoisted(() => ({
  filtered: [] as Race5e[],
  lookups: {
    racesByKey: {} as Record<string, Race5e>,
    classesByKey: {} as Record<string, Class5e>,
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
    classesByKey: {},
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

test.each([
  'missing child',
  'other child printing',
  'missing parent',
  'resolved child',
  'raw fallback',
] as const)('%s keeps available class level-up grants alongside the saved racial choice', (availability) => {
  const child = { name: 'Child', source: 'HB', additionalSpells: [choiceBlock] } as Race5e
  const parent = {
    name: 'Parent',
    source: 'PHB',
    additionalSpells:
      availability === 'resolved child' || availability === 'raw fallback'
        ? undefined
        : [{ known: { 1: ['parent spell#c'] } }],
  } as Race5e
  const cleric = {
    name: 'Cleric',
    source: 'PHB',
    hd: { number: 1, faces: 8 },
    spellcastingAbility: 'wis',
    casterProgression: 'full',
    preparedSpells: '<$level$> + <$wis_mod$>',
    subclasses: [
      {
        name: 'Light Domain',
        shortName: 'Light',
        source: 'PHB',
        className: 'Cleric',
        classSource: 'PHB',
        additionalSpells: [{ prepared: { 1: ['burning hands'], 3: ['flaming sphere'] } }],
      },
    ],
  } as Class5e
  const races =
    availability === 'missing parent'
      ? []
      : [
          availability === 'other child printing'
            ? { ...parent, subraces: [{ ...child, source: 'PHB' }] }
            : availability === 'resolved child' || availability === 'raw fallback'
              ? { ...parent, subraces: [child] }
              : parent,
        ]
  install(races, availability === 'raw fallback' ? [] : races)
  catalog.lookups.classesByKey = buildClassLookup([cleric])
  catalog.lookups.spellsByKey = buildSpellLookup([
    shockingGrasp,
    { ...shockingGrasp, name: 'Parent Spell' },
    { ...shockingGrasp, name: 'Burning Hands', level: 1 },
    { ...shockingGrasp, name: 'Flaming Sphere', level: 2 },
  ])
  const previous = savedChoice(parent, child, 'Child Parent')
  previous.classProgression = [
    { name: 'Cleric', source: 'PHB', levels: 2, subclass: 'Light Domain', subclassSource: 'PHB' },
  ]
  previous.spells.spellProfiles = previous.spells.spellProfiles.map((profile) =>
    profile.type === 'class'
      ? {
          ...profile,
          id: 'class:Cleric|PHB',
          className: 'Cleric',
          classSource: 'PHB',
          label: 'Cleric (Lv 2)',
          spellsKnown: ['burning hands'],
          fixedSpells: ['burning hands'],
          alwaysPreparedSpells: ['burning hands'],
        }
      : profile,
  )
  expect(characterPersistenceSchema.safeParse(previous).success).toBe(true)
  const levelUp = applyLevelUp(
    previous,
    previous.provenance,
    [{ ...previous.classProgression[0], levels: 3 }],
    {
      className: 'Cleric',
      classSource: 'PHB',
      classLevel: 3,
      hitDie: 8,
      dieResult: 5,
      method: 'average',
    },
    createCharacterCalculationContext(previous, catalog.lookups, catalog.lookups),
  )
  const character = {
    ...previous,
    ...levelUp.characterPatch,
    provenance: levelUp.provenanceUpdate,
  }
  expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
  const before = structuredClone(character)
  const { result } = renderHook(() => useCharacterActions(character))
  const pdf = createCharacterSheetViewModel(character, catalog.lookups)
  const expected = expect.objectContaining({ name: 'Flaming Sphere', active: true })
  expect(result.current).toContainEqual(expected)
  expect(pdf.actions).toContainEqual(expected)
  const savedSpell = expect.objectContaining({
    name: 'Shocking Grasp',
    active: true,
    source: expect.objectContaining({ source: 'PHB' }),
  })
  expect(result.current).toContainEqual(savedSpell)
  expect(pdf.actions).toContainEqual(savedSpell)
  if (availability !== 'resolved child' && availability !== 'raw fallback') {
    expect(result.current.some((action) => action.name === 'Parent Spell')).toBe(false)
    expect(pdf.actions.some((action) => action.name === 'Parent Spell')).toBe(false)
  }
  expect(character).toEqual(before)
})

test.each([
  'missing class',
  'other class printing',
  'missing subclass',
  'other subclass printing',
] as const)('%s preserves its saved fixed spells when an independent class resolves', (availability) => {
  const parent = {
    name: 'Parent',
    source: 'PHB',
    additionalSpells: [{ known: { 1: ['parent spell#c'] } }],
  } as Race5e
  const child = { name: 'Child', source: 'HB' } as Race5e
  install([parent])
  const cleric = {
    name: 'Cleric',
    source: availability === 'other class printing' ? 'XPHB' : 'PHB',
    spellcastingAbility: 'wis',
    casterProgression: 'full',
    subclasses:
      availability === 'other subclass printing'
        ? [{ name: 'Light Domain', source: 'XPHB', className: 'Cleric', classSource: 'PHB' }]
        : [],
  } as Class5e
  catalog.lookups.classesByKey = buildClassLookup([
    { name: 'Fighter', source: 'PHB' } as Class5e,
    ...(availability === 'missing class' ? [] : [cleric]),
  ])
  catalog.lookups.spellsByKey = buildSpellLookup([
    shockingGrasp,
    { ...shockingGrasp, name: 'Burning Hands', level: 1 },
    { ...shockingGrasp, name: 'Parent Spell' },
  ])
  const character = savedChoice(parent, child, 'Child Parent')
  character.classProgression = [
    { name: 'Cleric', source: 'PHB', levels: 2, subclass: 'Light Domain', subclassSource: 'PHB' },
    { name: 'Fighter', source: 'PHB', levels: 1 },
  ]
  character.abilityScores = { ...character.abilityScores, strength: 13, wisdom: 13 }
  character.spells.spellProfiles.push({
    id: 'class:Cleric|PHB',
    type: 'class',
    label: 'Cleric (Lv 2)',
    className: 'Cleric',
    classSource: 'PHB',
    cantrips: [],
    spellsKnown: ['Burning Hands|PHB'],
    fixedSpells: ['Burning Hands|PHB'],
    alwaysPreparedSpells: ['Burning Hands|PHB'],
    preparedSpells: [],
    alwaysPrepared: false,
  })
  expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
  const before = structuredClone(character)
  const { result } = renderHook(() => useCharacterActions(character))
  const pdf = createCharacterSheetViewModel(character, catalog.lookups)
  for (const actions of [result.current, pdf.actions]) {
    expect(actions).toContainEqual(expect.objectContaining({ name: 'Burning Hands', active: true }))
    expect(actions).toContainEqual(
      expect.objectContaining({
        name: 'Shocking Grasp',
        active: true,
        source: expect.objectContaining({ source: 'PHB' }),
      }),
    )
    expect(actions.some((action) => action.name === 'Parent Spell')).toBe(false)
  }
  expect(character).toEqual(before)
})

test.each([
  'prepared',
  'known',
  'innate',
] as const)('%s subclass grants retain exact spell printings alongside an unavailable child', (mode) => {
  const parent = { name: 'Parent', source: 'PHB' } as Race5e
  const child = { name: 'Child', source: 'HB' } as Race5e
  install([parent])
  const grants = { 1: ['shocking grasp#c|PHB'], 3: ['burning hands|XPHB'] }
  catalog.lookups.classesByKey = buildClassLookup([
    {
      name: 'Cleric',
      source: 'PHB',
      spellcastingAbility: 'wis',
      casterProgression: 'full',
      preparedSpells: '<$level$> + <$wis_mod$>',
      subclasses: [
        {
          name: 'Light Domain',
          shortName: 'Light',
          source: 'PHB',
          className: 'Cleric',
          classSource: 'PHB',
          additionalSpells: [
            mode === 'innate'
              ? { innate: { 1: { daily: { '1': grants[1] } }, 3: { daily: { '1': grants[3] } } } }
              : { [mode]: grants },
          ],
        },
      ],
    } as Class5e,
  ])
  catalog.lookups.spellsByKey = buildSpellLookup([
    otherPrinting,
    shockingGrasp,
    { ...shockingGrasp, name: 'Burning Hands', level: 2, entries: ['Original rules.'] },
    { ...otherPrinting, name: 'Burning Hands', level: 2, entries: ['Revised rules.'] },
  ])
  const character = savedChoice(parent, child, 'Child Parent')
  character.classProgression = [
    { name: 'Cleric', source: 'PHB', levels: 3, subclass: 'Light Domain', subclassSource: 'PHB' },
  ]
  character.spells.spellProfiles = character.spells.spellProfiles.filter(
    (profile) => profile.type !== 'racial',
  )
  character.spells.spellProfiles[0] = {
    id: 'class:Cleric|PHB',
    type: 'class',
    label: 'Cleric (Lv 2)',
    className: 'Cleric',
    classSource: 'PHB',
    cantrips: ['Shocking Grasp|PHB'],
    spellsKnown: [],
    fixedSpells: ['Shocking Grasp|PHB'],
    preparedSpells: mode === 'known' ? ['Burning Hands|XPHB'] : [],
    alwaysPrepared: false,
  }
  expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
  const before = structuredClone(character)
  const context = createCharacterCalculationContext(character, catalog.lookups)
  const direct = deriveSpellActions(character, catalog.lookups.spellsByKey, {
    classes: context.classes,
    raceResolution: context.raceResolution,
  })
  const { result } = renderHook(() => useCharacterActions(character))
  const pdf = createCharacterSheetViewModel(character, catalog.lookups)
  for (const actions of [direct, result.current, pdf.actions]) {
    expect(actions).toContainEqual(
      expect.objectContaining({
        name: 'Shocking Grasp',
        kind: 'action',
        source: expect.objectContaining({ source: 'PHB' }),
        active: true,
      }),
    )
    expect(actions).toContainEqual(
      expect.objectContaining({
        name: 'Burning Hands',
        kind: 'bonus-action',
        source: expect.objectContaining({ source: 'XPHB' }),
        description: 'Revised rules.',
        active: true,
      }),
    )
  }
  expect(character).toEqual(before)
})

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
  const pdf = createCharacterSheetViewModel(character, catalog.lookups)
  for (const actions of [direct, result.current, pdf.actions]) {
    expect(actions.some((action) => action.name === 'Shocking Grasp')).toBe(false)
  }
})

test.each([
  'class',
  'racial',
  'special',
  'unqualified special alias',
  'legacy fixed',
] as const)('a derived subclass printing respects %s identity and preparation', (owner) => {
  const parent = { name: 'Parent', source: 'PHB' } as Race5e
  const child = { name: 'Child', source: 'HB' } as Race5e
  install([parent])
  catalog.lookups.classesByKey = buildClassLookup([
    {
      name: 'Cleric',
      source: 'PHB',
      spellcastingAbility: 'wis',
      casterProgression: 'full',
      preparedSpells: '<$level$> + <$wis_mod$>',
      subclasses: [
        {
          name: 'Light Domain',
          shortName: 'Light',
          source: 'PHB',
          className: 'Cleric',
          classSource: 'PHB',
          additionalSpells: [
            {
              prepared: {
                3: [
                  owner === 'unqualified special alias'
                    ? 'burning hands|PHB'
                    : 'burning hands|XPHB',
                ],
              },
            },
          ],
        },
      ],
    } as Class5e,
  ])
  catalog.lookups.spellsByKey = buildSpellLookup([
    { ...shockingGrasp, name: 'Burning Hands', level: 1 },
    { ...otherPrinting, name: 'Burning Hands', level: 1 },
  ])
  const character = savedChoice(parent, child, 'Child Parent')
  character.classProgression = [
    { name: 'Cleric', source: 'PHB', levels: 3, subclass: 'Light Domain', subclassSource: 'PHB' },
  ]
  const classProfile = character.spells.spellProfiles[0]
  Object.assign(classProfile, {
    id: 'class:Cleric|PHB',
    className: 'Cleric',
    classSource: 'PHB',
    spellsKnown: owner === 'class' ? ['Burning Hands|PHB'] : [],
  })
  const savedType =
    owner === 'unqualified special alias' ? 'special' : owner === 'legacy fixed' ? 'class' : owner
  const savedProfile = character.spells.spellProfiles.find((profile) => profile.type === savedType)
  if (!savedProfile) throw new Error('Missing fixture profile')
  savedProfile.cantrips = []
  savedProfile.spellsKnown = [
    owner === 'unqualified special alias' ? 'Burning Hands' : 'Burning Hands|PHB',
  ]
  if (owner === 'legacy fixed') savedProfile.fixedSpells = ['Burning Hands']
  savedProfile.choices = undefined
  expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
  const before = structuredClone(character)
  const context = createCharacterCalculationContext(character, catalog.lookups)
  const direct = deriveSpellActions(character, catalog.lookups.spellsByKey, {
    classes: context.classes,
    raceResolution: context.raceResolution,
  })
  const { result } = renderHook(() => useCharacterActions(character))
  const pdf = createCharacterSheetViewModel(character, catalog.lookups)
  for (const actions of [direct, result.current, pdf.actions]) {
    const expected =
      owner === 'unqualified special alias'
        ? [{ source: 'PHB', active: true }]
        : owner === 'legacy fixed'
          ? [{ source: 'XPHB', active: true }]
          : [
              { source: 'PHB', active: owner !== 'class' },
              { source: 'XPHB', active: true },
            ]
    expect(
      actions
        .filter((action) => action.name === 'Burning Hands')
        .map((action) => ({ source: action.source.source, active: action.active }))
        .sort((left, right) => (left.source ?? '').localeCompare(right.source ?? '')),
    ).toEqual(expected)
  }
  if (owner === 'class') {
    catalog.lookups.spellsByKey = buildSpellLookup([
      { ...shockingGrasp, name: 'Burning Hands', level: 1 },
    ])
    const missingTarget = deriveSpellActions(character, catalog.lookups.spellsByKey, {
      classes: context.classes,
      raceResolution: context.raceResolution,
    })
    expect(missingTarget).toContainEqual(
      expect.objectContaining({
        name: 'Burning Hands',
        source: expect.objectContaining({ source: 'PHB' }),
        active: false,
      }),
    )
    expect(missingTarget.filter((action) => action.name === 'Burning Hands')).toHaveLength(1)
  }
  expect(character).toEqual(before)
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
  const { result: actionsResult } = renderHook(() => useCharacterActions(character))
  const context = createCharacterCalculationContext(character, catalog.lookups)
  expect(
    ensureSpellProfiles(character, new Map(), undefined, {
      raceResolution: context.raceResolution,
    }).some((profile) => profile.type === 'racial'),
  ).toBe(false)
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
  expect(names(createCharacterSheetViewModel(character, catalog.lookups).actions)).toEqual([])
  expect(character).toEqual(before)
})
