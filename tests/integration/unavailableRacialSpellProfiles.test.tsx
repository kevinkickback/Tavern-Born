import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useCharacterActions } from '@/hooks/character/useCharacterActions'
import { useRaceProvenanceMutations } from '@/hooks/character/useRaceProvenanceMutations'
import { useSpellProfileMutations } from '@/hooks/character/useSpellProfileMutations'
import { useSpellSlots } from '@/hooks/character/useSpellSlots'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { buildPrerequisiteSnapshot } from '@/lib/calculations/prerequisites'
import { createCharacterSheetViewModel } from '@/lib/pdf/characterSheetViewModel'
import { makeSourceTag } from '@/lib/provenance'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e, Race5e } from '@/types/5etools'
import type { Character, SpellProfile } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import {
  makeClassFixture,
  makeGameDataFixture,
  makeSpellFixture,
} from '../fixtures/gameDataFixtures'

vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }))

const choiceBlock = {
  ability: { choose: ['int', 'wis', 'cha'] },
  known: { _: [{ choose: 'level=0|class=Sorcerer', count: 1 }] },
}
const child = { name: 'Child', source: 'HB', additionalSpells: [choiceBlock] } as Race5e
const parent = { name: 'Parent', source: 'PHB', subraces: [child] } as Race5e
const cleric = makeClassFixture({
  name: 'Cleric',
  classFeatures: [],
  spellcastingAbility: 'wis',
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
})
const shockingGrasp = makeSpellFixture({ name: 'Shocking Grasp', level: 0 })

function install(races: Race5e[], classes: Class5e[] = [cleric]) {
  const data = makeGameDataFixture({
    races,
    classes,
    spells: [
      shockingGrasp,
      { ...shockingGrasp, source: 'XPHB', time: [{ number: 1, unit: 'bonus' }] },
      makeSpellFixture({ name: 'Burning Hands' }),
      makeSpellFixture({ name: 'Flaming Sphere', level: 2 }),
    ],
    sources: ['PHB', 'HB', 'XPHB'].map((abbreviation) => ({
      abbreviation,
      name: abbreviation,
      group: 'Test',
    })),
  })
  data.lookups = buildGameDataLookups(data)
  useGameDataStore.setState({ gameData: data })
  return data
}

function savedCharacter(withChild = true): Character {
  const character = makeCharacterFixture({
    race: 'Parent',
    raceSource: withChild ? 'PHB' : 'HB',
    subrace: withChild ? 'Child' : undefined,
    subraceSource: withChild ? 'HB' : undefined,
    classProgression: [
      { name: 'Cleric', source: 'PHB', levels: 2, subclass: 'Light Domain', subclassSource: 'PHB' },
    ],
  })
  const racial: SpellProfile = {
    id: `racial:${withChild ? 'Child Parent' : 'Parent'}|HB`,
    type: 'racial',
    label: 'Racial Spells',
    raceName: withChild ? 'Child Parent' : 'Parent',
    raceSource: 'HB',
    castingAbility: 'wis',
    castingAbilityOptions: ['int', 'wis', 'cha'],
    cantrips: ['Shocking Grasp|PHB'],
    spellsKnown: [],
    preparedSpells: [],
    choices: [
      {
        id: 'direct-_-choose-0',
        count: 1,
        isCantrip: true,
        filter: { level: 0, classes: ['Sorcerer'] },
        selected: ['Shocking Grasp|PHB'],
      },
    ],
    alwaysPrepared: true,
  }
  character.spells.spellProfiles = [
    {
      id: 'class:Cleric|PHB',
      type: 'class',
      label: 'Cleric (Lv 2)',
      className: 'Cleric',
      classSource: 'PHB',
      cantrips: [],
      spellsKnown: [],
      preparedSpells: [],
      alwaysPrepared: false,
    },
    ...character.spells.spellProfiles.filter((profile) => profile.type === 'special'),
    racial,
  ]
  character.provenance!.spells['shocking grasp'] = [
    {
      ...makeSourceTag(
        withChild ? 'subrace' : 'race',
        withChild ? 'Child' : 'Parent',
        'choice',
        'HB',
      ),
      grantSource: 'PHB',
      grantVariant: 'direct-_-choose-0',
    },
  ]
  return character
}

