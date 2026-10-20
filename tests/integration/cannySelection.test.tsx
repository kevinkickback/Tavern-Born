import { readFileSync } from 'node:fs'
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
import { useSkills } from '@/hooks/character/useSkills'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { parseClassDocument } from '@/lib/5etools/parsers/classes'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceOptions'
import { toggleExpertiseCommand } from '@/lib/character/commands/expertiseCommands'
import { applySkillExpertiseActionCommand } from '@/lib/character/commands/skillExpertiseCommands'
import { getSkillExpertiseChoices } from '@/lib/character/skillExpertiseChoices'
import { BuildClassPage } from '@/pages/build/class/ClassPage'
import { BuildProficienciesPage } from '@/pages/build/proficiencies/ProficienciesPage'
import { BuildReviewPage } from '@/pages/build/review/ReviewPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e, ClassFeature } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCannyFixture, selectCanny } from '../fixtures/cannyFixtures'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeOptionalClassSourceData } from '../fixtures/optionalClassFeatureFixtures'

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
type Fixture = ReturnType<typeof makeCannyFixture>
const configured = (f: Fixture) =>
  selectCanny(f, 'languages', ['Elvish', 'Dwarvish'], selectCanny(f, 'expertise', ['Survival']))
const active = () => useCharacterStore.getState().activeCharacter!
function optionalPilotFixture(level = 6) {
  const fixture = makeCannyFixture(level)
  const { data } = makeOptionalClassSourceData()
  data.skills = fixture.data.skills
  data.languages = fixture.data.languages
  data.lookups = buildGameDataLookups(data)
  return {
    ...fixture,
    data,
    character: { ...fixture.character, optionalClassFeatureAdoptions: undefined },
  }
}
function mount(f: Fixture, saved = f.character, route = '/build/class') {
  useGameDataStore.setState({ gameData: f.data })
  setActiveCharacter(saved)
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/build/class" element={<BuildClassPage />} />
        <Route path="/build/review" element={<BuildReviewPage />} />
        <Route path="/build/proficiencies" element={<BuildProficienciesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}
const modal = () => within(screen.getByRole('dialog'))
function footer(name: 'Confirm' | 'Cancel') {
  const candidate = modal().getByText(name, { selector: 'button' })
  const button = within(candidate.parentElement!).getByRole('button', { name })
  expect(button).toBe(candidate)
  return button
}
async function open(label: 'Canny expertise' | 'Canny languages') {
  const levelText = await screen.findByText('Level 1', {
    selector: '[data-slot="accordion-trigger"] span',
  })
  const level = levelText.closest('button')!
  if (level.getAttribute('data-state') === 'closed') fireEvent.click(level)
  const card = await screen.findByRole('group', { name: label })
  fireEvent.click(within(card).getByRole('button', { name: /Choose|Edit/ }))
  await screen.findByRole('dialog')
}
async function option(name: string) {
  fireEvent.change(modal().getByPlaceholderText('Search available options'), {
    target: { value: name },
  })
  return modal().findByRole('button', { name: new RegExp(`^${name}\\b`) })
}
async function confirm() {
  const button = footer('Confirm')
  expect(button.hasAttribute('disabled')).toBe(false)
  fireEvent.click(button)
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

test('Class offers independent source-backed Ranger replacements; permission alone selects neither and Canny setup waits for adoption', async () => {
  const f = optionalPilotFixture()
  mount(f)
  const level = (
    await screen.findByText('Level 1', { selector: '[data-slot="accordion-trigger"] span' })
  ).closest('button')!
  if (level.getAttribute('data-state') === 'closed') fireEvent.click(level)
  expect(screen.queryByRole('group', { name: 'Canny expertise' })).toBeNull()
  const section = within(screen.getByRole('region', { name: 'Optional class features' }))
  const natural = section.getByRole('tab', { name: /^Natural Explorer/ }) as HTMLInputElement
  const enemy = section.getByRole('tab', { name: /^Favored Enemy/ }) as HTMLInputElement
  expect(natural.getAttribute('aria-selected')).toBe('true')
  expect(enemy.getAttribute('aria-selected')).toBe('true')
  fireEvent.mouseDown(section.getByRole('tab', { name: /^Deft Explorer/ }), {
    button: 0,
    ctrlKey: false,
  })
  expect(await screen.findByRole('group', { name: 'Canny expertise' })).toBeTruthy()
  expect(active().optionalClassFeatureAdoptions).toHaveLength(1)
  expect(enemy.getAttribute('aria-selected')).toBe('true')
  fireEvent.mouseDown(section.getByRole('tab', { name: /^Favored Foe/ }), {
    button: 0,
    ctrlKey: false,
  })
  expect(active().optionalClassFeatureAdoptions).toHaveLength(2)
  fireEvent.mouseDown(section.getByRole('tab', { name: /^Natural Explorer/ }), {
    button: 0,
    ctrlKey: false,
  })
  expect(active().optionalClassFeatureAdoptions!.map((row) => row.target)).toEqual([
    'class-feature|favored foe|ranger|phb|1|tce',
  ])
  expect(screen.queryByRole('group', { name: 'Canny expertise' })).toBeNull()
  expect(
    characterPersistenceSchema.parse(JSON.parse(JSON.stringify(active())))
      .optionalClassFeatureAdoptions,
  ).toHaveLength(1)
})

test('adopted source loss reserves the original, preserves intent and restores without read writes; Clear works with the source absent', async () => {
  const f = optionalPilotFixture()
  mount(f)
  const level = (
    await screen.findByText('Level 1', { selector: '[data-slot="accordion-trigger"] span' })
  ).closest('button')!
  if (level.getAttribute('data-state') === 'closed') fireEvent.click(level)
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^Deft Explorer/ }), {
    button: 0,
    ctrlKey: false,
  })
  const before = JSON.stringify(active())
  useCharacterStore.setState({ isActiveCharacterDirty: false })
  const missing = {
    ...f.data,
    classFeatures: f.data.classFeatures.filter(
      (row) => !(row.name === 'Deft Explorer' && row.source === 'TCE'),
    ),
  }
  missing.lookups = buildGameDataLookups(missing)
  await act(async () => {
    useGameDataStore.setState({ gameData: missing })
  })
  expect(await screen.findByText(/^Source unavailable\. Restore/)).toBeTruthy()
  expect(
    (screen.getByRole('tab', { name: /^Deft Explorer/ }) as HTMLElement).getAttribute(
      'aria-selected',
    ),
  ).toBe('true')
  expect(screen.queryByRole('button', { name: 'Natural Explorer' })).toBeNull()
  expect(JSON.stringify(active())).toBe(before)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
  await act(async () => {
    useGameDataStore.setState({ gameData: f.data })
  })
  expect(await screen.findByRole('group', { name: 'Canny expertise' })).toBeTruthy()
  expect(JSON.stringify(active())).toBe(before)
  await act(async () => {
    useGameDataStore.setState({ gameData: missing })
  })
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^Natural Explorer/ }), {
    button: 0,
    ctrlKey: false,
  })
  expect(active().optionalClassFeatureAdoptions).toEqual([])
})

