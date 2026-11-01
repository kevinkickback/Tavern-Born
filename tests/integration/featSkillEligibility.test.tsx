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
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test } from 'vitest'
import { FeatOptionsModal } from '@/components/modals/FeatOptionsModal'
import { useFeatProvenanceMutations } from '@/hooks/character/useFeatProvenanceMutations'
import { isAuditedSkilledFeat } from '@/lib/5etools/featSkillRules'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { applyManualProficiencyCommand } from '@/lib/character/commands/equipmentCommands'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import {
  commitFeatOptionsCommand,
  replaceBonusFeatSelectionsCommand,
  replaceFeatSelectionsCommand,
} from '@/lib/character/commands/featCommands'
import { canChangeFeatExpertise } from '@/lib/character/featExpertiseSelections'
import { canChangeSkilledSkills, getSkilledSkillPool } from '@/lib/character/featSkillSelections'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Feat5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import { makeClassProficiencyFixture } from '../fixtures/classProficiencyFixtures'
import { manualExpertiseFixtureGrant } from '../fixtures/manualProficiency'

const skilled = JSON.parse(
  readFileSync('tests/fixtures/skilledFeatSources.json', 'utf8'),
) as Feat5e[]
const experts = JSON.parse(
  readFileSync('tests/fixtures/expertiseFeatSources.json', 'utf8'),
) as Feat5e[]
const active = () => useCharacterStore.getState().activeCharacter!
afterEach(() => {
  cleanup()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})
function fixture(name: string, source: string) {
  resetCharacterStore()
  const f = makeClassProficiencyFixture('Rogue', source === 'XPHB' ? 'XPHB' : 'PHB', 1)
  f.data.feats = [...skilled, ...experts]
  f.data.lookups = buildGameDataLookups(f.data)
  const feat = f.data.feats.find((row) => row.name === name && row.source === source)!
  const target = { ...feat, selectionKind: 'bonus' as const }
  for (const command of [replaceBonusFeatSelectionsCommand, replaceFeatSelectionsCommand])
    f.character = applyCharacterCommandResult(
      f.character,
      command(f.character, f.character.provenance, [feat]),
    )
  return { ...f, feat, target }
}
function store(f: ReturnType<typeof fixture>) {
  useGameDataStore.setState({ gameData: f.data })
  setActiveCharacter(f.character)
}

test.each([
  'PHB',
  'XPHB',
])('%s Skilled picker and save reject existing proficiency, retain exact own Edit choices and reopen', async (source) => {
  const f = fixture('Skilled', source)
  store(f)
  const { result } = renderHook(() => useFeatProvenanceMutations())
  const before = active()
  act(() => result.current.commitFeatWithOptions(f.target, { skills: ['stealth'] }))
  expect(active()).toBe(before)
  render(
    <MemoryRouter>
      <FeatOptionsModal
        open
        onOpenChange={() => {}}
        feat={f.feat}
        optionTarget={f.target}
        onFinish={(options) => result.current.commitFeatWithOptions(f.target, options)}
      />
    </MemoryRouter>,
  )
  const dialog = within(screen.getByRole('dialog'))
  expect(dialog.getByText('Choose 3 skills')).toBeTruthy()
  expect(dialog.queryByRole('checkbox', { name: /^stealth$/i })).toBeNull()
  for (const name of ['acrobatics', 'athletics', 'deception'])
    fireEvent.click(dialog.getByRole('checkbox', { name: new RegExp('^' + name + '$', 'i') }))
  fireEvent.click(dialog.getByRole('button', { name: 'Finish' }))
  await waitFor(() => expect(active().specialFeats?.[0].options?.skills).toHaveLength(3))
  const saved = characterPersistenceSchema.parse(JSON.parse(JSON.stringify(active())))
  expect(saved.feats[0].options).toBeUndefined()
  expect(getSkilledSkillPool(saved, saved, f.target, f.data.feats)).toContain('acrobatics')
  const ordinary = { ...f.target, selectionKind: 'ordinary' as const }
  expect(getSkilledSkillPool(saved, saved, ordinary, f.data.feats)).not.toContain('acrobatics')
  expect(
    canChangeSkilledSkills(
      saved,
      saved,
      f.target,
      { skills: [' Acrobatics ', 'athletics', 'deception'] },
      f.data.feats,
    ),
  ).toBe(true)
  act(() => result.current.clearFeatWithOptions(f.target, saved.specialFeats![0].options!))
  expect(active().proficiencies.skills).not.toContain('acrobatics')
  expect(active().proficiencies.skills).toContain('stealth')
  expect(characterPersistenceSchema.safeParse(active()).success).toBe(true)
})

