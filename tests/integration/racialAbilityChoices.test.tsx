import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { INITIAL_CHARACTER_DATA } from '@/components/character/wizard/constants'
import { ReviewStep } from '@/components/character/wizard/steps/7-ReviewStep'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseRaces } from '@/lib/5etools/parsers/races'
import { buildRacialBonuses, getRaceAbilityData } from '@/lib/calculations/abilityScores'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { normalizeRaceSelectionForOriginSystem } from '@/lib/calculations/originSystem'
import { getAsiDisplay } from '@/lib/calculations/raceUtils'
import { resolveProficiencyChoiceCommand } from '@/lib/character/commands/featCommands'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import {
  applyRaceAsiChoicesCommand,
  applyRaceAsiDistributionCommand,
  applyRaceSelectionCommand,
  applySubraceSelectionCommand,
} from '@/lib/character/commands/raceCommands'
import {
  applyRaceGrants,
  emptyProvenance,
  getAbilityBonusRows,
  makeSourceTag,
} from '@/lib/provenance'
import { setCollapseState } from '@/lib/storage/collapseState'
import { BuildAbilityScoresPage } from '@/pages/build/ability-scores/AbilityScoresPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeGameDataFixture } from '../fixtures/gameDataFixtures'

const races = parseRaces({
  race: [
    { name: 'Dhampir', source: 'VRGR', lineage: 'VRGR' },
    {
      name: 'Half-Elf',
      source: 'PHB',
      ability: [
        { cha: 2, choose: { from: ['str', 'dex', 'con', 'int', 'wis'], count: 2, amount: 1 } },
      ],
    },
    {
      name: 'Custom Lineage',
      source: 'TCE',
      lineage: true,
      ability: [{ choose: { from: ['str', 'dex', 'con', 'int', 'wis', 'cha'], amount: 2 } }],
      _versions: [{ name: 'Custom Lineage; Darkvision', source: 'TCE' }],
    },
  ],
}) as Race5e[]
const [dhampir, halfElf, customLineage] = races

function selectRace(race: Race5e, mode: 0 | 1, choices: string[][], subrace?: Race5e) {
  const initial = makeCharacterFixture({
    race: '',
    raceSource: '',
    background: '',
    backgroundSource: undefined,
  })
  const selected = applyRaceSelectionCommand(
    initial,
    emptyProvenance(),
    race,
    subrace,
    mode,
    () => [],
  )
  const chosen = applyRaceAsiChoicesCommand(selected.provenanceUpdate, choices)
  return {
    ...initial,
    ...selected.characterPatch,
    ...chosen.characterPatch,
    provenance: chosen.provenanceUpdate,
  }
}

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
  0, 1,
] as const)('Dhampir mode %s has the same choice shape through selection, calculation and current-format reopen', (mode) => {
  const choices =
    mode === 0 ? [['strength'], ['dexterity']] : [['strength', 'dexterity', 'constitution']]
  const expected =
    mode === 0 ? { strength: 2, dexterity: 1 } : { strength: 1, dexterity: 1, constitution: 1 }
  const character = selectRace(dhampir, mode, choices)
  const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(character)))
  const calculation = createCharacterCalculationContext(reopened, install(races).lookups!)
  expect(calculation.abilityScores.racialBonuses).toEqual(expected)
  const records = reopened.provenance!.choices.filter(
    (choice) => choice.domain === 'abilityBonuses',
  )
  expect
    .soft(
      records.map(({ chooseCount, amount, selected, status }) => ({
        chooseCount,
        amount,
        selected,
        status,
      })),
    )
    .toEqual(
      mode === 0
        ? [
            { chooseCount: 1, amount: 2, selected: ['strength'], status: 'resolved' },
            { chooseCount: 1, amount: 1, selected: ['dexterity'], status: 'resolved' },
          ]
        : [
            {
              chooseCount: 3,
              amount: 1,
              selected: ['strength', 'dexterity', 'constitution'],
              status: 'resolved',
            },
          ],
    )
  expect.soft(getAbilityBonusRows(reopened.provenance!).filter((row) => row.isPending)).toEqual([])
  expect(reopened.raceAsiChoices).toEqual(choices)
})

test('Half-Elf keeps fixed Charisma alongside its two chosen abilities', () => {
  const character = selectRace(halfElf, 0, [['strength', 'dexterity']])
  const calculation = createCharacterCalculationContext(character, install(races).lookups!)
  expect
    .soft(calculation.abilityScores.racialBonuses)
    .toEqual({ charisma: 2, strength: 1, dexterity: 1 })
  expect(getAbilityBonusRows(character.provenance!).map((row) => row.itemName)).toEqual([
    'CHA +2',
    'STR +1',
    'DEX +1',
  ])
})

