import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useSpellProfileMutations } from '@/hooks/character/useSpellProfileMutations'
import { useSpellProvenanceMutations } from '@/hooks/character/useSpellProvenanceMutations'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { getNativeExpandedSpellReferences } from '@/lib/calculations/nativeRacialSpells'
import { setManagedClassSpellChoicesCommand } from '@/lib/character/commands/managedClassSpellCommands'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { addSpellToCharacter } from '@/lib/character/commands/spellCommands'
import { SpellsPage } from '@/pages/spells/SpellsPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Race5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import {
  makeClassFixture,
  makeGameDataFixture,
  makeSpellFixture,
} from '../fixtures/gameDataFixtures'
import { makeManagedClassSpellFixtures } from '../fixtures/managedClassSpellFixtures'
import { makeNativeRacialCharacter, nativeRaceResolution } from '../fixtures/nativeRacialCharacter'

const managedFixture = makeManagedClassSpellFixtures()

beforeEach(() => {
  resetCharacterStore()
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => undefined
  Element.prototype.releasePointerCapture = () => undefined
  Element.prototype.scrollIntoView = () => undefined
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})

function install(races: Race5e[]) {
  const data = makeGameDataFixture({
    ...managedFixture.data,
    races,
    spells: [
      'thaumaturgy',
      'poison spray',
      'ray of sickness',
      'hold person',
      'chill touch',
      'false life',
      'ray of enfeeblement',
      'light',
      'mage hand',
    ]
      .map((name) =>
        makeSpellFixture({
          name,
          source: 'XPHB',
          level: ['ray of sickness', 'false life'].includes(name)
            ? 1
            : ['hold person', 'ray of enfeeblement'].includes(name)
              ? 2
              : 0,
          classes: { fromClassList: [{ name: 'Wizard', source: 'XPHB' }] },
        }),
      )
      .concat([
        makeSpellFixture({ name: 'Light', source: 'PHB', level: 0 }),
        makeSpellFixture({ name: 'Mage Hand', source: 'PHB', level: 0 }),
        ...managedFixture.spells.filter(
          (row) => ['Shield', 'Fireball'].includes(row.name) && row.source === 'PHB',
        ),
      ]),
    sources: ['PHB', 'XPHB'].map((abbreviation) => ({
      abbreviation,
      name: abbreviation,
      group: 'official',
    })),
  })
  data.lookups = buildGameDataLookups(data)
  useGameDataStore.setState({ gameData: data })
}
function page() {
  return render(
    <TooltipProvider>
      <MemoryRouter>
        <SpellsPage />
      </MemoryRouter>
    </TooltipProvider>,
  )
}
function reopened() {
  return characterPersistenceSchema.parse(
    JSON.parse(JSON.stringify(useCharacterStore.getState().activeCharacter)),
  )
}

test('a fixed Tiefling suite has rows without a status-only setup card, and opening or switching views preserves the clean character', () => {
  const race: Race5e = {
    name: 'Tiefling',
    source: 'PHB',
    additionalSpells: [{ ability: 'cha', innate: { 1: ['thaumaturgy#c'] } }],
  }
  install([race])
  setActiveCharacter(makeNativeRacialCharacter(race))
  useCharacterStore.setState({ isActiveCharacterDirty: false })
  const before = useCharacterStore.getState().activeCharacter
  const notify = vi.fn()
  const unsubscribe = useCharacterStore.subscribe(notify)
  page()
  for (const name of [/^Racial/, /^Bonus/, /^All/, /^Racial/])
    fireEvent.click(screen.getByRole('tab', { name }))
  expect(screen.queryByRole('region', { name: 'Tiefling spell setup' })).toBeNull()
  expect(screen.queryByText(/Granted spell suite/)).toBeNull()
  expect(screen.getAllByText(/thaumaturgy/i).length).toBeGreaterThan(0)
  expect(useCharacterStore.getState().activeCharacter).toBe(before)
  expect(useCharacterStore.getState().hasUnsavedChanges()).toBe(false)
  expect(notify).not.toHaveBeenCalled()
  unsubscribe()
})

