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
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useClassProvenanceMutations } from '@/hooks/character/useClassProvenanceMutations'
import { getProficiencyOption } from '@/lib/5etools/classProficiencyIdentity'
import { refreshClassProficiencyState } from '@/lib/character/classProficiencySelections'
import { removeSavedSkillProficiencyCommand } from '@/lib/character/commands/skillProficiencyCommands'
import { getSkillProficiencyChoices } from '@/lib/character/skillProficiencyChoices'
import { BuildClassPage } from '@/pages/build/class/ClassPage'
import { BuildProficienciesPage } from '@/pages/build/proficiencies/ProficienciesPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { chooseOptionalSkill, makeOptionalSkillFixture } from '../fixtures/optionalSkillFixtures'

beforeEach(() => {
  resetCharacterStore()
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})
const active = () => useCharacterStore.getState().activeCharacter!
function mount(
  f: ReturnType<typeof makeOptionalSkillFixture>,
  character: Character,
  route = '/build/class',
) {
  useGameDataStore.setState({ gameData: f.data })
  setActiveCharacter(character)
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/build/class" element={<BuildClassPage />} />
        <Route path="/build/proficiencies" element={<BuildProficienciesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}
async function openLevel(level: number) {
  const button = (
    await screen.findByText(`Level ${level}`, { selector: '[data-slot="accordion-trigger"] span' })
  ).closest('button')!
  if (button.getAttribute('data-state') === 'closed') fireEvent.click(button)
}

test('Class and Proficiencies share both Primal gains through strict reopen and removal', async () => {
  const f = makeOptionalSkillFixture()
  mount(f, f.character)
  await openLevel(3)
  const link = within(screen.getByRole('group', { name: 'Primal Knowledge skills' })).getByRole(
    'link',
    { name: 'Choose skill' },
  )
  expect(link.getAttribute('href')).toContain(
    encodeURIComponent('class-choice:feature-proficiencies:'),
  )
  const before = JSON.stringify(active())
  fireEvent.click(link)
  await waitFor(() =>
    expect(screen.getByLabelText('Nature proficiency', { selector: 'fieldset' })).toBeTruthy(),
  )
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(JSON.stringify(active())).toBe(before)
  fireEvent.pointerDown(
    within(screen.getByLabelText('Nature proficiency', { selector: 'fieldset' })).getByTitle(
      'Choose a proficiency source',
    ),
    { button: 0, ctrlKey: false },
  )
  fireEvent.click(
    (await screen.findAllByRole('menuitem', { name: /Use Primal Knowledge skills/ })).find((row) =>
      row.textContent?.includes('level 3'),
    )!,
  )
  const saved = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(active())))
  expect(saved.proficiencies.skills).toContain('nature')
  cleanup()
  mount(f, saved, '/build/proficiencies')
  fireEvent.click(screen.getByTitle('Choose Survival'))
  expect(
    active()
      .classChoiceSelections?.map((row) => row.classLevel)
      .sort((a, b) => a - b),
  ).toEqual([3, 10])
  expect(active().proficiencies.skills).toEqual(expect.arrayContaining(['nature', 'survival']))
  fireEvent.click(screen.getByTitle('Remove choice: Nature'))
  expect(active().proficiencies.skills).not.toContain('nature')
  expect(active().proficiencies.skills).toContain('survival')
  const reopened = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(active())))
  cleanup()
  mount(f, reopened)
  await openLevel(10)
  expect(
    within(screen.getByRole('group', { name: 'Primal Knowledge skills' })).getByRole('link', {
      name: 'Edit skill',
    }),
  ).toBeTruthy()
})

test('two pending gains offer distinct sources; source loss leaves removable inactive intent', async () => {
  const f = makeOptionalSkillFixture()
  mount(f, f.character, '/build/proficiencies')
  const skill = within(screen.getByLabelText('Nature proficiency', { selector: 'fieldset' }))
  fireEvent.pointerDown(skill.getByTitle('Choose a proficiency source'), {
    button: 0,
    ctrlKey: false,
  })
  const choices = await screen.findAllByRole('menuitem', { name: /Use Primal Knowledge skills/ })
  expect(choices).toHaveLength(2)
  fireEvent.click(choices.find((row) => row.textContent?.includes('level 10'))!)
  expect(active().classChoiceSelections?.[0].classLevel).toBe(10)
  await act(async () => {
    useGameDataStore.setState({ gameData: { ...f.data, optionalClassFeatureSources: [] } })
  })
  const sources = within(screen.getByRole('heading', { name: /^Sources/ })).getByRole('button', {
    name: /^Sources/,
  })
  if (sources.getAttribute('data-state') === 'closed') fireEvent.click(sources)
  expect(screen.getByText(/Nature — retained, inactive/i)).toBeTruthy()
  fireEvent.click(screen.getByTitle('Remove choice: Nature'))
  expect(active().classChoiceSelections).toEqual([])
  await act(async () => {
    useGameDataStore.setState({ gameData: f.data })
  })
  expect(active().proficiencies.skills).not.toContain('nature')
})