test.each([
  0, 1,
] as const)('Custom Lineage explicit +2 is independent of synthesized distribution mode %s', (mode) => {
  const character = selectRace(customLineage, mode, [['wisdom']])
  const calculation = createCharacterCalculationContext(character, install(races).lookups!)
  expect
    .soft(
      calculation.abilityScores.raceAsiData.choices.map(({ count, amount }) => ({ count, amount })),
    )
    .toEqual([{ count: 1, amount: 2 }])
  expect.soft(calculation.abilityScores.racialBonuses).toEqual({ wisdom: 2 })
  expect.soft(getAsiDisplay(customLineage, mode)).toEqual(['Choose 1: +2 (any ability)'])
  expect
    .soft(getAbilityBonusRows(character.provenance!).map((row) => row.itemName))
    .toEqual(['WIS +2'])
})

test('a complete version applies its explicit ability rule once with child ownership', () => {
  const child = customLineage.subraces![0]
  const character = selectRace(customLineage, 1, [['wisdom']], child)
  const calculation = createCharacterCalculationContext(character, install(races).lookups!)
  expect(calculation.abilityScores.racialBonuses).toEqual({ wisdom: 2 })
  expect(calculation.abilityScores.raceAsiData.choices).toEqual([
    {
      count: 1,
      amount: 2,
      from: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
      source: 'subrace',
    },
  ])
  const records = character.provenance!.choices.filter(
    (choice) => choice.domain === 'abilityBonuses',
  )
  expect(records).toEqual([
    expect.objectContaining({
      chooseCount: 1,
      amount: 2,
      selected: ['wisdom'],
      status: 'resolved',
      sourceTag: expect.objectContaining({
        sourceType: 'subrace',
        sourceName: child.name,
        sourceRef: child.source,
      }),
    }),
  ])
})

test('ordinary additive child choices follow parent flexible choices in UI and ownership order', () => {
  const parent = { name: 'Flexible Parent', source: 'VRGR', lineage: 'VRGR' } as Race5e
  const child = {
    name: 'Child',
    source: 'HB',
    ability: [{ choose: { from: ['int'], amount: 1 } }],
  } as Race5e
  const character = selectRace(parent, 0, [['strength'], ['dexterity'], ['intelligence']], child)
  const normalized = normalizeRaceSelectionForOriginSystem(parent, child, '2014')
  const data = getRaceAbilityData(normalized.race, normalized.subrace)
  expect
    .soft(buildRacialBonuses(data, character.raceAsiChoices!))
    .toEqual({ strength: 2, dexterity: 1, intelligence: 1 })
  expect.soft(data.choices.map((choice) => choice.source)).toEqual(['race', 'race', 'subrace'])
  expect(
    character
      .provenance!.choices.filter((choice) => choice.domain === 'abilityBonuses')
      .map((choice) => ({
        amount: choice.amount,
        selected: choice.selected,
        owner: choice.sourceTag.sourceType,
      })),
  ).toEqual([
    { amount: 2, selected: ['strength'], owner: 'race' },
    { amount: 1, selected: ['dexterity'], owner: 'race' },
    { amount: 1, selected: ['intelligence'], owner: 'subrace' },
  ])
})

test('an explicit child overwrite excludes parent ability rules and preserves other printing and manual owners', () => {
  const parent = {
    name: 'Parent',
    source: 'PHB',
    ability: [{ dex: 2, choose: { from: ['str'], count: 1, amount: 1 } }],
  } as Race5e
  const child = {
    name: 'Child',
    source: 'HB',
    ability: [{ int: 2 }],
    overwrite: { ability: true },
  } as Race5e
  const ledger = emptyProvenance()
  ledger.abilityBonuses = [
    { ability: 'dexterity', value: 2, sourceTag: makeSourceTag('race', 'Parent', 'fixed', 'PHB') },
    { ability: 'wisdom', value: 1, sourceTag: makeSourceTag('race', 'Parent', 'fixed', 'XPHB') },
    { ability: 'charisma', value: 1, sourceTag: makeSourceTag('manual', 'Manual', 'fixed') },
  ]
  const before = structuredClone(ledger)
  const data = getRaceAbilityData(parent, child)
  expect.soft(buildRacialBonuses(data, [['strength']])).toEqual({ intelligence: 2 })
  const result = applyRaceGrants(parent, child, ledger)
  expect.soft(result.abilityBonuses).toEqual([
    before.abilityBonuses[1],
    before.abilityBonuses[2],
    expect.objectContaining({
      ability: 'intelligence',
      value: 2,
      sourceTag: expect.objectContaining({ sourceType: 'subrace', sourceRef: 'HB' }),
    }),
  ])
  expect(result.choices.filter((choice) => choice.domain === 'abilityBonuses')).toEqual([])
  expect(ledger).toEqual(before)
})

