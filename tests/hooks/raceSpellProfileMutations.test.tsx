import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { useRaceProvenanceMutations } from '@/hooks/character/useRaceProvenanceMutations'
import { buildRaceLookup } from '@/lib/5etools/lookups'
import { applyRaceSelectionCommand } from '@/lib/character/commands/raceCommands'
import { setRacialSpellChoice } from '@/lib/character/commands/spellCommands'
import { emptyProvenance } from '@/lib/provenance'
import type { Race5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const mocks = vi.hoisted(() => ({
  characterState: {} as Record<string, unknown>,
  gameDataState: {} as Record<string, unknown>,
  updateCharacter: vi.fn(),
}))

vi.mock('@/store/characterStore', async () => ({
  emptyProvenance: (await import('@/lib/provenance')).emptyProvenance,
  useCharacterStore: (selector: (state: unknown) => unknown) => selector(mocks.characterState),
}))
vi.mock('@/store/gameDataStore', () => ({
  useGameDataStore: (selector: (state: unknown) => unknown) => selector(mocks.gameDataState),
}))

beforeEach(() => vi.clearAllMocks())

test('raw-catalog previous version metadata restores parent ownership when leaving a filtered-out version', () => {
  const version = {
    name: 'Version',
    source: 'HB',
    _isVersion: true,
    skillProficiencies: [{ perception: true }],
  } as Race5e
  const child = { name: 'New', source: 'PHB' } as Race5e
  const parent = {
    name: 'Parent',
    source: 'PHB',
    skillProficiencies: [{ perception: true }],
    subraces: [version, child],
  } as Race5e
  const original = makeCharacterFixture({ race: '', raceSource: '' })
  const initial = applyRaceSelectionCommand(
    original,
    emptyProvenance(),
    parent,
    version,
    0,
    () => [],
  )
  expect(initial.provenanceUpdate.proficiencies.skills.perception).toEqual([
    expect.objectContaining({ sourceType: 'subrace', sourceName: 'Version' }),
  ])
  const saved = { ...original, ...initial.characterPatch, provenance: initial.provenanceUpdate }
  mocks.characterState = { activeCharacter: saved, updateCharacter: mocks.updateCharacter }
  mocks.gameDataState = {
    gameData: { items: [], itemsBase: [], lookups: { racesByKey: buildRaceLookup([parent]) } },
  }
  const { result } = renderHook(() => useRaceProvenanceMutations())
  act(() => result.current.applySubraceChange({ ...parent, subraces: [] }, child))
  const patch = mocks.updateCharacter.mock.calls[0][1]
  expect(patch.proficiencies.skills).toContain('perception')
  expect(patch.provenance.proficiencies.skills.perception).toEqual([
    expect.objectContaining({ sourceType: 'race', sourceName: 'Parent', sourceRef: 'PHB' }),
  ])
})

test.each([
  'race',
  'subrace',
] as const)('the %s mutation keeps raw-catalog nested identity when filtering hides the selected child', (mutation) => {
  const child = {
    name: 'Child',
    source: 'HB',
    additionalSpells: [{ known: { _: [{ choose: 'level=0|class=Wizard' }] } }],
  } as Race5e
  const parent = { name: 'Parent', source: 'PHB', subraces: [child] } as Race5e
  const original = makeCharacterFixture({ race: '', raceSource: '' })
  const selected = applyRaceSelectionCommand(
    original,
    emptyProvenance(),
    parent,
    child,
    0,
    () => [],
  )
  const character = { ...original, ...selected.characterPatch }
  const choice = setRacialSpellChoice(
    character,
    selected.provenanceUpdate,
    'racial:Child Parent|HB',
    'direct-_-choose-0',
    ['Light|PHB'],
  )
  const saved = { ...character, ...choice.characterPatch, provenance: choice.provenanceUpdate }
  mocks.characterState = { activeCharacter: saved, updateCharacter: mocks.updateCharacter }
  mocks.gameDataState = {
    gameData: { items: [], itemsBase: [], lookups: { racesByKey: buildRaceLookup([parent]) } },
  }
  const { result } = renderHook(() => useRaceProvenanceMutations())
  const filteredParent = { ...parent, subraces: [] }
  act(() => {
    if (mutation === 'race') result.current.applyRaceSelection(filteredParent, child)
    else result.current.applySubraceChange(filteredParent, child)
  })
  expect(mocks.updateCharacter).toHaveBeenCalledTimes(1)
  const [id, patch] = mocks.updateCharacter.mock.calls[0]
  expect(id).toBe(saved.id)
  expect(
    patch.spells.spellProfiles.filter((profile: { type: string }) => profile.type === 'racial'),
  ).toEqual([
    expect.objectContaining({
      id: 'racial:Child Parent|HB',
      cantrips: ['Light|PHB'],
      choices: [expect.objectContaining({ selected: ['Light|PHB'] })],
    }),
  ])
  expect(patch.provenance.spells.light).toEqual([
    expect.objectContaining({
      sourceType: 'subrace',
      sourceName: 'Child',
      sourceRef: 'HB',
      grantType: 'choice',
    }),
  ])
})
