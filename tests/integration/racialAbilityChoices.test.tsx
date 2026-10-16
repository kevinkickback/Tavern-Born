import { act, cleanup, render, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { INITIAL_CHARACTER_DATA } from '@/components/character/wizard/constants'
import { ReviewStep } from '@/components/character/wizard/steps/7-ReviewStep'
import { useRaceProvenanceMutations } from '@/hooks/character/useRaceProvenanceMutations'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { prepareCharacterDownload } from '@/lib/character/characterTransfer'
import { resolveProficiencyChoiceCommand } from '@/lib/character/commands/featCommands'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import {
  applyRaceAsiChoicesCommand,
  applyRaceAsiDistributionCommand,
} from '@/lib/character/commands/raceCommands'
import { getAbilityBonusRows } from '@/lib/provenance'
import { getSelectedRaceAbilityChoices } from '@/lib/provenance/raceOwnership'
import { setCollapseState } from '@/lib/storage/collapseState'
import { BuildAbilityScoresPage } from '@/pages/build/ability-scores/AbilityScoresPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import {
  importActiveCharacter,
  resetCharacterStore,
  setActiveCharacter,
} from '../fixtures/characterStoreFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'
import { races, selectRace } from '../fixtures/racialAbilityCharacter'

const [dhampir, halfElf, customLineage] = races

test.each([
  false,
  true,
])('Builder edits refreshed exact ability rules and Sources through Save/reopen (child: %s)', async (asChild) => {
  const old = {
    name: 'Refresh owner',
    source: 'PHB',
    ability: [{ choose: { from: ['str', 'dex'], amount: 2 } }],
  } as Race5e
  const next = { ...old, ability: [{ choose: { from: ['con', 'wis'], amount: 1, count: 1 } }] }
  const parent = { name: 'Parent', source: 'PHB', ability: [{ cha: 1 }] } as Race5e
  install(asChild ? [{ ...parent, subraces: [old] }] : [old])
  await importActiveCharacter(
    selectRace(asChild ? parent : old, 0, [['strength']], asChild ? old : undefined),
  )
  render(
    <MemoryRouter>
      <BuildAbilityScoresPage />
    </MemoryRouter>,
  )
  act(() => install(asChild ? [{ ...parent, subraces: [next] }] : [next]))
  await vi.waitFor(() => expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false))
  const snapshots: Character[] = []
  const unsubscribe = useCharacterStore.subscribe((state, previous) => {
    if (state.activeCharacter && state.activeCharacter !== previous.activeCharacter)
      snapshots.push(state.activeCharacter)
  })
  const user = userEvent.setup()
  await user.click(within(screen.getByTestId('race-ability-choices')).getByRole('combobox'))
  await user.click(screen.getByRole('option', { name: 'WIS' }))
  unsubscribe()
  await user.click(screen.getByRole('button', { name: /^Sources/ }))
  expect(screen.getByText('WIS +1')).toBeTruthy()
  expect(screen.queryByText('STR +2')).toBeNull()
  expect(snapshots).toHaveLength(1)
  expect(getSelectedRaceAbilityChoices(snapshots[0].provenance!, snapshots[0])).toMatchObject([
    {
      chooseCount: 1,
      amount: 1,
      optionPool: ['constitution', 'wisdom'],
      selected: ['wisdom'],
      status: 'resolved',
    },
  ])
  await act(async () => {
    await useCharacterStore.getState().saveActiveCharacter()
  })
  const reopened = characterPersistenceSchema.parse(
    JSON.parse(prepareCharacterDownload(useCharacterStore.getState().characters[0]).text),
  )
  act(() => {
    install([])
    setActiveCharacter(reopened)
  })
  expect(getAbilityBonusRows(reopened.provenance).map((row) => row.itemName)).toContain('WIS +1')
  expect(createCharacterCalculationContext(reopened, {}).abilityScores.racialBonuses).toEqual(
    asChild ? { charisma: 1, wisdom: 1 } : { wisdom: 1 },
  )
  const before = useCharacterStore.getState().activeCharacter
  act(() => install(asChild ? [{ ...parent, subraces: [next] }] : [next]))
  expect(useCharacterStore.getState().activeCharacter).toBe(before)
  expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
})

