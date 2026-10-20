import { readFileSync } from 'node:fs'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceOptions'
import {
  replaceBonusFeatSelectionsCommand,
  resolveProficiencyChoiceCommand,
} from '@/lib/character/commands/featCommands'
import { applySkillExpertiseActionCommand } from '@/lib/character/commands/skillExpertiseCommands'
import { getSkillExpertiseChoices } from '@/lib/character/skillExpertiseChoices'
import { applyClassGrants } from '@/lib/provenance/applyClassGrants'
import { BuildClassPage } from '@/pages/build/class/ClassPage'
import { BuildProficienciesPage } from '@/pages/build/proficiencies/ProficienciesPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Feat5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCannyFixture } from '../fixtures/cannyFixtures'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeClassProficiencyFixture } from '../fixtures/classProficiencyFixtures'
import { makeKnowledgeFixture } from '../fixtures/knowledgeProficiencyFixtures'
import { makeOptionalDeclarationCatalog } from '../fixtures/optionalClassDeclarationFixtures'
import { makeOptionalClassSourceData } from '../fixtures/optionalClassFeatureFixtures'

beforeEach(() => {
  resetCharacterStore()
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
const active = () => useCharacterStore.getState().activeCharacter!
function mount(
  f: { data: ReturnType<typeof makeClassProficiencyFixture>['data']; character: Character },
  route = '/build/class',
) {
  useGameDataStore.setState({ gameData: f.data })
  setActiveCharacter(f.character)
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
  const trigger = (
    await screen.findByText(`Level ${level}`, { selector: '[data-slot="accordion-trigger"] span' })
  ).closest('button')!
  if (trigger.getAttribute('data-state') === 'closed') fireEvent.click(trigger)
}

test('Class proficiency hint appears only while actual proficiency choices remain, independent of unfinished Expertise', async () => {
  const f = makeClassProficiencyFixture('Rogue', 'PHB', 1)
  f.cls.startingProficiencies = {
    skills: [{ choose: { from: ['stealth', 'perception'], count: 2 } }],
  }
  f.character.proficiencies.skills = []
  f.character.provenance = applyClassGrants(
    { name: f.cls.name, source: f.cls.source, startingProficiencies: f.cls.startingProficiencies },
    undefined,
    f.character.provenance!,
  )
  mount(f)
  await openLevel(1)
  const hint = 'You still have proficiency choices to make.'
  expect(screen.getByRole('link', { name: hint }).getAttribute('href')).toBe('/build/proficiencies')
  const choose = (name: string, adding: boolean) => {
    const result = resolveProficiencyChoiceCommand(
      active(),
      active().provenance!,
      'skills',
      name,
      adding,
    )
    useCharacterStore.getState().updateCharacter(active().id, {
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
  }
  act(() => {
    choose('stealth', true)
    choose('perception', true)
  })
  expect(screen.queryByRole('link', { name: hint })).toBeNull()
  expect(screen.getByText('0 / 2 chosen')).toBeTruthy()
  act(() => {
    choose('perception', false)
  })
  expect(screen.getByRole('link', { name: hint })).toBeTruthy()
})

const modal = () => within(screen.getByRole('dialog'))
const footer = (name: string) => modal().getByText(name, { selector: 'button' })
function option(name: string) {
  fireEvent.change(modal().getByPlaceholderText('Search available options'), {
    target: { value: name },
  })
  return modal().findByRole('button', { name: new RegExp(`^${name}\\b`) })
}
async function confirm() {
  fireEvent.click(footer('Confirm'))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

function skillCircle(skill: string, name: string | RegExp) {
  return within(screen.getByLabelText(`${skill} proficiency`, { selector: 'fieldset' })).getByRole(
    'button',
    { name },
  )
}
async function circleAction(skill: string, source: RegExp) {
  const button = skillCircle(skill, new RegExp('expertise.*: ' + skill + '$', 'i'))
  if (button.getAttribute('aria-label')?.startsWith('Choose expertise source')) {
    fireEvent.pointerDown(button, { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitem', { name: source }))
  } else fireEvent.click(button)
}

test('Knowledge circle grants proficiency with Expertise, records subclass ownership, and Class edits the same pair', async () => {
  const f = makeKnowledgeFixture('XPHB', 'FRHoF')
  mount(f, '/build/proficiencies')
  const circle = skillCircle('Arcana', 'Add expertise: Arcana')
  expect(circle.hasAttribute('disabled')).toBe(false)
  fireEvent.click(circle)
  expect(active().proficiencies.skills).toEqual(['arcana'])
  expect(active().proficiencies.expertise).toEqual(['arcana'])
  expect(screen.getByLabelText('1 Expertise choices remaining')).toBeTruthy()
  const sources = within(screen.getByRole('heading', { name: /^Sources/ })).getByRole('button', {
    name: /^Sources/,
  })
  if (sources.getAttribute('data-state') === 'closed') fireEvent.click(sources)
  expect(within(screen.getByText('Expertise:').parentElement!).getByText('(subclass)')).toBeTruthy()
  const saved = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(active())))
  cleanup()
  mount({ ...f, character: saved })
  await openLevel(3)
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Blessings of Knowledge expertise' })).getByRole(
      'button',
      { name: 'Edit' },
    ),
  )
  expect(
    modal().getByText('Choose up to 2 skills. Each gains proficiency and Expertise.'),
  ).toBeTruthy()
  expect(modal().queryByRole('link', { name: 'Choose proficiencies' })).toBeNull()
  fireEvent.click(await option('History'))
  await confirm()
  expect(active().proficiencies.skills.sort()).toEqual(['arcana', 'history'])
  expect(active().proficiencies.expertise.sort()).toEqual(['arcana', 'history'])
  expect(active().classChoiceSelections?.filter((row) => row.kind === 'proficiency')).toHaveLength(
    1,
  )
})

test.each([
  ['Rogue', 1],
  ['Bard', 3],
] as const)('pending %s chooses proficiencies then source-owned Expertise; Class reopens the same choices', async (name, level) => {
  const f = makeClassProficiencyFixture(name, 'PHB', level)
  f.cls.startingProficiencies = {
    skills: [{ choose: { from: ['stealth', 'perception', 'nature', 'survival'], count: 4 } }],
  }
  f.character.proficiencies.skills = []
  f.character.proficiencies.tools = []
  f.character.provenance = applyClassGrants(
    { name: f.cls.name, source: f.cls.source, startingProficiencies: f.cls.startingProficiencies },
    undefined,
    f.character.provenance,
  )
  mount(f)
  await openLevel(level)
  fireEvent.click(
    within(screen.getByLabelText('Expertise', { selector: 'fieldset' })).getByRole('button', {
      name: 'Choose',
    }),
  )
  expect(modal().getByText(/Choose up to 2 proficient options\./)).toBeTruthy()
  expect(modal().getByRole('link', { name: 'Choose proficiencies' }).getAttribute('href')).toBe(
    '/build/proficiencies',
  )
  fireEvent.click(modal().getByRole('link', { name: 'Choose proficiencies' }))
  expect(screen.queryByRole('region', { name: 'Expertise choices' })).toBeNull()
  expect(screen.queryByRole('dialog')).toBeNull()
  const marker = skillCircle('Stealth', 'No expertise: Stealth')
  expect(marker.querySelectorAll('[data-expertise-indicator]')).toHaveLength(1)
  expect(marker.querySelector('[data-expertise-indicator]')?.classList.contains('size-4')).toBe(
    true,
  )
  expect(marker.hasAttribute('disabled')).toBe(true)
  expect(screen.getByLabelText('2 Expertise choices remaining')).toBeTruthy()
  fireEvent.click(screen.getByTitle('Choose Stealth'))
  fireEvent.click(screen.getByTitle('Choose Perception'))
  expect(skillCircle('Stealth', 'Add expertise: Stealth').getAttribute('aria-pressed')).toBe(
    'false',
  )
  await circleAction('Stealth', /Use Expertise/)
  await circleAction('Perception', /Use Expertise/)
  const saved = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(active())))
  expect(saved.proficiencies.expertise.sort()).toEqual(['perception', 'stealth'])
  expect(saved.classChoiceSelections?.[0].className).toBe(name)
  expect(saved.classChoiceSelections?.[0].classLevel).toBe(level)
  expect(screen.queryByLabelText('2 Expertise choices remaining')).toBeNull()
  expect(skillCircle('Stealth', 'Remove expertise: Stealth').getAttribute('aria-pressed')).toBe(
    'true',
  )
  const sources = within(screen.getByRole('heading', { name: /^Sources/ })).getByRole('button', {
    name: /^Sources/,
  })
  if (sources.getAttribute('data-state') === 'closed') fireEvent.click(sources)
  expect(within(screen.getByText('Expertise:').parentElement!).getByText('(class)')).toBeTruthy()
  expect(screen.queryByText(new RegExp(`Expertise.*${name} \\(PHB\\), level ${level}`))).toBeNull()
  cleanup()
  mount({ ...f, character: saved })
  await openLevel(level)
  fireEvent.click(
    within(screen.getByLabelText('Expertise', { selector: 'fieldset' })).getByRole('button', {
      name: 'Edit',
    }),
  )
  const unchanged = JSON.stringify(active())
  fireEvent.click(await option('Stealth'))
  fireEvent.click(footer('Cancel'))
  expect(JSON.stringify(active())).toBe(unchanged)
  fireEvent.click(
    within(screen.getByLabelText('Expertise', { selector: 'fieldset' })).getByRole('button', {
      name: 'Edit',
    }),
  )
  await confirm()
  expect(JSON.stringify(active())).toBe(unchanged)
})

test.each([
  'PHB',
  'XPHB',
])('%s circles address separate Rogue gains and allow exact retained-source recovery', async (source) => {
  const f = makeClassProficiencyFixture('Rogue', source, 6)
  mount(f, '/build/proficiencies')
  await circleAction('Nature', /Use Expertise.*level 6/)
  expect(
    active().classChoiceSelections?.map((row) => [row.classLevel, row.selected.length]),
  ).toEqual([[6, 1]])
  await circleAction('Nature', /Remove from Expertise.*level 6/)
  expect(active().classChoiceSelections ?? []).toEqual([])
  await circleAction('Stealth', /Use Expertise.*level 1/)
  const saved = active(),
    before = JSON.stringify(saved)
  cleanup()
  const missing = { ...f.data, classFeatures: [] }
  missing.lookups = buildGameDataLookups(missing)
  mount({ ...f, data: missing, character: saved }, '/build/proficiencies')
  expect(skillCircle('Stealth', 'Remove expertise: Stealth').getAttribute('aria-pressed')).toBe(
    'false',
  )
  expect(JSON.stringify(active())).toBe(before)
  const sources = within(screen.getByRole('heading', { name: /^Sources/ })).getByRole('button', {
    name: /^Sources/,
  })
  if (sources.getAttribute('data-state') === 'closed') fireEvent.click(sources)
  expect(screen.getByText(/Stealth — retained, inactive/i)).toBeTruthy()
  await circleAction('Stealth', /Remove from Expertise/)
  expect(active().classChoiceSelections ?? []).toEqual([])
})

test('Class modal admits a skill after its feat source is suspended and preserves that saved owner on restoration', async () => {
  const f = makeClassProficiencyFixture('Rogue', 'XPHB', 1)
  const feat = (
    JSON.parse(readFileSync('tests/fixtures/expertiseFeatSources.json', 'utf8')) as Feat5e[]
  ).find((row) => row.name === 'Skill Expert' && row.source === 'TCE')!
  f.data.feats = [feat]
  const authority = {
    classes: f.data.classes,
    feats: [feat],
    catalogs: buildClassChoiceFeatureCatalogs(f.data),
  }
  const selection = replaceBonusFeatSelectionsCommand(f.character, f.character.provenance, [feat])
  f.character = characterPersistenceSchema.parse({
    ...f.character,
    ...selection.characterPatch,
    provenance: selection.provenanceUpdate,
  })
  const action = getSkillExpertiseChoices(f.character, authority).actions.stealth.find(
    (row) => row.kind === 'feat' && row.adding,
  )!
  const pick = applySkillExpertiseActionCommand(f.character, 'stealth', action.id, authority)
  f.character = characterPersistenceSchema.parse({
    ...f.character,
    ...pick.characterPatch,
    provenance: pick.provenanceUpdate,
  })
  f.data.feats = []
  f.data.lookups = buildGameDataLookups(f.data)
  mount(f)
  await openLevel(1)
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Expertise' })).getByRole('button', {
      name: 'Choose',
    }),
  )
  fireEvent.click(await option('Stealth'))
  fireEvent.click(await option('Perception'))
  await confirm()
  const selected = active()
  expect(selected.specialFeats![0].options).toEqual({ expertiseSkill: 'stealth' })
  expect(selected.classChoiceSelections?.[0].selected.map((row) => row.name).sort()).toEqual([
    'Perception',
    'Stealth',
  ])
  cleanup()
  f.data.feats = [feat]
  f.data.lookups = buildGameDataLookups(f.data)
  mount({ ...f, character: selected }, '/build/proficiencies')
  expect(
    skillCircle('Stealth', 'Choose expertise source: Stealth').getAttribute('aria-pressed'),
  ).toBe('true')
  await circleAction('Stealth', /Remove from Expertise/)
  expect(getSkillExpertiseChoices(active(), authority).effective.proficiencies.expertise).toContain(
    'stealth',
  )
  await circleAction('Stealth', /Remove from Skill Expert/)
  expect(
    getSkillExpertiseChoices(active(), authority).effective.proficiencies.expertise,
  ).not.toContain('stealth')
})