function renderSpellEditing() {
  return renderHook(() => {
    const slots = useSpellSlots()
    return {
      slots,
      mutations: useSpellProfileMutations(slots.spellProfiles, slots.spellcastingDetailByProfileId),
      raceMutations: useRaceProvenanceMutations(),
    }
  })
}

function racialProfiles(profiles: SpellProfile[]) {
  return profiles.filter((profile) => profile.type === 'racial')
}

beforeEach(() => {
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})
afterEach(() => {
  cleanup()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})

test.each([
  'missing parent',
  'missing child',
  'other parent printing',
  'other child printing',
  'parent spell blocks',
  'parent without child selection',
] as const)('%s preserves racial setup through unrelated editing and reopen', (availability) => {
  const withChild = availability !== 'parent without child selection'
  const races =
    availability === 'missing parent' || !withChild
      ? []
      : availability === 'other parent printing'
        ? [{ ...parent, source: 'XPHB' }]
        : availability === 'other child printing'
          ? [{ ...parent, subraces: [{ ...child, source: 'PHB' }] }]
          : [
              {
                ...parent,
                subraces: [],
                ...(availability === 'parent spell blocks'
                  ? { additionalSpells: [{ known: { 1: ['parent spell#c'] } }] }
                  : {}),
              },
            ]
  const data = install(races)
  const character = savedCharacter(withChild)
  const savedRacial = structuredClone(racialProfiles(character.spells.spellProfiles))
  const before = structuredClone(character)
  setActiveCharacter(character)
  const { result } = renderSpellEditing()
  expect.soft(racialProfiles(result.current.slots.spellProfiles)).toEqual(savedRacial)
  expect(
    result.current.slots.spellProfiles.find((profile) => profile.id === 'class:Cleric|PHB')
      ?.spellsKnown,
  ).toContain('burning hands')
  const { result: actions } = renderHook(() => useCharacterActions(character))
  const savedSpell = expect.objectContaining({
    name: 'Shocking Grasp',
    active: true,
    source: expect.objectContaining({ source: 'PHB' }),
  })
  expect.soft(actions.current).toContainEqual(savedSpell)
  expect
    .soft(createCharacterSheetViewModel(character, data.lookups!).actions)
    .toContainEqual(savedSpell)
  expect(character).toEqual(before)

  act(() =>
    result.current.mutations.addSpellToProfile('special:unrestricted', 'Bonus|PHB', 'cantrip'),
  )
  const reopened = characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify(useCharacterStore.getState().activeCharacter)),
  )
  expect.soft(racialProfiles(reopened.spells.spellProfiles)).toEqual(savedRacial)
  expect(reopened.provenance!.spells['shocking grasp']).toEqual(
    character.provenance!.spells['shocking grasp'],
  )
  expect(reopened.provenance!.spells.bonus).toContainEqual(
    expect.objectContaining({ sourceType: 'manual' }),
  )
  act(() => setActiveCharacter(reopened))
  expect(racialProfiles(result.current.slots.spellProfiles)).toEqual(savedRacial)
})

test('raw fallback retains compatible racial choices while class level grants continue deriving', () => {
  install([parent])
  const character = { ...savedCharacter(), allowedSources: ['PHB'] }
  setActiveCharacter(character)
  const { result } = renderSpellEditing()
  expect(racialProfiles(result.current.slots.spellProfiles)).toContainEqual(
    expect.objectContaining({
      id: 'racial:Child Parent|HB',
      castingAbility: 'wis',
      choices: [expect.objectContaining({ selected: ['Shocking Grasp|PHB'] })],
    }),
  )
  act(() =>
    useCharacterStore.getState().updateCharacter(character.id, {
      classProgression: [{ ...character.classProgression[0], levels: 3 }],
    }),
  )
  expect(
    result.current.slots.spellProfiles.find((profile) => profile.id === 'class:Cleric|PHB')
      ?.spellsKnown,
  ).toContain('flaming sphere')
  expect(racialProfiles(result.current.slots.spellProfiles)[0]?.cantrips).toEqual([
    'Shocking Grasp|PHB',
  ])
})

