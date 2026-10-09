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
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useSpellProfileMutations } from '@/hooks/character/useSpellProfileMutations'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import {
  addSpellToCharacter,
  setClassSpellSelectionsAtLevel,
  setRacialSpellChoice,
} from '@/lib/character/commands/spellCommands'
import { BuildClassModals } from '@/pages/build/class/components/Modals'
import { SpellsPage } from '@/pages/spells/SpellsPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Race5e, Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import {
  makeClassFixture,
  makeGameDataFixture,
  makeSpellFixture,
} from '../fixtures/gameDataFixtures'

function commit(character: Character, result: ReturnType<typeof setRacialSpellChoice>): Character {
  return characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  }) as Character
}

function spell(name: string, source: string, level = 0): Spell5e {
  return makeSpellFixture({
    name,
    source,
    level,
    school: 'A',
    classes: { fromClassList: [{ name: 'Wizard', source: 'PHB' }] },
  })
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute('data-selection-scroll-container') ? 600 : 160
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useGameDataStore.setState({ gameData: null })
  useCharacterStore.setState({ characters: [], activeCharacter: null, activeCharacterId: null })
})

test('the racial page selects another enabled printing while retaining independent ownership and logical choice uniqueness', async () => {
  const race = {
    name: 'Caster',
    source: 'PHB',
    additionalSpells: [{ known: { _: [{ choose: 'level=0|class=Wizard', count: 2 }] } }],
  } as Race5e
  let character = buildInitialCharacter(
    {
      initial: { name: 'Exact picker', originSystem: '2014', allowedSources: ['PHB', 'TCE'] },
      race,
    },
    new Map(),
    () => [],
  )
  character = commit(
    character,
    addSpellToCharacter(
      character,
      character.provenance,
      'Light|PHB',
      'cantrip',
      'special:unrestricted',
      { sourceType: 'manual', sourceName: 'User Choice' },
    ),
  )
  const gameData = makeGameDataFixture({
    races: [race],
    classes: [],
    spells: [spell('Light', 'PHB'), spell('Light', 'TCE'), spell('Mage Hand', 'PHB')],
    sources: ['PHB', 'TCE'].map((abbreviation) => ({
      abbreviation,
      name: abbreviation,
      group: 'official',
    })),
  })
  gameData.lookups = buildGameDataLookups(gameData)
  useGameDataStore.setState({ gameData })
  useCharacterStore.setState({
    characters: [character],
    activeCharacter: character,
    activeCharacterId: character.id,
  })
  render(
    <TooltipProvider>
      <MemoryRouter>
        <SpellsPage />
      </MemoryRouter>
    </TooltipProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Choose Spell' }))
  const dialog = within(screen.getByRole('dialog'))
  await waitFor(() => expect(dialog.getAllByText('Light')).toHaveLength(1))
  expect(dialog.getByText('Light').closest('button')!.disabled).toBe(false)
  expect(dialog.getByText('TCE')).toBeTruthy()
  fireEvent.click(dialog.getByRole('switch', { name: 'Hide already-known spells' }))
  await waitFor(() => expect(dialog.getAllByText('Light')).toHaveLength(2))
  const lights = dialog.getAllByText('Light')
  expect(lights[0].closest('button')!.disabled).toBe(true)
  fireEvent.click(lights[1])
  expect(lights[0].closest('button')!.disabled).toBe(true)
  fireEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
  const saved = characterPersistenceSchema.parse(
    useCharacterStore.getState().activeCharacter,
  ) as Character
  expect(saved.spells.spellProfiles.find((profile) => profile.type === 'racial')!.cantrips).toEqual(
    ['Light|TCE'],
  )
  expect(
    saved.spells.spellProfiles.find((profile) => profile.type === 'special')!.cantrips,
  ).toEqual(['Light|PHB'])
  expect(saved.provenance.spells.light).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sourceType: 'manual', grantSource: 'PHB' }),
      expect.objectContaining({ sourceType: 'race', grantSource: 'TCE' }),
    ]),
  )
})

function classProps(
  character: Character,
  spells: Spell5e[],
): ComponentProps<typeof BuildClassModals> {
  return {
    character,
    classes: [],
    classPickerOpen: false,
    classPickerSearch: '',
    onClassPickerOpenChange: vi.fn(),
    onClassPickerSearchChange: vi.fn(),
    onClassSelect: vi.fn(),
    spellPickerLevel: 1,
    onSpellPickerLevelChange: vi.fn(),
    spellChoicesByLevel: new Map([
      [1, { cantrips: 1, spells: 1, maxSpellLevel: 1, canSwap: false }],
    ]),
    classSpells: spells,
    spellByReference: new Map(
      spells.map((entry) => [`${entry.name.toLowerCase()}|${entry.source.toLowerCase()}`, entry]),
    ),
    viewingClass: 'Wizard',
    viewingClassSource: 'PHB',
    onSetClassSpellSelectionsAtLevel: vi.fn(),
    onSwapClassSpellAtLevel: vi.fn(),
    spellSwapLevel: null,
    spellSwapDrop: null,
    onSpellSwapLevelChange: vi.fn(),
    onSpellSwapDropChange: vi.fn(),
    subclassPickerOpen: false,
    onSubclassPickerOpenChange: vi.fn(),
    subclassTitle: 'Subclass',
    subclasses: [],
    onSubclassConfirm: vi.fn(),
    characterSnapshot: {} as never,
    asiPickerLevel: null,
    onAsiPickerLevelChange: vi.fn(),
    appliedAsiChoicesForClass: [],
    onAsiApply: vi.fn(),
    featPickerOpen: false,
    onFeatPickerOpenChange: vi.fn(),
    featModalFeats: [],
    featPickerInitialSelectedIds: [],
    onFeatConfirm: vi.fn(),
  }
}