test('optional OFF removes actual Deft Explorer/Favored Foe entries and selected details; ON restores them and base features remain', async () => {
  const { data } = makeOptionalClassSourceData()
  data.skills = makeCannyFixture().data.skills
  data.languages = makeCannyFixture().data.languages
  data.lookups = buildGameDataLookups(data)
  const f = { data, character: makeCannyFixture(1).character }
  mount(f)
  await openLevel(1)
  expect(screen.getByRole('group', { name: 'Canny expertise' })).toBeTruthy()
  expect(
    active().optionalClassFeatureAdoptions?.some((row) => row.target.includes('favored foe')),
  ).toBe(false)
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Favored Foe' }), {
    button: 0,
    ctrlKey: false,
  })
  expect(
    active().optionalClassFeatureAdoptions?.some(
      (row) => row.target === 'class-feature|favored foe|ranger|phb|1|tce',
    ),
  ).toBe(true)
  fireEvent.click(
    within(screen.getByRole('tabpanel', { name: 'Favored Foe' })).getByRole('button', {
      name: /^Favored Foe/,
    }),
  )
  expect(screen.getByRole('heading', { name: 'Favored Foe' })).toBeTruthy()
  await act(async () => {
    useCharacterStore.getState().updateCharacter(active().id, {
      variantRules: { ...active().variantRules, optionalClassFeatures: false },
    })
  })
  expect(screen.queryByText('Deft Explorer', { selector: 'span' })).toBeNull()
  expect(screen.queryByRole('group', { name: 'Canny expertise' })).toBeNull()
  expect(screen.queryByRole('button', { name: /^Favored Foe/ })).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Favored Foe' })).toBeNull()
  expect(screen.getByRole('button', { name: /^Favored Enemy/ })).toBeTruthy()
  await act(async () => {
    useCharacterStore.getState().updateCharacter(active().id, {
      variantRules: { ...active().variantRules, optionalClassFeatures: true },
    })
  })
  expect(screen.getByRole('group', { name: 'Canny expertise' })).toBeTruthy()
  expect(
    within(screen.getByRole('tabpanel', { name: 'Favored Foe' })).getByRole('button', {
      name: /^Favored Foe/,
    }),
  ).toBeTruthy()
})