test('Skilled rechecks a new proficiency gained while its picker is open before Finish or mutation', () => {
  const f = fixture('Skilled', 'PHB')
  store(f)
  const { result } = renderHook(() => useFeatProvenanceMutations())
  render(
    <MemoryRouter>
      <FeatOptionsModal
        open
        onOpenChange={() => {}}
        feat={f.feat}
        optionTarget={f.target}
        onFinish={(options) => result.current.commitFeatWithOptions(f.target, options)}
      />
    </MemoryRouter>,
  )
  const dialog = within(screen.getByRole('dialog'))
  for (const name of ['acrobatics', 'athletics', 'deception'])
    fireEvent.click(dialog.getByRole('checkbox', { name: new RegExp('^' + name + '$', 'i') }))
  const finish = dialog.getByRole('button', { name: 'Finish' })
  expect(finish.hasAttribute('disabled')).toBe(false)
  act(() => {
    const current = active()
    const change = applyManualProficiencyCommand(
      current,
      current.provenance,
      'skills',
      'acrobatics',
      true,
    )
    useCharacterStore.getState().updateCharacter(current.id, {
      ...change.characterPatch,
      provenance: change.provenanceUpdate,
    })
  })
  expect(finish.hasAttribute('disabled')).toBe(true)
  expect(dialog.getByText('Already proficient')).toBeTruthy()
  const before = active()
  act(() =>
    result.current.commitFeatWithOptions(f.target, {
      skills: ['acrobatics', 'athletics', 'deception'],
    }),
  )
  expect(active()).toBe(before)
  fireEvent.click(dialog.getByRole('checkbox', { name: /^acrobatics/i }))
  fireEvent.click(dialog.getByRole('checkbox', { name: /^performance$/i }))
  expect(finish.hasAttribute('disabled')).toBe(false)
  fireEvent.click(finish)
  expect(active().specialFeats![0].options?.skills).toEqual([
    'athletics',
    'deception',
    'performance',
  ])
  expect(active().proficiencies.skills).toContain('acrobatics')
  expect(characterPersistenceSchema.safeParse(active()).success).toBe(true)
})

test('Skilled retains source-unavailable own picks and independent overlap but rejects additions, changed sources and stale new proficiency', () => {
  const f = fixture('Skilled', 'PHB')
  f.character = applyCharacterCommandResult(
    f.character,
    commitFeatOptionsCommand(f.character, f.character.provenance, f.target, {
      skills: ['acrobatics'],
    }),
  )
  f.character = applyCharacterCommandResult(
    f.character,
    applyManualProficiencyCommand(
      f.character,
      f.character.provenance,
      'skills',
      'acrobatics',
      true,
    ),
  )
  for (const feats of [
    [],
    [f.feat, f.feat],
    [{ ...f.feat, entries: ['Changed'] }],
    [{ ...f.feat, expertise: [{ anyProficientSkill: 1 }] }],
  ]) {
    expect(
      canChangeSkilledSkills(f.character, f.character, f.target, { skills: ['acrobatics'] }, feats),
    ).toBe(true)
    expect(
      canChangeSkilledSkills(f.character, f.character, f.target, { skills: ['athletics'] }, feats),
    ).toBe(false)
  }
  expect(isAuditedSkilledFeat(f.feat)).toBe(true)
  expect(
    canChangeSkilledSkills(
      f.character,
      f.character,
      f.target,
      { skills: ['acrobatics', ' ACROBATICS '] },
      f.data.feats,
    ),
  ).toBe(false)
  store(f)
  const { result } = renderHook(() => useFeatProvenanceMutations())
  const before = active()
  act(() =>
    result.current.editFeatWithOptions(f.target, { skills: ['stale'] }, { skills: ['stealth'] }),
  )
  expect(active()).toBe(before)
  act(() => result.current.clearFeatWithOptions(f.target, {}))
  expect(active().proficiencies.skills).toContain('acrobatics')
})

test.each([
  'TCE',
  'XPHB',
])('%s Skill Expert picker and confirmation reject another Expertise grant', (source) => {
  const f = fixture('Skill Expert', source)
  f.character = applyCharacterCommandResult(
    f.character,
    manualExpertiseFixtureGrant(f.character, f.character.provenance, 'stealth'),
  )
  store(f)
  const { result } = renderHook(() => useFeatProvenanceMutations())
  const before = active()
  act(() =>
    result.current.commitFeatWithOptions(f.target, {
      abilityScore: 'dex',
      skills: ['acrobatics'],
      expertiseSkill: 'stealth',
    }),
  )
  expect(active()).toBe(before)
  expect(
    canChangeFeatExpertise(
      active(),
      active(),
      f.target,
      { skills: ['acrobatics'], expertiseSkill: 'stealth' },
      f.data.feats,
    ),
  ).toBe(false)
  render(
    <MemoryRouter>
      <FeatOptionsModal
        open
        onOpenChange={() => {}}
        feat={f.feat}
        optionTarget={f.target}
        proficientSkillNames={f.character.proficiencies.skills}
        onFinish={() => {}}
      />
    </MemoryRouter>,
  )
  const dialog = within(screen.getByRole('dialog'))
  fireEvent.click(dialog.getByRole('button', { name: 'Dexterity' }))
  fireEvent.click(dialog.getByRole('button', { name: 'Next' }))
  fireEvent.click(dialog.getByRole('checkbox', { name: /^acrobatics$/i }))
  fireEvent.click(dialog.getByRole('button', { name: 'Next' }))
  expect(dialog.queryByRole('button', { name: /^stealth$/i })).toBeNull()
  expect(dialog.getByRole('button', { name: /^acrobatics$/i })).toBeTruthy()
})