function install(races: Race5e[]) {
  const data = makeGameDataFixture({ races })
  data.lookups = buildGameDataLookups(data)
  useGameDataStore.setState({ gameData: data })
  return data
}

beforeEach(() => {
  resetCharacterStore()
  install(races)
  setCollapseState('sources:build-ability-scores', true)
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => undefined
  Element.prototype.releasePointerCapture = () => undefined
  Element.prototype.scrollIntoView = () => undefined
})

afterEach(cleanup)

test.each([
  false,
  true,
])('current export/import/edit/Save keeps native choice blocks associated (permuted: %s)', async (permuted) => {
  const finished = characterPersistenceSchema.parse(
    buildInitialCharacter(
      {
        initial: { name: 'Native choice import', originSystem: '2014', allowedSources: ['VRGR'] },
        race: dhampir,
        raceAsiBlockIndex: 0,
        raceAsiChoices: [['strength'], ['dexterity']],
      },
      new Map(),
      () => [],
    ),
  )
  const exported = JSON.parse(prepareCharacterDownload(finished).text) as Character
  if (permuted) exported.provenance!.choices.reverse()
  const before = structuredClone(exported)
  const [imported] = await useCharacterStore.getState().importCharacters([exported])
  expect(exported).toEqual(before)
  useCharacterStore.getState().setActiveCharacter(imported.id)
  const data = install(races)
  render(
    <MemoryRouter>
      <BuildAbilityScoresPage />
    </MemoryRouter>,
  )
  const user = userEvent.setup()
  await user.click(within(screen.getByTestId('race-ability-choices')).getAllByRole('combobox')[0])
  await user.click(screen.getByRole('option', { name: 'WIS' }))
  await act(async () => {
    await useCharacterStore.getState().saveActiveCharacter()
  })
  const reopened = characterPersistenceSchema.parse(
    JSON.parse(
      prepareCharacterDownload(
        useCharacterStore.getState().characters.find((character) => character.id === imported.id)!,
      ).text,
    ),
  )
  expect(reopened.raceAsiChoices).toEqual([['wisdom'], ['dexterity']])
  expect(
    getSelectedRaceAbilityChoices(reopened.provenance, reopened).map((record) => ({
      id: record.id,
      amount: record.amount,
      selected: record.selected,
    })),
  ).toEqual([
    { id: 'race:dhampir|vrgr:abilityBonuses:choose:0', amount: 2, selected: ['wisdom'] },
    { id: 'race:dhampir|vrgr:abilityBonuses:choose:1', amount: 1, selected: ['dexterity'] },
  ])
  expect(
    getAbilityBonusRows(reopened.provenance)
      .map((row) => row.itemName)
      .sort(),
  ).toEqual(['DEX +1', 'WIS +2'])
  for (const lookups of [data.lookups!, install([]).lookups!, data.lookups!])
    expect(
      createCharacterCalculationContext(reopened, lookups).abilityScores.racialBonuses,
    ).toEqual({ wisdom: 2, dexterity: 1 })
  expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
})

test.each([
  false,
  true,
])('fixed-only choice calls preserve the complete draft and save state (dirty: %s)', (dirty) => {
  const fixed = { name: 'Dwarf', source: 'PHB', ability: [{ con: 2 }] } as Race5e
  const character = characterPersistenceSchema.parse(
    buildInitialCharacter(
      {
        initial: { name: 'Fixed choices', originSystem: '2014' },
        race: fixed,
      },
      new Map(),
      () => [],
    ),
  )
  setActiveCharacter(character)
  useCharacterStore.setState({ isActiveCharacterDirty: dirty })
  const { result } = renderHook(useRaceProvenanceMutations)
  const before = useCharacterStore.getState()
  let notifications = 0
  const unsubscribe = useCharacterStore.subscribe(() => {
    notifications += 1
  })
  const command = applyRaceAsiChoicesCommand(character, character.provenance, [['wisdom']])
  expect(command.characterPatch).toEqual({})
  expect(command.provenanceUpdate).toBe(character.provenance)
  act(() => result.current.applyRaceAsiChoices([['wisdom']]))
  unsubscribe()
  expect(useCharacterStore.getState()).toBe(before)
  expect(notifications).toBe(0)
  expect(useCharacterStore.getState().activeCharacter).toBe(character)
  expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(dirty)
})