test('selected actual Battle Master wrapper refreshes nested optional details OFF/ON while keeping base siblings', async () => {
  const source = JSON.parse(readFileSync('tests/fixtures/optionalClassSources.json', 'utf8'))
  const { data } = makeOptionalDeclarationCatalog(
    'class/class-fighter.json',
    ['subclass', 'fighter', 'phb', 'battle master', 'phb'],
    (document) => {
      document.subclassFeature.push(
        source.subclassFeature.find(
          (row: { name: string; source: string }) =>
            row.name === 'Student of War' && row.source === 'PHB',
        ),
      )
    },
  )
  const f = makeClassProficiencyFixture()
  f.data = { ...data, skills: f.data.skills, languages: f.data.languages }
  f.data.lookups = buildGameDataLookups(f.data)
  f.character.classProgression = [
    { name: 'Fighter', source: 'PHB', levels: 3, subclass: 'Battle Master', subclassSource: 'PHB' },
  ]
  f.character.variantRules = { optionalClassFeatures: true }
  mount(f)
  await openLevel(3)
  fireEvent.click(screen.getByRole('button', { name: 'Battle Master' }))
  expect(screen.queryByText(/If you have access to maneuvers/)).toBeNull()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Maneuver Options' }))
  fireEvent.click(screen.getByRole('button', { name: 'Battle Master' }))
  expect(await screen.findByText(/If you have access to maneuvers/)).toBeTruthy()
  await act(async () => {
    useCharacterStore
      .getState()
      .updateCharacter(active().id, { variantRules: { optionalClassFeatures: false } })
  })
  expect(screen.queryByText(/If you have access to maneuvers/)).toBeNull()
  expect(screen.getByText(/At 3rd level, you gain proficiency with one type/)).toBeTruthy()
  expect(screen.getByText(/When you choose this archetype at 3rd level/)).toBeTruthy()
  await act(async () => {
    useCharacterStore
      .getState()
      .updateCharacter(active().id, { variantRules: { optionalClassFeatures: true } })
  })
  expect(screen.getByText(/If you have access to maneuvers/)).toBeTruthy()
})