test('multiple supported entry choices keep distinct per-owner ordinals', () => {
  const parent = {
    name: 'Parent',
    source: 'PHB',
    ability: [{ choose: { from: ['str'], amount: 2 } }, { choose: { from: ['dex'], amount: 1 } }],
  } as Race5e
  const character = selectRace(parent, 0, [['strength'], ['dexterity']])
  expect(
    character
      .provenance!.choices.filter((choice) => choice.domain === 'abilityBonuses')
      .map((choice) => ({
        id: choice.id,
        amount: choice.amount,
        selected: choice.selected,
        status: choice.status,
      })),
  ).toEqual([
    {
      id: 'race:parent:abilityBonuses:choose:0',
      amount: 2,
      selected: ['strength'],
      status: 'resolved',
    },
    {
      id: 'race:parent:abilityBonuses:choose:1',
      amount: 1,
      selected: ['dexterity'],
      status: 'resolved',
    },
  ])
})

test('duplicate, out-of-pool and excess choices grant the same bounded bonuses in calculation and provenance', () => {
  const selections = [['strength', 'strength', 'invalid', 'dexterity', 'constitution', 'wisdom']]
  const character = selectRace(dhampir, 1, selections)
  expect(buildRacialBonuses(getRaceAbilityData(dhampir, undefined, 1), selections)).toEqual({
    strength: 1,
    dexterity: 1,
    constitution: 1,
  })
  expect(getAbilityBonusRows(character.provenance!).map((row) => row.itemName)).toEqual([
    'STR +1',
    'DEX +1',
    'CON +1',
  ])
})

test.each(races)('revised origin suppresses racial ability grants for $name', (race) => {
  const normalized = normalizeRaceSelectionForOriginSystem(race, undefined, '2024')
  expect(getRaceAbilityData(normalized.race)).toEqual({ fixed: [], choices: [] })
  const ledger = applyRaceGrants(normalized.race!, undefined, emptyProvenance())
  expect(ledger.abilityBonuses).toEqual([])
  expect(ledger.choices.filter((choice) => choice.domain === 'abilityBonuses')).toEqual([])
})

test('current-format saved choices and bonuses survive unavailable exact race data', () => {
  const character = selectRace(dhampir, 0, [['strength'], ['dexterity']])
  const before = structuredClone(character)
  const calculation = createCharacterCalculationContext(character, install([]).lookups!)
  expect(calculation.abilityScores.racialBonuses).toEqual({ strength: 2, dexterity: 1 })
  expect(
    characterPersistenceSchema.parse(JSON.parse(JSON.stringify(character))).raceAsiChoices,
  ).toEqual([['strength'], ['dexterity']])
  expect(character).toEqual(before)
})

test('unknown ability payloads do not become grants or throw', () => {
  expect(
    getRaceAbilityData({
      ability: [
        null,
        [],
        { choose: 'invalid' },
        { choose: { count: -1, from: ['str'] } },
        { choose: { weighted: { from: ['str', 'dex'], weights: [2, 1] } } },
      ],
    } as never),
  ).toEqual({ fixed: [], choices: [] })
})

test('unavailable bonuses respect current source owners and revised-origin suppression', () => {
  const character = selectRace(dhampir, 0, [['strength'], ['dexterity']])
  character.provenance!.abilityBonuses.push(
    { ability: 'wisdom', value: 2, sourceTag: makeSourceTag('race', 'Dhampir', 'fixed', 'OTHER') },
    { ability: 'charisma', value: 1, sourceTag: makeSourceTag('manual', 'Manual', 'fixed') },
  )
  const missing = install([]).lookups!
  expect(createCharacterCalculationContext(character, missing).abilityScores.racialBonuses).toEqual(
    { strength: 2, dexterity: 1 },
  )
  expect(
    createCharacterCalculationContext({ ...character, originSystem: '2024' }, missing).abilityScores
      .racialBonuses,
  ).toEqual({})
})