test.each([
  false,
  true,
])('2024 racial distribution edits leave the current draft unchanged (dirty: %s)', (dirty) => {
  const character = characterPersistenceSchema.parse(
    buildInitialCharacter(
      {
        initial: { name: 'Revised distribution', originSystem: '2024' },
        race: dhampir,
      },
      new Map(),
      () => [],
    ),
  )
  setActiveCharacter(character)
  useCharacterStore.setState({ isActiveCharacterDirty: dirty })
  const { result } = renderHook(useRaceProvenanceMutations)
  act(() => result.current.applyRaceAsiDistribution(dhampir, undefined, 1))
  expect.soft(useCharacterStore.getState().activeCharacter).toBe(character)
  expect.soft(useCharacterStore.getState().hasUnsavedChanges()).toBe(dirty)
  expect(
    createCharacterCalculationContext(character, install(races).lookups!).abilityScores
      .racialBonuses,
  ).toEqual({})
})

test('the ability page offers only explicit Custom Lineage slots and commits a valid selection with ownership', async () => {
  const character = selectRace(customLineage, 0, [])
  setActiveCharacter(character)
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <BuildAbilityScoresPage />
    </MemoryRouter>,
  )
  expect.soft(screen.queryByRole('group', { name: 'Racial bonus distribution' })).toBeNull()
  const section = screen.getByRole('heading', { name: 'Racial bonuses' }).closest('section')!
  expect.soft(within(section).getAllByRole('combobox')).toHaveLength(1)
  await user.click(within(section).getAllByRole('combobox')[0])
  await user.click(screen.getByRole('option', { name: 'WIS' }))
  const edited = useCharacterStore.getState().activeCharacter!
  expect(edited.raceAsiChoices).toEqual([['wisdom']])
  expect(getAbilityBonusRows(edited.provenance!).map((row) => row.itemName)).toEqual(['WIS +2'])
  act(() =>
    setActiveCharacter(characterPersistenceSchema.parse(JSON.parse(JSON.stringify(edited)))),
  )
  expect(within(section).getAllByRole('combobox')).toHaveLength(1)
})

test('wizard Review displays the same bounded mixed bonuses as Finish', () => {
  const selections = [['charisma', 'strength', 'strength', 'dexterity', 'constitution']]
  const finished = buildInitialCharacter(
    {
      initial: { name: 'ASI Review', originSystem: '2014' },
      race: halfElf,
      raceAsiChoices: selections,
    },
    new Map(),
    () => [],
  )
  expect(
    createCharacterCalculationContext(finished, install(races).lookups!).abilityScores
      .racialBonuses,
  ).toEqual({ charisma: 2, strength: 1, dexterity: 1 })
  render(
    <ReviewStep
      data={{
        ...INITIAL_CHARACTER_DATA,
        name: 'ASI Review',
        originSystem: '2014',
        race: halfElf.name,
        raceSource: halfElf.source,
        raceAsiChoices: selections,
      }}
      raceResolution={{
        parentRace: halfElf,
        subraceData: undefined,
        mergedRace: halfElf,
        subraceIsNested: false,
      }}
      sources={[]}
    />,
  )
  for (const [label, total, assignment] of [
    ['STR', '9', '8+1'],
    ['DEX', '9', '8+1'],
    ['CON', '8', null],
    ['INT', '8', null],
    ['WIS', '8', null],
    ['CHA', '10', '8+2'],
  ] as const) {
    const card = screen.getByText(label).parentElement!
    expect(within(card).getByText(total)).toBeTruthy()
    if (assignment) expect(within(card).getByText(assignment)).toBeTruthy()
    else expect(card.textContent).not.toContain('8+')
  }
})

