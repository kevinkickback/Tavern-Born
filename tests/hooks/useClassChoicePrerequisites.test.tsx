import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { useClassProvenanceMutations } from '@/hooks/character/useClassProvenanceMutations'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { retainSavedFeatureOptionsCommand } from '@/lib/character/commands/classChoiceCommands'
import { getOptionalPoolSelectionHandle } from '@/lib/character/optionalClassPoolSelections'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import {
  applyWarriorResult,
  makeWarriorSpellFixtures,
  selectWarriorFixture,
} from '../fixtures/warriorSpellFixtures'

afterEach(cleanup)

function install(wisdom: number) {
  const fixture = makeWarriorSpellFixtures()
  const selected = selectWarriorFixture(fixture, 'Ranger', 'PHB')
  const character = applyWarriorResult(
    selected.character,
    retainSavedFeatureOptionsCommand(
      selected.character,
      selected.character.provenance,
      selected.choice.id,
      [],
      undefined,
      getOptionalPoolSelectionHandle(selected.character.classChoiceSelections![0]),
    ),
  )
  character.abilityScores.wisdom = wisdom
  const data = {
    ...fixture.data,
    optionalfeatures: fixture.context.catalogs.optionalFeatures!.map((row) =>
      row.name === 'Druidic Warrior' ? { ...row, prerequisite: [{ ability: [{ wis: 13 }] }] } : row,
    ),
  }
  data.lookups = buildGameDataLookups(data)
  useGameDataStore.setState({ gameData: data })
  useCharacterStore.setState({
    activeCharacter: character,
    activeCharacterId: character.id,
    characters: [character],
  })
  return { character, choice: selected.choice }
}

test.each([
  [16, 12, false],
  [12, 16, true],
] as const)('captured Class confirmation uses current effective abilities: %s to %s', (opening, latest, accepted) => {
  const { character, choice } = install(opening)
  const { result } = renderHook(() => useClassProvenanceMutations())
  const confirm = result.current.applyClassChoiceSelection
  act(() => {
    useCharacterStore.setState({
      activeCharacter: {
        ...character,
        abilityScores: { ...character.abilityScores, wisdom: latest },
      },
    })
  })
  const commit = () =>
    confirm(choice, [{ entityType: 'optionalFeature', name: 'Druidic Warrior', source: 'TCE' }])
  if (accepted) {
    act(commit)
    expect(
      useCharacterStore
        .getState()
        .activeCharacter?.classChoiceSelections?.some((row) =>
          row.selected.some((option) => option.name === 'Druidic Warrior'),
        ),
    ).toBe(true)
  } else {
    expect(commit).toThrow('current prerequisites')
    expect(
      useCharacterStore
        .getState()
        .activeCharacter?.classChoiceSelections?.every((row) => !row.selected.length),
    ).toBe(true)
  }
})

test('captured removal stays available after source context changes', () => {
  const { choice } = install(16)
  const { result } = renderHook(() => useClassProvenanceMutations())
  act(() => {
    result.current.applyClassChoiceSelection(choice, [
      { entityType: 'optionalFeature', name: 'Druidic Warrior', source: 'TCE' },
    ])
  })
  const current = useCharacterStore.getState().activeCharacter!
  const selection = current.classChoiceSelections![0]
  const remove = result.current.retainSavedFeatureOptions
  act(() => {
    useGameDataStore.setState({ gameData: null })
  })
  expect(() =>
    act(() => remove(selection.choiceId, [], getOptionalPoolSelectionHandle(selection))),
  ).not.toThrow()
})
