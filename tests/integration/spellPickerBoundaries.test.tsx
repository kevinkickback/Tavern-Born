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
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useSpellProfileMutations } from '@/hooks/character/useSpellProfileMutations'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { setRacialSpellChoice } from '@/lib/character/commands/spellCommands'
import { SpellsPage } from '@/pages/spells/SpellsPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Race5e, Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { selectBonusSpellFixture } from '../fixtures/bonusSpellSelection'
import { makeGameDataFixture, makeSpellFixture } from '../fixtures/gameDataFixtures'
import { nativeRaceResolution } from '../fixtures/nativeRacialCharacter'

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
  character = commit(character, selectBonusSpellFixture(character, 'Light|PHB', 'cantrip'))
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
  fireEvent.click(screen.getByRole('tab', { name: /^Racial/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit Caster spell choice 1' }))
  const dialog = within(screen.getByRole('dialog'))
  await waitFor(() => expect(dialog.getAllByText('Light')).toHaveLength(2))
  const lights = dialog.getAllByText('Light')
  expect(lights[0].closest('button')!.disabled).toBe(false)
  expect(lights[1].closest('button')!.disabled).toBe(false)
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
    setRacialSpellChoice(
      character,
      character.provenance,
      profile.id,
      profile.choices![0].id,
      ['Light|TCE'],
      nativeRaceResolution(parent, child),
      { 'light|tce': spell('Light', 'TCE') },
    ),
  )
  character = commit(character, selectBonusSpellFixture(character, 'Light|PHB', 'cantrip'))
  Object.assign(character.provenance.spells.light[0], { sourceName: ' child ', sourceRef: ' tce ' })
  const original = structuredClone(character)
  useCharacterStore.setState({
    characters: [character],
    activeCharacter: character,
    activeCharacterId: character.id,
  })
  const { result } = renderHook(() => {
    const active = useCharacterStore((state) => state.activeCharacter)!
    return useSpellProfileMutations(active.spells.spellProfiles)
  })
  act(() => result.current.setRacialSpellChoice(profile.id, profile.choices![0].id, []))
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