test.each([
  [0, false],
  [0, true],
  [1, false],
  [1, true],
] as const)('repeated active distribution clicks retain the selection and save state (mode: %s, dirty: %s)', async (mode, dirty) => {
  const choices =
    mode === 0 ? [['strength'], ['dexterity']] : [['strength', 'dexterity', 'constitution']]
  const character = characterPersistenceSchema.parse(selectRace(dhampir, mode, choices))
  const sameMode = applyRaceAsiDistributionCommand(
    character,
    character.provenance!,
    dhampir,
    undefined,
    mode,
  )
  expect.soft(sameMode.characterPatch).toEqual({})
  expect.soft(sameMode.provenanceUpdate).toBe(character.provenance)
  setActiveCharacter(character)
  useCharacterStore.setState({ isActiveCharacterDirty: dirty })
  render(
    <MemoryRouter>
      <BuildAbilityScoresPage />
    </MemoryRouter>,
  )
  const activeButton = screen.getByRole('button', {
    name: mode === 0 ? '+2 / +1' : '+1 / +1 / +1',
  })
  const user = userEvent.setup()
  await user.click(activeButton)
  await user.click(activeButton)
  await user.keyboard('[Space]')
  expect.soft(useCharacterStore.getState().activeCharacter).toBe(character)
  expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(dirty)
})

test('Builder distribution changes publish only coherent choices and provenance', async () => {
  const character = selectRace(dhampir, 0, [['strength'], ['dexterity']])
  setActiveCharacter(character)
  render(
    <MemoryRouter>
      <BuildAbilityScoresPage />
    </MemoryRouter>,
  )
  const snapshots: Character[] = []
  const unsubscribe = useCharacterStore.subscribe((state, previous) => {
    if (state.activeCharacter && state.activeCharacter !== previous.activeCharacter)
      snapshots.push(structuredClone(state.activeCharacter))
  })
  try {
    await userEvent.setup().click(screen.getByRole('button', { name: '+1 / +1 / +1' }))
  } finally {
    unsubscribe()
  }
  expect(snapshots).toHaveLength(1)
  for (const snapshot of snapshots) {
    expect(snapshot.raceAsiBlockIndex).toBe(1)
    expect(snapshot.raceAsiChoices).toEqual([])
    expect(
      snapshot
        .provenance!.choices.filter((choice) => choice.domain === 'abilityBonuses')
        .map(({ chooseCount, selected, status }) => ({ chooseCount, selected, status })),
    ).toEqual([{ chooseCount: 3, selected: [], status: 'pending' }])
    expect(
      createCharacterCalculationContext(snapshot, install([]).lookups!).abilityScores.racialBonuses,
    ).toEqual({})
  }
})

test.each([
  'revised-origin',
  'missing-child',
] as const)('a rejected racial ability edit does not dirty the saved draft: %s', (reason) => {
  const child = { name: 'Child', source: 'HB' } as Race5e
  const selected = selectRace(dhampir, 0, [['strength'], ['dexterity']], child)
  if (reason === 'revised-origin')
    expect(
      characterPersistenceSchema.safeParse({ ...selected, originSystem: '2024' }).success,
    ).toBe(false)
  const character = characterPersistenceSchema.parse(
    reason === 'revised-origin'
      ? buildInitialCharacter(
          {
            initial: { name: 'Revised edit', originSystem: '2024' },
            race: dhampir,
            subrace: child,
          },
          new Map(),
          () => [],
        )
      : selected,
  )
  setActiveCharacter(character)
  useCharacterStore.setState({ isActiveCharacterDirty: false })
  const before = structuredClone(character)
  const { result } = renderHook(useRaceProvenanceMutations)
  act(() => {
    if (reason === 'revised-origin') result.current.applyRaceAsiChoices([['wisdom']])
    else result.current.applyRaceAsiDistribution(dhampir, undefined, 1)
  })
  expect.soft(useCharacterStore.getState().activeCharacter).toEqual(before)
  expect.soft(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
  expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
})

test.each([
  'parent',
  'child',
] as const)('missing exact %s metadata retains bonuses without exposing guessed choice controls, then restores editing', async (missing) => {
  const child = { name: 'Child', source: 'HB', ability: [{ con: 1 }] } as Race5e
  const parent = { ...dhampir, subraces: [child] }
  const character = characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify(selectRace(parent, 0, [['strength'], ['dexterity']], child))),
  )
  setActiveCharacter(character)
  useCharacterStore.setState({ isActiveCharacterDirty: false })
  install(missing === 'parent' ? [] : [{ ...parent, subraces: [{ ...child, source: 'OTHER' }] }])
  render(
    <MemoryRouter>
      <BuildAbilityScoresPage />
    </MemoryRouter>,
  )
  expect.soft(screen.queryByTestId('race-ability-choices')).toBeNull()
  expect.soft(useCharacterStore.getState().activeCharacter).toEqual(character)
  expect.soft(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
  expect(
    createCharacterCalculationContext(character, useGameDataStore.getState().gameData!.lookups!)
      .abilityScores.racialBonuses,
  ).toEqual({ strength: 2, dexterity: 1, constitution: 1 })
  act(() => install([parent]))
  expect(screen.getByTestId('race-ability-choices')).toBeTruthy()
  await userEvent.setup().click(screen.getByRole('button', { name: '+1 / +1 / +1' }))
  const edited = characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify(useCharacterStore.getState().activeCharacter)),
  )
  expect(edited.raceAsiBlockIndex).toBe(1)
  expect(edited.raceAsiChoices).toEqual([])
  expect(
    createCharacterCalculationContext(edited, useGameDataStore.getState().gameData!.lookups!)
      .abilityScores.racialBonuses,
  ).toEqual({ constitution: 1 })
})

