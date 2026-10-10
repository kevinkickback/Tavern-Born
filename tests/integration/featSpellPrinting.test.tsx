import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useFeatProvenanceMutations } from '@/hooks/character/useFeatProvenanceMutations'
import { useSpellProfileMutations } from '@/hooks/character/useSpellProfileMutations'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { commitFeatOptionsCommand } from '@/lib/character/commands/featCommands'
import { SpellsPage } from '@/pages/spells/SpellsPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeGameDataFixture, makeSpellFixture } from '../fixtures/gameDataFixtures'
import { makeNonracialSourceCharacter } from '../fixtures/nonracialSourceCharacter'

const feat = { name: 'Magic Initiate', source: 'XPHB', fixedGrant: true, grantVariant: 'cleric' }
const options = { spells: ['Toll the Dead|XGE'] }
const requested = makeSpellFixture({ name: 'Toll the Dead', source: 'XGE', level: 0 })

function install() {
  const original = makeNonracialSourceCharacter()
  const result = commitFeatOptionsCommand(original, original.provenance, feat, options, [requested])
  const character = characterPersistenceSchema.parse({
    ...original,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  useCharacterStore.setState({
    characters: [character],
    activeCharacter: character,
    activeCharacterId: character.id,
    isActiveCharacterDirty: false,
  })
  const data = makeGameDataFixture({
    spells: [
      requested,
      { ...requested, source: 'XPHB' },
      makeSpellFixture({ name: 'Light', source: 'XPHB', level: 0 }),
    ],
  })
  useGameDataStore.setState({ gameData: { ...data, lookups: buildGameDataLookups(data) } })
  return character
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useCharacterStore.setState({
    characters: [],
    activeCharacter: null,
    activeCharacterId: null,
    isActiveCharacterDirty: false,
  })
  useGameDataStore.setState({ gameData: null })
})

test('adding an unrelated bonus spell retains both established printings and their ownership', () => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
  const before = install()
  render(
    <TooltipProvider>
      <MemoryRouter initialEntries={['/spells?view=bonus']}>
        <SpellsPage />
      </MemoryRouter>
    </TooltipProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Add Spell' }))
  const dialog = within(screen.getByRole('dialog'))
  fireEvent.change(dialog.getByRole('textbox', { name: 'Search add bonus spells' }), {
    target: { value: 'Light' },
  })
  fireEvent.click(dialog.getByText('Light'))
  fireEvent.click(dialog.getByRole('button', { name: 'Confirm' }))
  const after = characterPersistenceSchema.parse(useCharacterStore.getState().activeCharacter)
  const special = after.spells.spellProfiles.find((profile) => profile.type === 'special')!
  expect(special.cantrips).toEqual(['Toll the Dead|XPHB', 'Toll the Dead|XGE', 'Light|XPHB'])
  expect(special.fixedSpells).toEqual(['Toll the Dead|XGE'])
  expect(after.provenance.spells['toll the dead']).toEqual(
    before.provenance.spells['toll the dead'],
  )
  expect(after.provenance.spells.light).toEqual([
    expect.objectContaining({ sourceType: 'manual', grantSource: 'XPHB' }),
  ])
  expect(after.fixedFeatOptions).toEqual(before.fixedFeatOptions)
})

test('Spells locks the feat printing while the independent manual printing remains removable', () => {
  install()
  render(
    <TooltipProvider>
      <MemoryRouter initialEntries={['/spells?view=bonus']}>
        <SpellsPage />
      </MemoryRouter>
    </TooltipProvider>,
  )
  expect(screen.queryByRole('button', { name: 'Remove Toll the Dead|XGE' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Remove Toll the Dead|XPHB' }))
  const after = useCharacterStore.getState().activeCharacter!
  expect(
    after.spells.spellProfiles.find((profile) => profile.type === 'special')?.cantrips,
  ).toEqual(['Toll the Dead|XGE'])
  expect(after.provenance.spells['toll the dead'].map((tag) => tag.sourceType)).toEqual([
    'class',
    'feat',
  ])
})

test('the mutation boundary independently protects the exact feat target', () => {
  const before = install()
  const { result } = renderHook(() => {
    const character = useCharacterStore((state) => state.activeCharacter)!
    return useSpellProfileMutations(character.spells.spellProfiles, new Map())
  })
  act(() =>
    result.current.removeSpellFromProfile('special:unrestricted', 'Toll the Dead|XGE', 'cantrip'),
  )
  expect(useCharacterStore.getState().activeCharacter).toBe(before)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
  act(() =>
    result.current.removeSpellFromProfile('special:unrestricted', 'Toll the Dead|XPHB', 'cantrip'),
  )
  expect(
    useCharacterStore
      .getState()
      .activeCharacter?.spells.spellProfiles.find((profile) => profile.type === 'special')
      ?.cantrips,
  ).toEqual(['Toll the Dead|XGE'])
})

test('rejected feat edits leave the whole draft, timestamp and dirty status unchanged', () => {
  const before = install()
  const { result } = renderHook(useFeatProvenanceMutations)
  act(() =>
    result.current.editFeatWithOptions(
      feat,
      options,
      { spells: ['Toll the Dead|ABSENT'], skills: ['Arcana'] },
      [requested],
    ),
  )
  expect(useCharacterStore.getState().activeCharacter).toBe(before)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
})