test('missing exact child preserves its saved bonuses and a resolved empty overwrite removes them', () => {
  const parent = { name: 'Parent', source: 'PHB', ability: [{ dex: 2 }] } as Race5e
  const child = { name: 'Child', source: 'HB', ability: [{ int: 1 }] } as Race5e
  const character = selectRace(parent, 0, [], child)
  const before = structuredClone(character)
  expect(
    createCharacterCalculationContext(character, install([parent]).lookups!).abilityScores
      .racialBonuses,
  ).toEqual({ dexterity: 2, intelligence: 1 })
  const emptyChild = { ...child, ability: [], overwrite: { ability: true } }
  expect(
    createCharacterCalculationContext(
      character,
      install([{ ...parent, subraces: [emptyChild] }]).lookups!,
    ).abilityScores.racialBonuses,
  ).toEqual({})
  expect(character).toEqual(before)
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

test('ordinary child changes clear saved parent choices and their ownership together', () => {
  const child = { name: 'Child', source: 'HB', ability: [{ con: 1 }] } as Race5e
  const parent = { ...halfElf, subraces: [child] }
  const initial = buildInitialCharacter(
    {
      initial: { name: 'ASI Review', originSystem: '2014' },
      race: parent,
      raceAsiChoices: [['strength', 'dexterity']],
    },
    new Map(),
    () => [],
  )
  const before = structuredClone(initial)
  const result = applySubraceSelectionCommand(initial, initial.provenance!, parent, child, () => [])
  const reopened = characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify({ ...initial, ...result.characterPatch, provenance: result.provenanceUpdate }),
    ),
  )
  expect(reopened.raceAsiChoices).toEqual([])
  expect(
    reopened
      .provenance!.choices.filter((choice) => choice.domain === 'abilityBonuses')
      .map(({ selected, status }) => ({ selected, status })),
  ).toEqual([{ selected: [], status: 'pending' }])
  for (const data of [[parent], []]) {
    expect(
      createCharacterCalculationContext(reopened, install(data).lookups!).abilityScores
        .racialBonuses,
    ).toEqual({ charisma: 2, constitution: 1 })
  }
  expect(initial).toEqual(before)
})

test.each([
  false,
  true,
])('leaving ordinary ability overwrite restores exact parent ownership; next additive child %s', (addChild) => {
  const oldChild = {
    name: 'Overwrite',
    source: 'HB',
    ability: [{ int: 1 }],
    overwrite: { ability: true },
  } as Race5e
  const nextChild = { name: 'Additive', source: 'HB', ability: [{ con: 1 }] } as Race5e
  const parent = {
    name: 'Parent',
    source: 'PHB',
    ability: [{ dex: 2 }],
    subraces: [oldChild, nextChild],
  } as Race5e
  const initial = buildInitialCharacter(
    { initial: { name: 'ASI Review', originSystem: '2014' }, race: parent, subrace: oldChild },
    new Map(),
    () => [],
  )
  initial.provenance!.abilityBonuses.push(
    { ability: 'wisdom', value: 1, sourceTag: makeSourceTag('race', 'Parent', 'fixed', 'OTHER') },
    { ability: 'charisma', value: 1, sourceTag: makeSourceTag('manual', 'Manual', 'fixed') },
  )
  const before = structuredClone(initial)
  const result = applySubraceSelectionCommand(
    initial,
    initial.provenance!,
    parent,
    addChild ? nextChild : undefined,
    () => [],
  )
  const reopened = characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify({ ...initial, ...result.characterPatch, provenance: result.provenanceUpdate }),
    ),
  )
  const expected = addChild ? { dexterity: 2, constitution: 1 } : { dexterity: 2 }
  for (const data of [[parent], []])
    expect(
      createCharacterCalculationContext(reopened, install(data).lookups!).abilityScores
        .racialBonuses,
    ).toEqual(expected)
  expect(reopened.provenance!.abilityBonuses).toEqual([
    before.provenance!.abilityBonuses[1],
    before.provenance!.abilityBonuses[2],
    expect.objectContaining({
      ability: 'dexterity',
      value: 2,
      sourceTag: expect.objectContaining({
        sourceType: 'race',
        sourceName: 'Parent',
        sourceRef: 'PHB',
      }),
    }),
    ...(addChild
      ? [
          expect.objectContaining({
            ability: 'constitution',
            value: 1,
            sourceTag: expect.objectContaining({ sourceType: 'subrace', sourceName: 'Additive' }),
          }),
        ]
      : []),
  ])
  expect(initial).toEqual(before)
})