test('Builder offers the flexible distribution owned by a complete version of an explicit parent', async () => {
  const [parent] = parseRaces({
    race: [
      {
        name: 'Parent',
        source: 'HB',
        lineage: true,
        ability: [{ dex: 2 }],
        _versions: [{ name: 'Flexible Version', source: 'HB', ability: null }],
      },
    ],
  }) as Race5e[]
  const child = parent.subraces![0] as Race5e
  install([parent])
  setActiveCharacter(characterPersistenceSchema.parse(selectRace(parent, 0, [], child)))
  render(
    <MemoryRouter>
      <BuildAbilityScoresPage />
    </MemoryRouter>,
  )
  await userEvent.setup().click(screen.getByRole('button', { name: '+1 / +1 / +1' }))
  const edited = characterPersistenceSchema.parse(useCharacterStore.getState().activeCharacter)
  expect(edited.raceAsiBlockIndex).toBe(1)
  expect(
    edited.provenance!.choices.filter((record) => record.domain === 'abilityBonuses'),
  ).toMatchObject([{ chooseCount: 3, amount: 1, sourceTag: { sourceType: 'subrace' } }])
})

test.each([
  0, 1,
] as const)('Builder distribution change from mode %s retains selected non-ability racial grants', async (mode) => {
  const child = {
    name: 'Chosen Child',
    source: 'HB',
    toolProficiencies: [{ choose: { from: ['Flute'], count: 1 } }],
  } as Race5e
  const [parent] = parseRaces({
    race: [
      {
        ...dhampir,
        skillProficiencies: [{ choose: { from: ['perception'], count: 1 } }],
        languageProficiencies: [{ anyStandard: 1 }],
        additionalSpells: [{ ability: 'int', known: { 1: ['light#c'] } }],
        subraces: [child],
      },
    ],
  }) as Race5e[]
  let character = selectRace(parent, mode, [], child)
  for (const [domain, name] of [
    ['skills', 'perception'],
    ['languages', 'Elvish'],
    ['tools', 'Flute'],
  ] as const) {
    const choice = character.provenance!.choices.find((entry) => entry.domain === domain)!
    const result = resolveProficiencyChoiceCommand(
      character,
      character.provenance!,
      domain,
      name,
      true,
      choice.id,
    )
    character = { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
  }
  const before = structuredClone(character)
  install([parent])
  setActiveCharacter(character)
  render(
    <MemoryRouter>
      <BuildAbilityScoresPage />
    </MemoryRouter>,
  )
  const snapshots: Character[] = []
  const unsubscribe = useCharacterStore.subscribe((state, previous) => {
    if (state.activeCharacter && state.activeCharacter !== previous.activeCharacter)
      snapshots.push(structuredClone(state.activeCharacter))
  })
  try {
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: mode === 0 ? '+1 / +1 / +1' : '+2 / +1' }))
  } finally {
    unsubscribe()
  }
  expect(snapshots).toHaveLength(1)
  const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(snapshots[0])))
  expect(reopened.proficiencies).toEqual(before.proficiencies)
  expect(reopened.spells).toEqual(before.spells)
  expect(reopened.provenance!.proficiencies).toEqual(before.provenance!.proficiencies)
  expect(reopened.provenance!.spells).toEqual(before.provenance!.spells)
  expect(
    reopened.provenance!.choices.filter((choice) => choice.domain !== 'abilityBonuses'),
  ).toEqual(before.provenance!.choices.filter((choice) => choice.domain !== 'abilityBonuses'))
  expect(reopened.raceAsiBlockIndex).toBe(mode === 0 ? 1 : 0)
  expect(reopened.raceAsiChoices).toEqual([])
  expect(character).toEqual(before)
})

