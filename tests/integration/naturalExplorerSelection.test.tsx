import { existsSync } from 'node:fs'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { setOptionalClassAdoptionCommand } from '@/lib/character/commands/optionalClassFeatureCommands'
import { BuildClassPage } from '@/pages/build/class/ClassPage'
import { BuildReviewPage } from '@/pages/build/review/ReviewPage'
import { RulesPage } from '@/pages/rules/RulesPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import {
  makeNaturalExplorerFixture,
  selectNaturalExplorer,
} from '../fixtures/naturalExplorerFixtures'

beforeEach(() => {
  resetCharacterStore()
  useCharacterStore.setState({ isActiveCharacterDirty: false })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.hasAttribute('data-selection-scroll-container') ? 600 : 100
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})
function mount(
  f: ReturnType<typeof makeNaturalExplorerFixture>,
  saved = f.character,
  route = '/build/class',
) {
  useGameDataStore.setState({ gameData: f.data })
  setActiveCharacter(saved)
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/build/class" element={<BuildClassPage />} />
        <Route path="/build/review" element={<BuildReviewPage />} />
        <Route path="/rules" element={<RulesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}
const active = () => useCharacterStore.getState().activeCharacter!
const dialog = () => within(screen.getByRole('dialog'))

function footer(name: 'Confirm' | 'Cancel') {
  const candidate = dialog().getByText(name, { selector: 'button' })
  const control = within(candidate.parentElement!).getByRole('button', { name })
  expect(control).toBe(candidate)
  if (name === 'Cancel') expect(control.hasAttribute('disabled')).toBe(false)
  return control
}
async function levelButton(level: number) {
  const label = await screen.findByText(`Level ${level}`, {
    selector: '[data-slot="accordion-trigger"] span',
  })
  const candidate = label.closest('button')!
  const control = await within(candidate.parentElement!).findByRole('button', {
    name: new RegExp(`Level ${level}\\b`),
  })
  expect(control).toBe(candidate)
  return control
}

async function open(gain = 1) {
  const level = await levelButton(gain)
  if (level.getAttribute('data-state') === 'closed') fireEvent.click(level)
  const cards = await screen.findAllByRole('group', { name: 'Natural Explorer' })
  const card = cards.find((row) => within(row).queryByRole('button', { name: 'Edit' }))!
  fireEvent.click(within(card).getByRole('button', { name: 'Edit' }))
  await screen.findByRole('dialog')
}
async function row(name: string) {
  fireEvent.change(dialog().getByPlaceholderText('Search available options'), {
    target: { value: name },
  })
  return dialog().findByRole('button', { name: new RegExp(`^${name}\\b`) })
}
async function confirm() {
  const button = footer('Confirm')
  expect(button.hasAttribute('disabled')).toBe(false)
  fireEvent.click(button)
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}
test('Review finishes an actual terrain with the shared modal and strict reopen', async () => {
  const f = makeNaturalExplorerFixture(1)
  mount(f, f.character, '/build/review')
  fireEvent.click(screen.getByText('Finish Natural Explorer').closest('button')!)
  await screen.findByRole('dialog')
  fireEvent.click(await row('Forest'))
  await confirm()
  const saved = active().classChoiceSelections!.find(
    (selection) => selection.label === 'Natural Explorer',
  )!
  expect(saved.classLevel).toBe(1)
  expect(saved.selected[0]).toMatchObject({
    name: 'Forest',
    source: 'PHB',
    entityType: 'featureOption',
    slotLevel: 1,
  })
  expect(JSON.parse(saved.selected[0].ref!)).toEqual([
    'source-group',
    'classFeature',
    'natural explorer|ranger|phb|1|phb',
    'favored-terrain',
    'forest',
  ])
  expect(
    characterPersistenceSchema.parse(JSON.parse(JSON.stringify(active()))).classChoiceSelections,
  ).toEqual(active().classChoiceSelections)
})
test('unchanged confirmation and Cancel preserve reopened bytes and clean dirty state', async () => {
  const f = makeNaturalExplorerFixture(1)
  mount(f, selectNaturalExplorer(f))
  const before = JSON.stringify(active())
  await open()
  await confirm()
  expect(JSON.stringify(active())).toBe(before)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
  await open()
  fireEvent.click(await row('Forest'))
  fireEvent.click(await row('Coast'))
  fireEvent.click(footer('Cancel'))
  expect(JSON.stringify(active())).toBe(before)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
})
test('replace then Clear preserves independent state', async () => {
  const f = makeNaturalExplorerFixture(1)
  mount(f, selectNaturalExplorer(f))
  await open()
  fireEvent.click(await row('Forest'))
  fireEvent.click(await row('Swamp'))
  await confirm()
  expect(active().classChoiceSelections![0].selected[0].name).toBe('Swamp')
  await open()
  fireEvent.click(await row('Swamp'))
  await confirm()
  expect(active().classChoiceSelections).toEqual([])
  expect(active().features).toEqual(f.character.features)
})
test.each([
  'pool',
  'class',
])('missing %s has shared recovery, unchanged Keep, restoration and safe removal', async (kind) => {
  const f = makeNaturalExplorerFixture(1),
    saved = selectNaturalExplorer(f)
  const missing = makeNaturalExplorerFixture(1, (doc) => {
    if (kind === 'pool')
      doc.classFeature = doc.classFeature.filter((feature) => feature.name !== 'Natural Explorer')
  })
  if (kind === 'class') missing.data.classes = []
  mount(missing, saved, '/build/review')
  const before = JSON.stringify(active())
  fireEvent.click(screen.getByText('Restore or remove Natural Explorer').closest('button')!)
  await screen.findByRole('dialog')
  expect(dialog().getByRole('heading', { name: 'Review saved Natural Explorer' })).toBeTruthy()
  await confirm()
  expect(JSON.stringify(active())).toBe(before)
  await act(async () => {
    await useGameDataStore.setState({ gameData: f.data })
  })
  expect(screen.queryByText('Restore or remove Natural Explorer')).toBeNull()
  expect(JSON.stringify(active())).toBe(before)
  await act(async () => {
    await useGameDataStore.setState({ gameData: missing.data })
  })
  const card = await screen.findByRole('group', { name: 'Natural Explorer' })
  fireEvent.click(within(card).getByRole('button', { name: 'Review saved choice' }))
  await screen.findByRole('dialog')
  fireEvent.click(await row('Forest'))
  await confirm()
  expect(active().classChoiceSelections).toEqual([])
  expect(active().features).toEqual(f.character.features)
})
test('an open picker cannot accept a stale source option', async () => {
  const f = makeNaturalExplorerFixture(1)
  mount(f, selectNaturalExplorer(f))
  await open()
  fireEvent.click(await row('Forest'))
  fireEvent.click(await row('Coast'))
  const missing = makeNaturalExplorerFixture(1, (doc) => {
    doc.classFeature = doc.classFeature.filter((feature) => feature.name !== 'Natural Explorer')
  })
  await act(async () => {
    await useGameDataStore.setState({ gameData: missing.data })
  })
  const button = footer('Confirm')
  if (!button.hasAttribute('disabled')) fireEvent.click(button)
  expect(active().classChoiceSelections![0].selected[0].name).toBe('Forest')
})
test('another earned gain occupies its terrain in the shared picker', async () => {
  const f = makeNaturalExplorerFixture(6)
  mount(f, selectNaturalExplorer(f))
  const level = await levelButton(6)
  if (level.getAttribute('data-state') === 'closed') fireEvent.click(level)
  const cards = await screen.findAllByRole('group', { name: 'Natural Explorer' })
  const card =
    cards.find((candidate) => within(candidate).queryByText('No options selected.')) ??
    cards[cards.length - 1]
  fireEvent.click(within(card).getByRole('button', { name: 'Choose' }))
  await screen.findByRole('dialog')
  const forest = await row('Forest')
  expect(forest.getAttribute('aria-disabled') === 'true' || forest.hasAttribute('disabled')).toBe(
    true,
  )
  fireEvent.click(await row('Coast'))
  await confirm()
  expect(
    active().classChoiceSelections!.map((selection) => [
      selection.classLevel,
      selection.selected[0].name,
    ]),
  ).toEqual([
    [1, 'Forest'],
    [6, 'Coast'],
  ])
})

test.skipIf(!existsSync('data/class/class-ranger.json'))(
  'actual Rules toggle preserves dormant terrain and restores it when disabled',
  async () => {
    const f = makeNaturalExplorerFixture(1, undefined, 'data/class/class-ranger.json')
    mount(f, selectNaturalExplorer(f), '/rules')
    const before = active().classChoiceSelections![0]
    fireEvent.click(screen.getByRole('tab', { name: 'Character Options' }))
    fireEvent.click(screen.getByLabelText('Allow Optional Class Features'))
    expect(active().classChoiceSelections![0].inactive).not.toBe(true)
    const adoption = setOptionalClassAdoptionCommand(
      active(),
      active().provenance,
      f.catalogs,
      {
        owner: ['class', 'ranger', 'phb'],
        target: 'class-feature|deft explorer|ranger|phb|1|tce',
        earnedLevel: 1,
      },
      true,
      [],
    )
    await act(async () => {
      useCharacterStore.getState().updateCharacter(active().id, {
        ...adoption.characterPatch,
        provenance: adoption.provenanceUpdate,
      })
    })
    await waitFor(() => expect(active().classChoiceSelections![0].inactive).toBe(true))
    expect(active().classChoiceSelections![0].selected).toEqual(before.selected)
    expect(active().features).toEqual(f.character.features)
    fireEvent.click(screen.getByLabelText('Allow Optional Class Features'))
    await waitFor(() => expect(active().classChoiceSelections![0].inactive).not.toBe(true))
    expect(active().classChoiceSelections![0]).toEqual(before)
  },
)

test('open later-gain picker rechecks terrain newly occupied by an earlier gain', async () => {
  const f = makeNaturalExplorerFixture(6)
  mount(f, selectNaturalExplorer(f))
  const level = await levelButton(6)
  if (level.getAttribute('data-state') === 'closed') fireEvent.click(level)
  const card = (await screen.findAllByRole('group', { name: 'Natural Explorer' })).find(
    (candidate) => within(candidate).queryByRole('button', { name: 'Choose' }),
  )!
  fireEvent.click(within(card).getByRole('button', { name: 'Choose' }))
  await screen.findByRole('dialog')
  fireEvent.click(await row('Coast'))
  const changed = selectNaturalExplorer(f, 1, 'Coast', active())
  await act(async () => {
    await useCharacterStore.setState({ activeCharacter: changed })
  })
  const before = JSON.stringify(active())
  const confirmButton = footer('Confirm')
  if (!confirmButton.hasAttribute('disabled')) fireEvent.click(confirmButton)
  expect(JSON.stringify(active())).toBe(before)
  expect(active().classChoiceSelections).toHaveLength(1)
})
test.skipIf(!existsSync('data/class/class-ranger.json'))(
  'Overview uses current replacement authority and cannot reactivate dormant facts through raw details',
  async () => {
    const f = makeNaturalExplorerFixture(1, undefined, 'data/class/class-ranger.json')
    const allowed = { ...selectNaturalExplorer(f), variantRules: { optionalClassFeatures: true } }
    const adoption = setOptionalClassAdoptionCommand(
      allowed,
      allowed.provenance,
      f.catalogs,
      {
        owner: ['class', 'ranger', 'phb'],
        target: 'class-feature|deft explorer|ranger|phb|1|tce',
        earnedLevel: 1,
      },
      true,
      [],
    )
    const saved = characterPersistenceSchema.parse({
      ...allowed,
      ...adoption.characterPatch,
      provenance: adoption.provenanceUpdate,
    })
    mount(f, saved, '/build/review')
    fireEvent.click(screen.getByRole('tab', { name: 'Character overview' }))
    expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0)
    expect(screen.queryByText(/When you make an Intelligence or Wisdom check/)).toBeNull()
    const before = JSON.stringify(active())
    const missing = makeNaturalExplorerFixture(
      1,
      (doc) => {
        doc.classFeature = doc.classFeature.filter(
          (feature) =>
            !(feature.name === 'Deft Explorer' && feature.level === 1 && feature.source === 'TCE'),
        )
      },
      'data/class/class-ranger.json',
    )
    await act(async () => {
      await useGameDataStore.setState({ gameData: missing.data })
    })
    expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('tab', { name: /Needs attention/ }))
    expect(screen.getByText('Restore or clear Deft Explorer')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Character overview' }))
    const clause =
      "When you make an Intelligence or Wisdom check related to your favored terrain, your proficiency bonus is doubled if you are using a skill that you're proficient in."
    expect(screen.queryByText(clause)).toBeNull()
    expect(JSON.stringify(active())).toBe(before)
    await act(async () => {
      useGameDataStore.setState({ gameData: f.data })
    })
    fireEvent.click(screen.getByRole('tab', { name: /Needs attention/ }))
    expect(screen.queryByText('Restore or clear Deft Explorer')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Character overview' }))
    expect(screen.queryByText(clause)).toBeNull()
    expect(JSON.stringify(active())).toBe(before)
  },
)

test('Review retains all unavailable gain warnings and routes the middle grant to level6', async () => {
  const f = makeNaturalExplorerFixture(10, (doc) => {
    doc.classFeature = doc.classFeature.filter((row) => row.name !== 'Natural Explorer')
  })
  mount(f, f.character, '/build/review')
  const warnings = screen.getAllByText('Review unresolved Natural Explorer choice')
  expect(warnings).toHaveLength(3)
  fireEvent.click(warnings[1].closest('button')!)
  const level = await levelButton(6)
  expect(level.getAttribute('data-state')).toBe('open')
})

test('saved gain recovery suppresses only its matching generic warning in Review and Builder', async () => {
  const f = makeNaturalExplorerFixture(10),
    saved = selectNaturalExplorer(f, 6, 'Coast')
  const missing = makeNaturalExplorerFixture(10, (doc) => {
    doc.classFeature = doc.classFeature.filter((row) => row.name !== 'Natural Explorer')
  })
  mount(missing, saved, '/build/review')
  expect(screen.getAllByText('Restore or remove Natural Explorer')).toHaveLength(1)
  expect(screen.getAllByText('Review unresolved Natural Explorer choice')).toHaveLength(2)
  fireEvent.click(screen.getByText('Restore or remove Natural Explorer').closest('button')!)
  await within(await screen.findByRole('dialog')).findByRole('heading', {
    name: 'Review saved Natural Explorer',
  })
  fireEvent.click(footer('Cancel'))
  const level = await levelButton(6)
  const panel = document.getElementById(level.getAttribute('aria-controls')!)!
  expect(
    within(panel).queryByText(/Natural Explorer favored-terrain rules are unavailable/),
  ).toBeNull()
})