test.each([
  0, 1,
] as const)('a complete flexible version owns valid synthesized bonuses in mode %s', (mode) => {
  const [parent] = parseRaces({
    race: [
      {
        name: 'Dhampir',
        source: 'VRGR',
        lineage: 'VRGR',
        _versions: [{ name: 'Dhampir; Version', source: 'VRGR' }],
      },
    ],
  }) as Race5e[]
  const child = parent.subraces![0]
  const selections =
    mode === 0 ? [['strength'], ['dexterity']] : [['strength', 'dexterity', 'constitution']]
  const character = buildInitialCharacter(
    {
      initial: { name: 'ASI Review', originSystem: '2014' },
      race: parent,
      subrace: child,
      raceAsiBlockIndex: mode,
      raceAsiChoices: selections,
    },
    new Map(),
    () => [],
  )
  const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(character)))
  const expected =
    mode === 0 ? { strength: 2, dexterity: 1 } : { strength: 1, dexterity: 1, constitution: 1 }
  for (const data of [[parent], []])
    expect(
      createCharacterCalculationContext(reopened, install(data).lookups!).abilityScores
        .racialBonuses,
    ).toEqual(expected)
  expect(
    reopened
      .provenance!.choices.filter((choice) => choice.domain === 'abilityBonuses')
      .map((choice) => choice.sourceTag),
  ).toEqual(
    selections.map(() =>
      expect.objectContaining({
        sourceType: 'subrace',
        sourceName: child.name,
        sourceRef: child.source,
      }),
    ),
  )
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
  0, 1,
] as const)('Builder distribution change from mode %s retains selected non-ability racial grants', async (mode) => {
  const child = {
    name: 'Chosen Child',
    source: 'HB',
    toolProficiencies: [{ choose: { from: ['Flute'], count: 1 } }],
  } as Race5e
  const parent = {
    ...dhampir,
    skillProficiencies: [{ choose: { from: ['perception'], count: 1 } }],
    languageProficiencies: [{ anyStandard: 1 }],
    additionalSpells: [{ ability: 'int', known: { 1: ['light#c'] } }],
    subraces: [child],
  } as Race5e
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
  { dex: 1.5 },
  { choose: { from: ['str'], amount: 1.5 } },
])('fractional ability metadata is ignored while integer bonuses remain usable: %j', (invalid) => {
  const race = { name: 'Malformed', source: 'HB', ability: [{ wis: 2 }, invalid] } as Race5e
  const character = selectRace(race, 0, [['strength']])
  expect(getRaceAbilityData(race)).toEqual({
    fixed: [{ ability: 'wisdom', value: 2, source: 'race' }],
    choices: [],
  })
  expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
  expect(
    createCharacterCalculationContext(character, install([race]).lookups!).abilityScores
      .racialBonuses,
  ).toEqual({ wisdom: 2 })
})

test.each([
  undefined,
  false,
])('ordinary child without an explicit ability overwrite (%s) retains parent bonuses', (overwrite) => {
  const parent = { name: 'Parent', source: 'PHB', ability: [{ dex: 2 }] } as Race5e
  const child = {
    name: 'Child',
    source: 'HB',
    ability: [{ int: 1 }],
    overwrite: { ability: overwrite },
  } as Race5e
  const character = selectRace(parent, 0, [], child)
  expect(
    createCharacterCalculationContext(
      character,
      install([{ ...parent, subraces: [child] }]).lookups!,
    ).abilityScores.racialBonuses,
  ).toEqual({ dexterity: 2, intelligence: 1 })
  expect(getAbilityBonusRows(character.provenance!).map((row) => row.itemName)).toEqual([
    'DEX +2',
    'INT +1',
  ])
})

test.each([
  'other-printing',
  'missing-child',
])('ability distribution preserves the saved selection when exact metadata is unavailable: %s', (unavailable) => {
  const child = { name: 'Child', source: 'HB' } as Race5e
  const character = selectRace(dhampir, 0, [['strength'], ['dexterity']], child)
  const before = structuredClone(character)
  const result = applyRaceAsiDistributionCommand(
    character,
    character.provenance!,
    unavailable === 'other-printing' ? { ...dhampir, source: 'OTHER' } : dhampir,
    unavailable === 'missing-child' ? undefined : child,
    1,
  )
  expect(result.characterPatch).toEqual({})
  expect(result.provenanceUpdate).toBe(character.provenance)
  expect(character).toEqual(before)
})