test.each([
  'absent-race',
  'revised-origin',
])('ability edits cannot activate orphan choices: %s', (suppressed) => {
  const selected = selectRace(dhampir, 0, [])
  const orphan = {
    ...selected,
    ...(suppressed === 'absent-race'
      ? { race: '', raceSource: undefined }
      : { originSystem: '2024' }),
  }
  expect(characterPersistenceSchema.safeParse(orphan).success).toBe(false)
  const command = applyRaceAsiChoicesCommand(orphan as Character, orphan.provenance!, [
    ['strength'],
    ['dexterity'],
  ])
  expect(command.characterPatch).toEqual({})
  expect(command.provenanceUpdate).toBe(orphan.provenance)
  if (suppressed === 'absent-race') return
  const character = characterPersistenceSchema.parse(
    buildInitialCharacter(
      {
        initial: { name: 'Revised current choices', originSystem: '2024' },
        race: dhampir,
      },
      new Map(),
      () => [],
    ),
  )
  const before = structuredClone(character)
  setActiveCharacter(character)
  const { result } = renderHook(useRaceProvenanceMutations)
  act(() => result.current.applyRaceAsiChoices([['strength'], ['dexterity']]))
  expect(useCharacterStore.getState().activeCharacter!.provenance).toEqual(before.provenance)
  expect(useCharacterStore.getState().activeCharacter!.raceAsiChoices).toEqual(
    before.raceAsiChoices,
  )
})

test('the mutation hook restores parent choices when a missing version has a different literal printing suffix', () => {
  const [parent] = parseRaces({
    race: [
      {
        name: 'Parent',
        source: 'PHB',
        skillProficiencies: [{ choose: { from: ['perception'], count: 1 } }],
        _versions: [{ name: 'Child', source: 'HB|Version', skillProficiencies: [] }],
      },
    ],
    subrace: [{ name: 'Child', source: 'HB|Ordinary', raceName: 'Parent', raceSource: 'PHB' }],
  }) as Race5e[]
  const version = parent.subraces!.find((child) => child._isVersion === true)!
  const ordinary = parent.subraces!.find((child) => child._isVersion !== true)!
  const saved = characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify(
        buildInitialCharacter(
          { initial: { name: 'Exact hook', originSystem: '2014' }, race: parent, subrace: version },
          new Map(),
          () => [],
        ),
      ),
    ),
  )
  const refreshed = { ...parent, subraces: [ordinary] }
  install([refreshed])
  setActiveCharacter(saved)
  const { result } = renderHook(useRaceProvenanceMutations)
  act(() => result.current.applySubraceChange(refreshed, ordinary))
  const reopened = characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify(useCharacterStore.getState().activeCharacter)),
  )
  expect(reopened.subraceSource).toBe(ordinary.source)
  expect(reopened.provenance!.choices.filter((choice) => choice.domain === 'skills')).toMatchObject(
    [
      {
        sourceTag: { sourceType: 'race', sourceName: 'Parent', sourceRef: 'PHB' },
        selected: [],
        chooseCount: 1,
      },
    ],
  )
})