test.each([
  null,
  [],
])('restored exact version metadata removing spells with %j cannot revive saved setup', (additionalSpells) => {
  install([])
  const character = savedCharacter()
  setActiveCharacter(character)
  const { result } = renderSpellEditing()
  expect.soft(racialProfiles(result.current.slots.spellProfiles)).toHaveLength(1)
  const race = (
    parseRaces({
      race: [
        {
          name: 'Parent',
          source: 'PHB',
          additionalSpells: [choiceBlock],
          _versions: [{ name: 'Parent; Child', source: 'HB', additionalSpells }],
        },
      ],
    }) as Race5e[]
  )[0]
  act(() => {
    install([race])
  })
  expect(racialProfiles(result.current.slots.spellProfiles)).toEqual([])
  act(() =>
    result.current.mutations.addSpellToProfile('special:unrestricted', 'Bonus|PHB', 'cantrip'),
  )
  const reopened = characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify(useCharacterStore.getState().activeCharacter)),
  )
  act(() => {
    setActiveCharacter(reopened)
    install([])
  })
  expect(racialProfiles(result.current.slots.spellProfiles)).toEqual([])
})

test('restored exact metadata replaces obsolete fixed spells and retains compatible choices', () => {
  install([])
  const character = savedCharacter()
  const saved = racialProfiles(character.spells.spellProfiles)[0]
  saved.fixedSpells = ['Old Spell|HB']
  saved.spellsKnown = ['Old Spell|HB']
  setActiveCharacter(character)
  const { result } = renderSpellEditing()
  expect.soft(racialProfiles(result.current.slots.spellProfiles)[0]).toEqual(saved)
  act(() => {
    install([parent])
  })
  const restored = racialProfiles(result.current.slots.spellProfiles)[0]
  expect(restored).toMatchObject({
    id: 'racial:Child Parent|HB',
    castingAbility: 'wis',
    cantrips: ['Shocking Grasp|PHB'],
    spellsKnown: [],
    choices: [expect.objectContaining({ selected: ['Shocking Grasp|PHB'] })],
  })
  expect(restored.fixedSpells).toBeUndefined()
})

test('clearing an unavailable selected child retracts racial ownership without reviving saved choices on return', () => {
  const bareParent = { ...parent, subraces: [] }
  install([bareParent])
  const character = savedCharacter()
  setActiveCharacter(character)
  const { result } = renderSpellEditing()
  expect.soft(racialProfiles(result.current.slots.spellProfiles)).toHaveLength(1)
  act(() => result.current.raceMutations.applySubraceChange(bareParent, undefined))
  const cleared = useCharacterStore.getState().activeCharacter!
  expect(cleared.subrace).toBeUndefined()
  expect(racialProfiles(cleared.spells.spellProfiles)).toEqual([])
  expect(cleared.provenance!.spells['shocking grasp']).toBeUndefined()
  expect(
    result.current.slots.spellProfiles.find((profile) => profile.id === 'class:Cleric|PHB')
      ?.spellsKnown,
  ).toContain('burning hands')
  act(() => {
    install([parent])
    result.current.raceMutations.applySubraceChange(parent, child)
  })
  const returned = racialProfiles(result.current.slots.spellProfiles)[0]
  expect(returned.cantrips).toEqual([])
  expect(returned.choices?.[0].selected).toEqual([])
})

test('unavailable independent class metadata preserves its saved fixed profile while racial removal resolves', () => {
  install([{ ...parent, subraces: [{ ...child, _isVersion: true, additionalSpells: [] }] }], [])
  const character = savedCharacter()
  const classProfile = character.spells.spellProfiles[0]
  classProfile.spellsKnown = ['Burning Hands|PHB']
  classProfile.fixedSpells = ['Burning Hands|PHB']
  classProfile.alwaysPreparedSpells = ['Burning Hands|PHB']
  setActiveCharacter(character)
  const { result } = renderSpellEditing()
  expect(
    result.current.slots.spellProfiles.find((profile) => profile.id === classProfile.id),
  ).toEqual(classProfile)
  expect(racialProfiles(result.current.slots.spellProfiles)).toEqual([])
})

test('metadata-free prerequisite projection retains selected racial spells without assigning them to an unselected race', () => {
  const character = savedCharacter()
  expect(buildPrerequisiteSnapshot({ character }).spells?.cantrips).toContain('Shocking Grasp|PHB')
  expect(
    buildPrerequisiteSnapshot({ character: { ...character, race: '', subrace: undefined } }).spells
      ?.cantrips,
  ).not.toContain('Shocking Grasp|PHB')
})

