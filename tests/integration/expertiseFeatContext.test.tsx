import { readFileSync } from 'node:fs'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import {
  commitFeatOptionsCommand,
  replaceBonusFeatSelectionsCommand,
  replaceFeatSelectionsCommand,
} from '@/lib/character/commands/featCommands'
import { featSetupOwnerTarget, getFeatSetupOwners } from '@/lib/character/featSetupOwners'
import { BuildProficienciesPage } from '@/pages/build/proficiencies/ProficienciesPage'
import { FeatsPage } from '@/pages/feats/FeatsPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Feat5e } from '@/types/5etools'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeClassProficiencyFixture } from '../fixtures/classProficiencyFixtures'

const active = () => useCharacterStore.getState().activeCharacter!
function skillCircle(skill: string, name: string) {
  return within(screen.getByLabelText(`${skill} proficiency`, { selector: 'fieldset' })).getByRole(
    'button',
    { name },
  )
}
function fixture(classSource: 'PHB' | 'XPHB' = 'PHB') {
  const f = makeClassProficiencyFixture('Rogue', classSource, 1)
  f.data.feats = JSON.parse(
    readFileSync('tests/fixtures/expertiseFeatSources.json', 'utf8'),
  ) as Feat5e[]
  f.data.lookups = buildGameDataLookups(f.data)
  for (const command of [replaceFeatSelectionsCommand, replaceBonusFeatSelectionsCommand]) {
    const result = command(f.character, f.character.provenance!, [
      { name: 'Skill Expert', source: 'TCE' },
    ])
    f.character = { ...f.character, ...result.characterPatch, provenance: result.provenanceUpdate }
  }
  return f
}
beforeEach(() => resetCharacterStore())
afterEach(() => {
  cleanup()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})