test.each([
  'restore',
  'remove',
  'restore over quota',
] as const)('class Confirm requires explicit %s of unavailable metadata without charging the leveled quota', async (action) => {
  let character = buildInitialCharacter(
    {
      initial: {
        name: 'Missing class spell',
        originSystem: '2014',
        allowedSources: ['PHB', 'TCE'],
      },
      classEntity: makeClassFixture({
        cantripProgression: [1],
        spellsKnownProgression: [1],
        spellcastingAbility: 'int',
      }),
    },
    new Map(),
    () => [],
  )
  character = commit(
    character,
    setClassSpellSelectionsAtLevel(character, character.provenance, {
      className: 'Wizard',
      classSource: 'PHB',
      classLevel: 1,
      selections: [{ name: 'Mage Hand|TCE', spellLevel: 0, school: 'C' }],
    }),
  )
  const original = structuredClone(character)
  const available = [spell('Light', 'PHB'), spell('Shield', 'PHB', 1)]
  let props = classProps(character, available)
  const view = render(<BuildClassModals {...props} />)
  await waitFor(() => expect(screen.getByText('Shield')).toBeTruthy())
  expect(screen.getByText('Shield').closest('button')!.disabled).toBe(false)
  const confirm = screen.getByRole('button', { name: 'Confirm' })
  expect((confirm as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(confirm)
  expect(props.onSetClassSpellSelectionsAtLevel).not.toHaveBeenCalled()
  expect(character).toEqual(original)
  fireEvent.click(screen.getByText('Shield'))
  if (action === 'restore over quota') fireEvent.click(screen.getByText('Light'))
  if (action === 'remove')
    fireEvent.click(screen.getByRole('button', { name: 'Remove Mage Hand (TCE)' }))
  else {
    props = {
      ...props,
      ...classProps(character, [...available, spell('Mage Hand', 'TCE')]),
      onSetClassSpellSelectionsAtLevel: props.onSetClassSpellSelectionsAtLevel,
    }
    view.rerender(<BuildClassModals {...props} />)
  }
  if (action === 'restore over quota') {
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    expect(
      screen.getByText('Remove extra selections to fit the limits before confirming.'),
    ).toBeTruthy()
    fireEvent.click(confirm)
    expect(props.onSetClassSpellSelectionsAtLevel).not.toHaveBeenCalled()
    expect(character).toEqual(original)
    fireEvent.click(screen.getByText('Light'))
  }
  expect((confirm as HTMLButtonElement).disabled).toBe(false)
  fireEvent.click(confirm)
  const selections = vi.mocked(props.onSetClassSpellSelectionsAtLevel).mock.calls[0][3]
  expect(selections).toEqual(
    expect.arrayContaining([{ name: 'Shield|PHB', spellLevel: 1, school: 'A' }]),
  )
  expect(selections.some((entry) => entry.name === 'Mage Hand|TCE' && entry.spellLevel !== 0)).toBe(
    false,
  )
  const saved = commit(
    character,
    setClassSpellSelectionsAtLevel(character, character.provenance, {
      className: 'Wizard',
      classSource: 'PHB',
      classLevel: 1,
      selections,
    }),
  )
  const profile = saved.spells.spellProfiles.find((entry) => entry.id === 'class:Wizard|PHB')!
  expect(profile.cantrips).toEqual(action === 'remove' ? [] : ['Mage Hand|TCE'])
  expect(profile.spellsKnown).toEqual(['Shield|PHB'])
})

test('actual child Clear removes its normalized choice tag and preserves an independent printing', () => {
  const parent = { name: 'Parent', source: 'PHB' } as Race5e
  const child = {
    name: 'Child',
    source: 'TCE',
    additionalSpells: [{ known: { _: [{ choose: 'level=0|class=Wizard' }] } }],
  } as Race5e
  let character = buildInitialCharacter(
    { initial: { name: 'Child clear', originSystem: '2014' }, race: parent, subrace: child },
    new Map(),
    () => [],
  )
  const profile = character.spells.spellProfiles.find((entry) => entry.type === 'racial')!
  character = commit(
    character,
    setRacialSpellChoice(character, character.provenance, profile.id, 'direct-_-choose-0', [
      'Light|TCE',
    ]),
  )
  character = commit(
    character,
    addSpellToCharacter(
      character,
      character.provenance,
      'Light|PHB',
      'cantrip',
      'special:unrestricted',
      { sourceType: 'manual', sourceName: 'User Choice' },
    ),
  )
  Object.assign(character.provenance.spells.light[0], { sourceName: ' child ', sourceRef: ' tce ' })
  const original = structuredClone(character)
  useCharacterStore.setState({
    characters: [character],
    activeCharacter: character,
    activeCharacterId: character.id,
  })
  const { result } = renderHook(() => {
    const active = useCharacterStore((state) => state.activeCharacter)!
    return useSpellProfileMutations(active.spells.spellProfiles, new Map())
  })
  act(() => result.current.setRacialSpellChoice(profile.id, 'direct-_-choose-0', []))
  const saved = characterPersistenceSchema.parse(
    useCharacterStore.getState().activeCharacter,
  ) as Character
  expect(saved.spells.spellProfiles.find((entry) => entry.id === profile.id)!.cantrips).toEqual([])
  expect(saved.spells.spellProfiles.find((entry) => entry.type === 'special')!.cantrips).toEqual([
    'Light|PHB',
  ])
  expect(saved.provenance.spells.light).toEqual([
    expect.objectContaining({ sourceType: 'manual', grantSource: 'PHB' }),
  ])
  expect(character).toEqual(original)
})