test('replacement tabs keep keyboard focus separate from adoption and contain only the selected setup', async () => {
  const f = optionalPilotFixture()
  mount(f)
  fireEvent.click(
    (
      await screen.findByText('Level 1', { selector: '[data-slot="accordion-trigger"] span' })
    ).closest('button')!,
  )
  const before = JSON.stringify(active())
  const tab = screen.getByRole('tab', { name: /^Deft Explorer/ })
  fireEvent.focus(tab)
  expect(JSON.stringify(active())).toBe(before)
  expect(tab.getAttribute('aria-selected')).toBe('false')
  fireEvent.keyDown(tab, { key: 'Enter' })
  const panel = await screen.findByRole('tabpanel', { name: /^Deft Explorer/ })
  expect(within(panel).getByRole('group', { name: 'Canny expertise' })).toBeTruthy()
  expect(within(panel).getByRole('group', { name: 'Canny languages' })).toBeTruthy()
  expect(screen.queryByRole('tabpanel', { name: /^Natural Explorer/ })).toBeNull()
  expect(screen.getByRole('tab', { name: /^Favored Enemy/ }).getAttribute('aria-selected')).toBe(
    'true',
  )
})

test('the additional focus feature is a separate opt-in and creates no item, proficiency or spell', async () => {
  const f = optionalPilotFixture(2)
  mount(f)
  const level = (
    await screen.findByText('Level 2', { selector: '[data-slot="accordion-trigger"] span' })
  ).closest('button')!
  if (level.getAttribute('data-state') === 'closed') fireEvent.click(level)
  const before = structuredClone(active())
  fireEvent.click(screen.getByRole('checkbox', { name: /^Spellcasting Focus/ }))
  expect(active().optionalClassFeatureAdoptions!.map((row) => row.target)).toEqual([
    'class-feature|spellcasting focus|ranger|phb|2|tce',
  ])
  expect(active().equipment).toEqual(before.equipment)
  expect(active().proficiencies).toEqual(before.proficiencies)
  expect(active().spells).toEqual(before.spells)
})