function mount(
  f: ReturnType<typeof fixture>,
  route = '/build/proficiencies',
  links: string[] = [],
) {
  useGameDataStore.setState({ gameData: f.data })
  setActiveCharacter(f.character)
  return render(
    <MemoryRouter initialEntries={[route]}>
      {links.map((link, index) => (
        <Link key={link} to={link}>
          Test destination {index}
        </Link>
      ))}
      <Routes>
        <Route path="/build/proficiencies" element={<BuildProficienciesPage />} />
        <Route path="/feats" element={<FeatsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}
const modal = () => within(screen.getByRole('dialog'))

test.each([
  'TCE',
  'XPHB',
])('%s full feat editor excludes a skill removed by the same Finish and accepts the new declared skill', async (source) => {
  const f = fixture(source === 'XPHB' ? 'XPHB' : 'PHB')
  f.character.proficiencies.skills = ['nature']
  const data = f.data.feats.find((feat) => feat.name === 'Skill Expert' && feat.source === source)!
  const selected = replaceBonusFeatSelectionsCommand(f.character, f.character.provenance, [data])
  f.character = {
    ...f.character,
    ...selected.characterPatch,
    provenance: selected.provenanceUpdate,
  }
  const setup = commitFeatOptionsCommand(
    f.character,
    f.character.provenance,
    { ...data, selectionKind: 'bonus' },
    { abilityScore: 'dex', skills: ['stealth'], expertiseSkill: 'nature' },
  )
  f.character = { ...f.character, ...setup.characterPatch, provenance: setup.provenanceUpdate }
  const owner = getFeatSetupOwners(f.character, f.data.feats).find((row) => row.view === 'bonus')!
  mount(f, featSetupOwnerTarget(owner))
  fireEvent.click(screen.getByRole('button', { name: 'Edit Setup' }))
  fireEvent.click(
    within(screen.getByRole('alertdialog', { name: 'Edit feat setup?' })).getByRole('button', {
      name: 'Continue',
    }),
  )
  fireEvent.click(modal().getByRole('button', { name: 'Next' }))
  fireEvent.click(modal().getByRole('checkbox', { name: /^stealth$/i }))
  fireEvent.click(modal().getByRole('checkbox', { name: /^arcana$/i }))
  fireEvent.click(modal().getByRole('button', { name: 'Next' }))
  expect(modal().queryByRole('button', { name: /^stealth$/i })).toBeNull()
  fireEvent.click(modal().getByRole('button', { name: /^arcana$/i }))
  fireEvent.click(modal().getByRole('button', { name: 'Finish' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(active().specialFeats![0].options).toEqual({
    abilityScore: 'dex',
    skills: ['arcana'],
    expertiseSkill: 'arcana',
  })
  expect(active().proficiencies.skills).not.toContain('stealth')
  expect(active().proficiencies.expertise).toEqual(['arcana'])
})

test('partial Complete Setup offers deliberate full Clear without inventing or removing underlying proficiency', async () => {
  const f = fixture()
  const data = f.data.feats.find((feat) => feat.name === 'Skill Expert' && feat.source === 'TCE')!
  const setup = commitFeatOptionsCommand(
    f.character,
    f.character.provenance,
    { ...data, selectionKind: 'bonus' },
    { expertiseSkill: 'stealth' },
  )
  f.character = { ...f.character, ...setup.characterPatch, provenance: setup.provenanceUpdate }
  const owner = getFeatSetupOwners(f.character, f.data.feats).find((row) => row.view === 'bonus')!
  mount(f, featSetupOwnerTarget(owner))
  expect(screen.getByText('Setup pending')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Complete Setup' }))
  fireEvent.click(modal().getByRole('button', { name: 'Clear saved setup' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(active().specialFeats![0].options).toEqual({})
  expect(active().proficiencies.expertise).toEqual([])
  expect(active().proficiencies.skills).toContain('stealth')
  expect(active().feats[0].options).toBeUndefined()
})
test.each([
  'feat',
  'source',
])('an explicit conflicting %s field cannot focus a valid otherwise unique feat owner', (field) => {
  const f = fixture()
  const owner = getFeatSetupOwners(f.character, f.data.feats).find(
    (row) => row.view === 'character',
  )!
  const target = new URL(featSetupOwnerTarget(owner), 'https://local.invalid')
  target.searchParams.set(field, 'Conflicting')
  mount(f, target.pathname + target.search)
  expect(
    screen.getByRole('button', { name: 'Select Skill Expert' }).getAttribute('aria-pressed'),
  ).toBe('false')
  expect(screen.queryByRole('dialog')).toBeNull()
})
test('inline bonus Expertise preserves its exact owner, completes partial setup on Feats and clears only Expertise in source recovery', async () => {
  const f = fixture()
  mount(f)
  expect(screen.queryByRole('region', { name: 'Expertise choices' })).toBeNull()
  fireEvent.pointerDown(skillCircle('Stealth', 'Choose expertise source: Stealth'), {
    button: 0,
    ctrlKey: false,
  })
  const before = JSON.stringify(active())
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  expect(JSON.stringify(active())).toBe(before)
  fireEvent.pointerDown(skillCircle('Stealth', 'Choose expertise source: Stealth'), {
    button: 0,
    ctrlKey: false,
  })
  fireEvent.click(
    await screen.findByRole('menuitem', { name: /Use Skill Expert \(TCE\) — Bonus feat/ }),
  )
  expect(active().specialFeats![0].options).toEqual({ expertiseSkill: 'stealth' })
  expect(active().feats[0].options).toBeUndefined()
  expect(active().provenance.proficiencies.skills.stealth).toBeUndefined()
  const selected = active()
  const owner = getFeatSetupOwners(selected, f.data.feats).find((row) => row.view === 'bonus')!
  cleanup()
  mount({ ...f, character: selected }, featSetupOwnerTarget(owner))
  fireEvent.click(screen.getByRole('button', { name: 'Complete Setup' }))
  fireEvent.click(modal().getByRole('button', { name: 'Dexterity' }))
  fireEvent.click(modal().getByRole('button', { name: 'Next' }))
  fireEvent.click(modal().getByRole('checkbox', { name: /^acrobatics$/i }))
  fireEvent.click(modal().getByRole('button', { name: 'Next' }))
  fireEvent.click(modal().getByRole('button', { name: 'Finish' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(active().specialFeats![0].options).toEqual({
    abilityScore: 'dex',
    skills: ['acrobatics'],
    expertiseSkill: 'stealth',
  })
  expect(active().feats[0].options).toBeUndefined()
  const configured = active()
  cleanup()
  const missing = { ...f.data, feats: [] }
  missing.lookups = buildGameDataLookups(missing)
  mount({ ...f, data: missing, character: configured })
  const circle = skillCircle('Stealth', 'Choose expertise source: Stealth')
  expect(circle.getAttribute('aria-pressed')).toBe('false')
  const sources = within(screen.getByRole('heading', { name: /^Sources/ })).getByRole('button', {
    name: /^Sources/,
  })
  if (sources.getAttribute('data-state') === 'closed') fireEvent.click(sources)
  expect(screen.getByText(/Stealth — retained, inactive/i)).toBeTruthy()
  fireEvent.pointerDown(circle, { button: 0, ctrlKey: false })
  fireEvent.click(
    await screen.findByRole('menuitem', { name: /Remove from Skill Expert \(TCE\) — Bonus feat/ }),
  )
  expect(active().specialFeats![0].options).toEqual({ abilityScore: 'dex', skills: ['acrobatics'] })
  expect(active().proficiencies.skills).toContain('stealth')
  expect(active().proficiencies.skills).toContain('acrobatics')
  expect(active().feats[0].options).toBeUndefined()
})

test('owner links react on the current Feats page and a stale bonus owner never focuses the ordinary copy', async () => {
  const f = fixture()
  f.character.feats[0].options = {}
  const owners = getFeatSetupOwners(f.character, f.data.feats)
  const ordinary = featSetupOwnerTarget(owners.find((row) => row.view === 'character')!)
  const bonus = featSetupOwnerTarget(owners.find((row) => row.view === 'bonus')!)
  mount(f, ordinary, [bonus, ordinary])
  expect(
    screen.getByRole('button', { name: 'Select Skill Expert' }).getAttribute('aria-pressed'),
  ).toBe('true')
  const before = JSON.stringify(active())
  fireEvent.click(screen.getByRole('link', { name: 'Test destination 0' }))
  await waitFor(() =>
    expect(
      within(screen.getByRole('button', { name: 'Select Skill Expert' }).parentElement!).getByText(
        'Bonus',
        { selector: 'span' },
      ),
    ).toBeTruthy(),
  )
  expect(
    screen.getByRole('button', { name: 'Select Skill Expert' }).getAttribute('aria-pressed'),
  ).toBe('true')
  expect(JSON.stringify(active())).toBe(before)
  act(() => {
    const result = replaceBonusFeatSelectionsCommand(active(), active().provenance!, [])
    useCharacterStore.getState().updateCharacter(active().id, {
      ...result.characterPatch,
      provenance: result.provenanceUpdate,
    })
  })
  expect(screen.queryByRole('button', { name: 'Select Skill Expert' })).toBeNull()
  fireEvent.click(screen.getByRole('link', { name: 'Test destination 1' }))
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Select Skill Expert' }).getAttribute('aria-pressed'),
    ).toBe('true'),
  )
  cleanup()
  mount({ ...f, character: active() }, '/build/proficiencies')
  expect(screen.queryByRole('region', { name: 'Expertise choices' })).toBeNull()
  expect(skillCircle('Stealth', 'Choose expertise source: Stealth')).toBeTruthy()
})