test('actual revised Tiefling selects all four native members, replaces the suite, clears offline, and stays clear after reopen and restoration', async () => {
  const race = {
    name: 'Tiefling',
    source: 'XPHB',
    additionalSpells: [
      {
        name: 'Abyssal',
        ability: { choose: ['int', 'wis', 'cha'] },
        known: { 1: ['thaumaturgy|xphb#c', 'poison spray|xphb#c'] },
        innate: {
          3: { daily: { 1: ['ray of sickness|xphb'] } },
          5: { daily: { 1: ['hold person|xphb'] } },
        },
      },
      {
        name: 'Chthonic',
        ability: { choose: ['int', 'wis', 'cha'] },
        known: { 1: ['thaumaturgy|xphb#c', 'chill touch|xphb#c'] },
        innate: {
          3: { daily: { 1: ['false life|xphb'] } },
          5: { daily: { 1: ['ray of enfeeblement|xphb'] } },
        },
      },
    ],
  } as Race5e
  install([race])
  setActiveCharacter({
    ...makeNativeRacialCharacter(race, undefined, 5, '2024'),
    allowedSources: ['XPHB'],
  })
  page()
  const user = userEvent.setup()
  expect(screen.queryByRole('region', { name: 'Tiefling spell setup' })).toBeNull()
  await user.click(screen.getByRole('tab', { name: /^Racial/ }))
  const setup = within(screen.getByRole('region', { name: 'Tiefling spell setup' }))
  expect(reopened().provenance.spells).toEqual({})
  expect(screen.queryByText('Racial Spellcasting')).toBeNull()
  await user.click(setup.getByRole('combobox', { name: 'Tiefling spell suite' }))
  await user.click(screen.getByRole('option', { name: 'Abyssal' }))
  let character = reopened()
  expect(screen.getByText('Racial Spellcasting')).toBeTruthy()
  expect(character.spells.spellProfiles.find((profile) => profile.type === 'racial')).toMatchObject(
    {
      cantrips: ['thaumaturgy|xphb', 'poison spray|xphb'],
      spellsKnown: ['ray of sickness|xphb', 'hold person|xphb'],
    },
  )
  expect(Object.keys(character.provenance.spells)).toEqual([
    'thaumaturgy',
    'poison spray',
    'ray of sickness',
    'hold person',
  ])
  await user.click(setup.getByRole('combobox', { name: 'Tiefling spell suite' }))
  await user.click(screen.getByRole('option', { name: 'Chthonic' }))
  character = reopened()
  expect(Object.keys(character.provenance.spells)).toEqual([
    'thaumaturgy',
    'chill touch',
    'false life',
    'ray of enfeeblement',
  ])
  act(() => install([]))
  expect(
    (setup.getByRole('combobox', { name: 'Tiefling spell suite' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  expect(setup.getByText('Chthonic')).toBeTruthy()
  fireEvent.click(setup.getByRole('button', { name: 'Clear Tiefling spell suite' }))
  character = reopened()
  expect(character.provenance.spells).toEqual({})
  expect(screen.queryByText('Racial Spellcasting')).toBeNull()
  act(() => {
    setActiveCharacter(character)
    install([race])
  })
  expect(
    reopened().spells.spellProfiles.find((profile) => profile.type === 'racial')!.racial!.suite,
  ).toBeUndefined()
})

test('choose-only High Elf exposes Edit and Clear after its descriptor is full, and never offers mandatory suite Clear', async () => {
  const race = {
    name: 'Elf',
    source: 'XPHB',
    additionalSpells: [
      {
        name: 'High Elf',
        ability: { choose: ['int', 'wis', 'cha'] },
        known: { 1: { _: [{ choose: 'level=0|class=Wizard' }] } },
      },
    ],
  } as Race5e
  install([race])
  setActiveCharacter({
    ...makeNativeRacialCharacter(race, undefined, 1, '2024'),
    allowedSources: ['XPHB'],
  })
  page()
  fireEvent.click(screen.getByRole('tab', { name: /^Racial/ }))
  const setup = within(screen.getByRole('region', { name: 'Elf spell setup' }))
  const user = userEvent.setup()
  await user.click(setup.getByRole('combobox', { name: 'Elf casting ability' }))
  await user.click(screen.getByRole('option', { name: /wisdom/i }))
  expect(
    reopened().spells.spellProfiles.find((profile) => profile.type === 'racial')!.castingAbility,
  ).toBe('wis')
  expect(setup.queryByRole('button', { name: 'Clear Elf spell suite' })).toBeNull()
  fireEvent.click(setup.getByRole('button', { name: 'Edit Elf spell choice 1' }))
  let dialog = within(screen.getByRole('dialog'))
  await waitFor(() => expect(dialog.getByText('light')).toBeTruthy())
  fireEvent.click(dialog.getByText('light'))
  fireEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
  expect(
    reopened().spells.spellProfiles.find((profile) => profile.type === 'racial')!.cantrips,
  ).toEqual(['light|XPHB'])
  fireEvent.click(setup.getByRole('button', { name: 'Edit Elf spell choice 1' }))
  dialog = within(screen.getByRole('dialog'))
  fireEvent.click(dialog.getByRole('button', { name: /^lightCantrip/ }))
  fireEvent.click(dialog.getByText('mage hand'))
  fireEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
  expect(
    reopened().spells.spellProfiles.find((profile) => profile.type === 'racial')!.cantrips,
  ).toEqual(['mage hand|XPHB'])
  act(() => install([]))
  expect(
    (setup.getByRole('combobox', { name: 'Elf casting ability' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  expect(
    (setup.getByRole('button', { name: 'Edit Elf spell choice 1' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  fireEvent.click(setup.getByRole('button', { name: 'Clear Elf spell choice 1' }))
  const cleared = reopened()
  expect(cleared.provenance.spells).toEqual({})
  act(() => {
    setActiveCharacter(cleared)
    install([race])
  })
  expect(
    reopened().spells.spellProfiles.find((profile) => profile.type === 'racial')!.choices![0]
      .selected,
  ).toEqual([])
  const refreshed: Race5e = {
    ...race,
    additionalSpells: [{ ability: 'cha', known: { 1: [{ choose: 'level=1|class=Wizard' }] } }],
  }
  act(() => install([refreshed]))
  expect(setup.queryByRole('combobox', { name: 'Elf casting ability' })).toBeNull()
  expect(setup.getByText('Choice 1 · 0/1 spells')).toBeTruthy()
  expect(setup.getByRole('button', { name: 'Edit Elf spell choice 1' })).toBeTruthy()
  expect(
    reopened().spells.spellProfiles.find((profile) => profile.type === 'racial')!.castingAbility,
  ).toBe('cha')
}, 10_000)

test('actual class spell editing commits restored racial level grants together without changing slot usage', () => {
  const race = {
    name: 'Caster',
    source: 'PHB',
    additionalSpells: [{ known: { 1: ['light#c'], 5: ['darkness'] } }],
  } as Race5e
  const character = makeNativeRacialCharacter(race)
  character.classProgression = [{ name: 'Wizard', source: 'PHB', levels: 5 }]
  character.spells.spellProfiles = character.spells.spellProfiles.filter(
    (profile) => profile.type !== 'class',
  )
  character.spells.spellSlots[1] = { max: 4, used: 2 }
  install([race])
  setActiveCharacter(character)
  const { result } = renderHook(() => useSpellProvenanceMutations())
  act(() =>
    result.current.finishClassSpellChoices([
      {
        slot: [
          ['class', 'wizard', 'phb'],
          'class-spellbook',
          'class-feature|spellcasting|wizard|phb|1|phb',
          5,
          0,
        ],
        expected: null,
        expectedEmptyRevision: 0,
        target: { name: 'Fireball', source: 'PHB' },
        policy: 'default',
      },
    ]),
  )
  const saved = reopened()
  expect(
    saved.spells.spellProfiles.find((profile) => profile.type === 'racial')!.spellsKnown,
  ).toEqual(['darkness|PHB'])
  expect(saved.provenance.spells.darkness).toEqual([
    expect.objectContaining({ sourceType: 'race', sourceName: 'Caster', grantType: 'fixed' }),
  ])
  expect(
    saved.spells.spellProfiles.find((profile) => profile.type === 'class')!.spellsKnown,
  ).toEqual(['Fireball|PHB'])
  expect(saved.spells.spellSlots[1].used).toBe(2)
})

test('native prepared/rest grants apply while expanded targets only extend eligible class lists', () => {
  const race = {
    name: 'Structured caster',
    source: 'PHB',
    additionalSpells: [
      {
        ability: 'wis',
        prepared: { _: { daily: { '1e': ['disguise self|XPHB', 'hex|XPHB'] } } },
        known: { 1: { rest: { 1: ['animal friendship'] } } },
        expanded: { s1: ['healing word|XPHB'] },
      },
    ],
  } as Race5e
  const character = makeNativeRacialCharacter(race)
  expect(
    character.spells.spellProfiles.find((profile) => profile.type === 'racial')!.spellsKnown,
  ).toEqual(['animal friendship|PHB', 'disguise self|XPHB', 'hex|XPHB'])
  expect(character.provenance.spells['healing word']).toBeUndefined()
  expect(getNativeExpandedSpellReferences(character, nativeRaceResolution(race))).toEqual(
    new Set(['healing word|XPHB']),
  )
  expect(characterPersistenceSchema.safeParse(character).success).toBe(true)
})

test('removing an independently selected bonus copy commits without removing native ownership or materialization', () => {
  const race = {
    name: 'Caster',
    source: 'PHB',
    additionalSpells: [{ known: { 1: ['light#c'] } }],
  } as Race5e
  let character = makeNativeRacialCharacter(race)
  character.classProgression.push({ name: 'Wizard', source: 'PHB', levels: 1 })
  const classSpells = setManagedClassSpellChoicesCommand(
    character,
    character.provenance,
    [
      {
        slot: [
          ['class', 'wizard', 'phb'],
          'class-cantrip',
          'class-feature|spellcasting|wizard|phb|1|phb',
          1,
          0,
        ],
        expected: null,
        expectedEmptyRevision: 0,
        target: { name: 'Light', source: 'PHB' },
        policy: 'default',
      },
      {
        slot: [
          ['class', 'wizard', 'phb'],
          'class-spellbook',
          'class-feature|spellcasting|wizard|phb|1|phb',
          1,
          0,
        ],
        expected: null,
        expectedEmptyRevision: 0,
        target: { name: 'Shield', source: 'PHB' },
        policy: 'default',
        prepare: true,
      },
    ],
    { ...managedFixture.context, abilityScores: character.abilityScores },
  )
  character = {
    ...character,
    ...classSpells.characterPatch,
    provenance: classSpells.provenanceUpdate,
  }
  const bonus = addSpellToCharacter(
    character,
    character.provenance,
    'Light|PHB',
    'cantrip',
    'special:unrestricted',
  )
  character = { ...character, ...bonus.characterPatch, provenance: bonus.provenanceUpdate }
  install([race])
  setActiveCharacter(character)
  const { result } = renderHook(() =>
    useSpellProfileMutations(character.spells.spellProfiles, new Map()),
  )
  act(() => result.current.removeSpellFromProfile('special:unrestricted', 'Light|PHB', 'cantrip'))
  const saved = reopened()
  expect(
    saved.spells.spellProfiles.find((profile) => profile.type === 'special')!.cantrips,
  ).toEqual([])
  expect(saved.spells.spellProfiles.find((profile) => profile.type === 'racial')!.cantrips).toEqual(
    ['light|PHB'],
  )
  expect(
    saved.spells.spellProfiles.find((profile) => profile.id === 'class:Wizard|PHB'),
  ).toMatchObject({
    cantrips: ['Light|PHB'],
    spellsKnown: ['Shield|PHB'],
    preparedSpells: ['Shield|PHB'],
  })
  expect(saved.provenance.spells.light).toEqual([
    expect.objectContaining({
      sourceType: 'race',
      sourceName: 'Caster',
      grantType: 'fixed',
      grantSource: 'PHB',
    }),
    expect.objectContaining({
      sourceType: 'class',
      sourceName: 'Wizard',
      sourceRef: 'PHB',
      grantSource: 'PHB',
    }),
  ])
})

test.each([
  false,
  true,
])('the actual bonus picker rejects a known native target and attributes a new target with existing class ownership %s', (classOwned) => {
  const race: Race5e = {
    name: 'Caster',
    source: 'PHB',
    additionalSpells: [{ known: { 1: ['light#c'] } }],
  }
  install([race])
  let initial = classOwned
    ? buildInitialCharacter(
        {
          initial: { name: 'Native Wizard', originSystem: '2014' },
          race,
          classEntity: makeClassFixture({ spellcastingAbility: 'int' }),
          background: { name: 'Acolyte', source: 'PHB' },
        },
        new Map(),
        () => [],
      )
    : makeNativeRacialCharacter(race)
  if (classOwned) {
    const selected = setManagedClassSpellChoicesCommand(
      initial,
      initial.provenance,
      [
        {
          slot: [
            ['class', 'wizard', 'phb'],
            'class-cantrip',
            'class-feature|spellcasting|wizard|phb|1|phb',
            1,
            0,
          ],
          expected: null,
          expectedEmptyRevision: 0,
          target: { name: 'Light', source: 'PHB' },
          policy: 'default',
        },
      ],
      managedFixture.context,
    )
    initial = { ...initial, ...selected.characterPatch, provenance: selected.provenanceUpdate }
  }
  expect(characterPersistenceSchema.safeParse(initial).success).toBe(true)
  setActiveCharacter(initial)
  page()
  fireEvent.click(screen.getByRole('button', { name: 'Add Spell' }))
  let dialog = within(screen.getByRole('dialog'))
  fireEvent.click(dialog.getByRole('switch', { name: 'Hide already-known spells' }))
  fireEvent.change(dialog.getByRole('textbox', { name: 'Search add bonus spells' }), {
    target: { value: 'Light' },
  })
  fireEvent.click(dialog.getByText('Light'))
  fireEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
  let character = reopened()
  expect(
    character.spells.spellProfiles.find((profile) => profile.type === 'special')!.cantrips,
  ).toEqual([])
  expect(character.provenance.spells.light).not.toContainEqual(
    expect.objectContaining({ sourceType: 'manual' }),
  )
  expect(character.provenance.spells.light).toContainEqual(
    expect.objectContaining({ sourceType: 'race', grantSource: 'PHB' }),
  )
  if (classOwned) {
    expect(character.provenance.spells.light).toContainEqual(
      expect.objectContaining({ sourceType: 'class', sourceName: 'Wizard', grantSource: 'PHB' }),
    )
    expect(
      character.spells.spellProfiles.find((profile) => profile.id === 'class:Wizard|PHB')!.cantrips,
    ).toEqual(['Light|PHB'])
  }
  fireEvent.click(screen.getByRole('button', { name: 'Add Spell' }))
  dialog = within(screen.getByRole('dialog'))
  fireEvent.change(dialog.getByRole('textbox', { name: 'Search add bonus spells' }), {
    target: { value: 'Mage Hand' },
  })
  fireEvent.click(dialog.getByText('Mage Hand'))
  fireEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
  character = reopened()
  expect(
    character.spells.spellProfiles.find((profile) => profile.type === 'special')!.cantrips,
  ).toEqual(['Mage Hand|PHB'])
  expect(character.provenance.spells['mage hand']).toEqual([
    expect.objectContaining({ sourceType: 'manual', grantSource: 'PHB' }),
  ])
}, 10_000)