test('Review routes the real Canny requirement to shared picker and strictly saves the selected proficient skill', async () => {
  const f = makeCannyFixture()
  mount(f, f.character, '/build/review')
  fireEvent.click(screen.getByText('Finish Canny expertise').closest('button')!)
  await screen.findByRole('dialog')
  fireEvent.click(await option('Survival'))
  await confirm()
  const saved = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(active())))
  expect(saved.proficiencies.expertise).toEqual(['survival'])
  expect(saved.proficiencies.skills).toEqual(f.character.proficiencies.skills)
  expect(saved.classChoiceSelections![0].kind).toBe('proficiency')
})

test('strict reopened no-op confirmation and immediate reopen/draft Cancel preserve bytes and dirty state', async () => {
  const f = makeCannyFixture()
  mount(f, configured(f))
  const before = JSON.stringify(active())
  await open('Canny expertise')
  await confirm()
  expect(JSON.stringify(active())).toBe(before)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
  await open('Canny expertise')
  fireEvent.click(await option('Survival'))
  fireEvent.click(await option('Nature'))
  fireEvent.click(footer('Cancel'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(JSON.stringify(active())).toBe(before)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
})

test('language replacement and Clear preserve sibling expertise and use the same modal quota', async () => {
  const f = makeCannyFixture()
  mount(f, configured(f))
  await open('Canny languages')
  fireEvent.click(await option('Elvish'))
  fireEvent.click(await option('Giant'))
  await confirm()
  expect(active().proficiencies.languages.slice().sort()).toEqual(['dwarvish', 'giant'])
  expect(active().proficiencies.expertise).toEqual(['survival'])
  await open('Canny languages')
  fireEvent.click(await option('Giant'))
  fireEvent.click(await option('Dwarvish'))
  await confirm()
  expect(active().proficiencies.languages).toEqual([])
  expect(active().proficiencies.expertise).toEqual(['survival'])
})

test('source refresh closes stale new picker without a write and exact restoration leaves setup reachable', async () => {
  const f = makeCannyFixture()
  mount(f)
  const before = JSON.stringify(active())
  await open('Canny expertise')
  fireEvent.click(await option('Survival'))
  const missing = {
    ...f.data,
    classFeatures: f.data.classFeatures.filter(
      (feature) => !(feature.name === 'Deft Explorer' && feature.source === 'TCE'),
    ),
  }
  missing.lookups = buildGameDataLookups(missing)
  await act(async () => {
    useGameDataStore.setState({ gameData: missing })
  })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(JSON.stringify(active())).toBe(before)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
  await act(async () => {
    useGameDataStore.setState({ gameData: f.data })
  })
  expect(screen.queryByRole('dialog')).toBeNull()
  await open('Canny expertise')
  expect((await option('Survival')).hasAttribute('disabled')).toBe(false)
  expect(JSON.stringify(active())).toBe(before)
})

test('saved source-unavailable choices retain removal-only recovery and Clear retracts only its own domain', async () => {
  const f = makeCannyFixture(),
    saved = configured(f)
  const missing = {
    ...f,
    data: {
      ...f.data,
      classFeatures: f.data.classFeatures.filter(
        (feature) => !(feature.name === 'Deft Explorer' && feature.source === 'TCE'),
      ),
    },
  }
  missing.data.lookups = buildGameDataLookups(missing.data)
  mount(missing, saved)
  fireEvent.click(
    (
      await screen.findByText('Level 1', { selector: '[data-slot="accordion-trigger"] span' })
    ).closest('button')!,
  )
  const card = await screen.findByRole('group', { name: 'Canny expertise' })
  fireEvent.click(within(card).getByRole('button', { name: 'Review saved choice' }))
  await screen.findByRole('dialog')
  fireEvent.click(await option('Survival'))
  await confirm()
  expect(active().classChoiceSelections!.map((selection) => selection.label)).toEqual([
    'Canny languages',
  ])
  expect(active().proficiencies.expertise).toEqual([])
  expect(characterPersistenceSchema.safeParse(active()).success).toBe(true)
})

test('Bard uses owned Expertise while Canny preserves overlap through removal of an earlier manual grant', async () => {
  const f = makeCannyFixture()
  const bard = parseClassDocument(
    JSON.parse(readFileSync('resources/srd/core/data/class/class-bard.json', 'utf8')),
  )
  f.data.classes.push(...(bard.classes as Class5e[]).filter((entry) => entry.source === 'PHB'))
  f.data.classFeatures.push(...(bard.classFeatures as ClassFeature[]))
  f.data.lookups = buildGameDataLookups(f.data)
  const manual = toggleExpertiseCommand(f.character, f.character.provenance!, 'survival')
  const before = {
    ...f.character,
    ...manual.characterPatch,
    provenance: manual.provenanceUpdate,
    classProgression: [...f.character.classProgression, { name: 'Bard', source: 'PHB', levels: 3 }],
  }
  const saved = selectCanny(f, 'expertise', ['Survival'], before)
  useGameDataStore.setState({ gameData: f.data })
  setActiveCharacter(saved)
  const { result } = renderHook(() => useSkills())
  expect(result.current.availableExpertiseSlots).toBe(0)
  expect(result.current.usedExpertiseSlots).toBe(1)
  const modifier = result.current.skills.find((skill) => skill.name === 'survival')!.modifier
  await act(async () => {
    result.current.toggleExpertise('survival')
  })
  expect(result.current.usedExpertiseSlots).toBe(0)
  expect(result.current.skills.find((skill) => skill.name === 'survival')!.modifier).toBe(modifier)
  expect(
    active().provenance!.proficiencies.expertise!.survival.map((tag) => tag.sourceType),
  ).toEqual(['class'])
  const authority = {
    classes: f.data.classes,
    feats: f.data.feats,
    catalogs: buildClassChoiceFeatureCatalogs(f.data),
  }
  const model = getSkillExpertiseChoices(active(), authority)
  expect(model.actions.nature.some((action) => action.kind === 'legacy' && action.adding)).toBe(
    false,
  )
  const action = model.actions.nature.find(
    (action) => action.adding && /Bard \(PHB\), level 3/.test(action.label),
  )!
  const selected = applySkillExpertiseActionCommand(active(), 'nature', action.id, authority)
  act(() => {
    useCharacterStore.getState().updateCharacter(active().id, {
      ...selected.characterPatch,
      provenance: selected.provenanceUpdate,
    })
  })
  expect(result.current.usedExpertiseSlots).toBe(0)
  expect(active().proficiencies.expertise).toContain('nature')
  expect(active().classChoiceSelections?.find((row) => row.className === 'Bard')).toMatchObject({
    classSource: 'PHB',
    classLevel: 3,
    selected: [{ name: 'Nature' }],
  })
  expect(active().provenance.proficiencies.expertise!.nature).toEqual([
    expect.objectContaining({
      sourceType: 'class',
      sourceName: 'Bard',
      sourceRef: 'PHB',
      grantVariant: action.ownerId,
    }),
  ])
  expect(characterPersistenceSchema.parse(JSON.parse(JSON.stringify(active())))).toEqual(active())
})

test('actual Languages rows use effective arrays and ownership through source loss and exact restoration without writes', async () => {
  const f = makeCannyFixture(),
    saved = configured(f)
  mount(f, saved, '/build/proficiencies')
  const before = JSON.stringify(active())
  fireEvent.click(screen.getByRole('tab', { name: /Languages/ }))
  expect(
    within(await screen.findByRole('button', { name: /^Elvish.*Granted$/ })).getByText('Granted'),
  ).toBeTruthy()
  const missing = {
    ...f.data,
    classFeatures: f.data.classFeatures.filter(
      (feature) => !(feature.name === 'Deft Explorer' && feature.source === 'TCE'),
    ),
  }
  missing.lookups = buildGameDataLookups(missing)
  await act(async () => {
    useGameDataStore.setState({ gameData: missing })
  })
  expect(
    within(await screen.findByRole('button', { name: /^Elvish.*Unavailable$/ })).getByText(
      'Unavailable',
    ),
  ).toBeTruthy()
  await act(async () => {
    useGameDataStore.setState({ gameData: f.data })
  })
  expect(
    within(await screen.findByRole('button', { name: /^Elvish.*Granted$/ })).getByText('Granted'),
  ).toBeTruthy()
  expect(JSON.stringify(active())).toBe(before)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
})

test('Review retains raw Canny detail context with an explicit source-unavailable badge and no read writes', async () => {
  const f = makeCannyFixture(),
    saved = { ...configured(f), allowedSources: ['PHB'] }
  mount(f, saved, '/build/review')
  const before = JSON.stringify(active())
  fireEvent.click(screen.getByRole('tab', { name: 'Character overview' }))
  fireEvent.click(screen.getByText('Traits & features', { selector: 'span' }).closest('summary')!)
  const features = screen.getByRole('heading', { name: 'Feature choices' }).parentElement!
  const expertise = within(features)
    .getByText('Canny expertise', { selector: 'span' })
    .closest('li')!
  expect(within(expertise).getByText('Source unavailable')).toBeTruthy()
  expect(within(expertise).getByText(/Double your proficiency bonus/)).toBeTruthy()
  expect(within(features).queryByText('Unresolved source')).toBeNull()
  expect(JSON.stringify(active())).toBe(before)
  expect(useCharacterStore.getState().isActiveCharacterDirty).toBe(false)
})