test('an unavailable catalog preserves the complete saved racial profile and slot usage through bonus editing', () => {
  const character = savedCharacter()
  const racial = racialProfiles(character.spells.spellProfiles)[0]
  racial.fixedSpells = ['Fixed Spell|HB']
  racial.spellsKnown = ['Fixed Spell|HB']
  racial.preparedSpells = ['Fixed Spell|HB']
  racial.alwaysPreparedSpells = ['Fixed Spell|HB']
  character.spells.spellSlots[1] = { max: 2, used: 1 }
  const before = structuredClone(character)
  setActiveCharacter(character)
  const { result } = renderSpellEditing()
  expect(racialProfiles(result.current.slots.spellProfiles)).toEqual([racial])
  act(() => result.current.mutations.setProfileSpells('special:unrestricted', ['Bonus|PHB'], []))
  const saved = useCharacterStore.getState().activeCharacter!
  expect(racialProfiles(saved.spells.spellProfiles)).toEqual([racial])
  expect(saved.spells.spellSlots).toEqual(before.spells.spellSlots)
  expect(saved.provenance!.spells['shocking grasp']).toEqual(
    before.provenance!.spells['shocking grasp'],
  )
  expect(character).toEqual(before)
})

test.each([
  'available',
  'missing',
] as const)('restored exact race data preserves a saved printing when the competing class target is %s', (targetAvailability) => {
  const competingCleric = {
    ...cleric,
    subclasses: [
      {
        ...cleric.subclasses![0],
        additionalSpells: [{ prepared: { 1: ['Shocking Grasp|XPHB#c'] } }],
      },
    ],
  }
  const installSelection = (races: Race5e[]) => {
    const data = install(races, [competingCleric])
    if (targetAvailability === 'missing') {
      data.spells = data.spells.filter((spell) => spell.source !== 'XPHB')
      data.lookups = buildGameDataLookups(data)
      useGameDataStore.setState({ gameData: { ...data } })
    }
    return data
  }
  installSelection([])
  const character = savedCharacter()
  const before = structuredClone(character)
  setActiveCharacter(character)
  const { result } = renderHook(() => useCharacterActions(character))
  const savedAction = expect.objectContaining({
    name: 'Shocking Grasp',
    kind: 'action',
    active: true,
    source: expect.objectContaining({ source: 'PHB' }),
  })
  expect(result.current).toContainEqual(savedAction)
  let restoredData = useGameDataStore.getState().gameData!
  act(() => {
    restoredData = installSelection([parent])
  })
  const pdf = createCharacterSheetViewModel(character, restoredData.lookups!)
  for (const actions of [result.current, pdf.actions]) {
    expect.soft(actions).toContainEqual(savedAction)
    const matching = actions.filter((action) => action.name === 'Shocking Grasp')
    expect.soft(matching).toHaveLength(targetAvailability === 'available' ? 2 : 1)
    if (targetAvailability === 'available')
      expect(actions).toContainEqual(
        expect.objectContaining({
          name: 'Shocking Grasp',
          kind: 'bonus-action',
          active: true,
          source: expect.objectContaining({ source: 'XPHB' }),
        }),
      )
  }
  expect(character).toEqual(before)
})

test('equivalent legacy and qualified references resolve to one action after exact race restoration', () => {
  const data = install([parent], [{ ...cleric, subclasses: [] }])
  data.spells = [shockingGrasp]
  data.lookups = buildGameDataLookups(data)
  useGameDataStore.setState({ gameData: { ...data } })
  const character = savedCharacter()
  character.classProgression = [{ name: 'Cleric', source: 'PHB', levels: 2 }]
  character.spells.spellProfiles[0].cantrips = ['Shocking Grasp', 'Shocking Grasp|PHB']
  setActiveCharacter(character)
  const { result } = renderHook(() => useCharacterActions(character))
  for (const actions of [
    result.current,
    createCharacterSheetViewModel(character, data.lookups!).actions,
  ]) {
    expect(actions.filter((action) => action.name === 'Shocking Grasp')).toEqual([
      expect.objectContaining({
        kind: 'action',
        active: true,
        source: expect.objectContaining({ source: 'PHB' }),
      }),
    ])
  }
})