test.each([
  'catalog',
  'sources',
  'origin',
  'reprints',
  'character',
] as const)('captured Class callback rejects stale %s authority; exact source-free removal remains available', async (kind) => {
  const f = makeOptionalSkillFixture(3)
  useGameDataStore.setState({ gameData: f.data })
  setActiveCharacter(f.character)
  const { result } = renderHook(() => useClassProvenanceMutations())
  const callback = result.current.applyClassChoiceSelection
  const choice = getSkillProficiencyChoices(f.character, f.authority).classOwners[0].choice!
  await act(async () => {
    if (kind === 'catalog')
      useGameDataStore.setState({ gameData: { ...f.data, optionalClassFeatureSources: [] } })
    else
      useCharacterStore.setState({
        activeCharacter: {
          ...active(),
          ...(kind === 'sources' ? { allowedSources: ['PHB'] } : {}),
          ...(kind === 'origin' ? { originSystem: '2024' as const } : {}),
          ...(kind === 'reprints'
            ? { variantRules: { ...active().variantRules, preferNewerPrintings: true } }
            : {}),
          ...(kind === 'character' ? { id: 'other-character' } : {}),
        },
      })
  })
  const before = JSON.stringify(active())
  expect(() => callback(choice, [getProficiencyOption('skills', 'nature')])).toThrow(
    /Source rules changed/,
  )
  expect(JSON.stringify(active())).toBe(before)
})

test('current Class callback commits latest unrelated edits and removes saved setup after catalog loss', async () => {
  const f = makeOptionalSkillFixture(3)
  useGameDataStore.setState({ gameData: f.data })
  setActiveCharacter(f.character)
  const { result } = renderHook(() => useClassProvenanceMutations())
  const callback = result.current.applyClassChoiceSelection
  const choice = getSkillProficiencyChoices(f.character, f.authority).classOwners[0].choice!
  await act(async () => {
    useCharacterStore.setState({ activeCharacter: { ...active(), name: 'Latest name' } })
  })
  await act(async () => {
    callback(choice, [getProficiencyOption('skills', 'nature')])
  })
  expect(active().name).toBe('Latest name')
  expect(active().proficiencies.skills).toContain('nature')
  const remove = result.current.retainSavedFeatureOptions
  await act(async () => {
    useGameDataStore.setState({ gameData: { ...f.data, optionalClassFeatureSources: [] } })
  })
  await act(async () => {
    remove(choice.id, [])
  })
  expect(active().classChoiceSelections).toEqual([])
  expect(active().proficiencies.skills).not.toContain('nature')
})

test.each([
  'Class callback',
  'source-free skill action',
] as const)('%s removes one absent-source gain without replaying its sibling', async (path) => {
  const f = makeOptionalSkillFixture()
  const saved = chooseOptionalSkill(
    f,
    chooseOptionalSkill(f, f.character, 3, 'nature'),
    10,
    'survival',
  )
  useGameDataStore.setState({ gameData: f.data })
  setActiveCharacter(saved)
  const { result } = renderHook(() => useClassProvenanceMutations())
  const callback = result.current.retainSavedFeatureOptions
  const id = saved.classChoiceSelections!.find((row) => row.classLevel === 3)!.choiceId
  const absentData = { ...f.data, optionalClassFeatureSources: [] }
  const absent = refreshClassProficiencyState(saved, f.data.classes, {
    ...f.catalogs,
    optionalClassFeatureSources: [],
  })
  expect(absent.proficiencies.skills).not.toContain('survival')
  await act(async () => {
    useGameDataStore.setState({ gameData: absentData })
    useCharacterStore.setState({ activeCharacter: absent })
  })
  await act(async () => {
    if (path === 'Class callback') callback(id, [])
    else {
      const removed = removeSavedSkillProficiencyCommand(
        active(),
        active().provenance,
        'nature',
        `class:remove:${id}`,
      )
      useCharacterStore.getState().updateCharacter(active().id, {
        ...removed.characterPatch,
        provenance: removed.provenanceUpdate,
      })
    }
  })
  expect(active().proficiencies.skills).not.toContain('survival')
  expect(active().proficiencies.skills).not.toContain('nature')
  expect(active().classChoiceSelections?.map((row) => row.classLevel)).toEqual([10])
  expect(characterPersistenceSchema.safeParse(active()).success).toBe(true)
})
