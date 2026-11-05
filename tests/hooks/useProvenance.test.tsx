import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'

import { useBackgroundProvenanceMutations } from '@/hooks/character/useBackgroundProvenanceMutations'
import { useClassProvenanceMutations } from '@/hooks/character/useClassProvenanceMutations'
import { useRaceProvenanceMutations } from '@/hooks/character/useRaceProvenanceMutations'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Background5e, Class5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

function resetStore() {
  useCharacterStore.setState({
    characters: [],
    activeCharacterId: null,
    activeCharacter: null,
  })
  useGameDataStore.setState({ gameData: null })
}

function setGameDataItems(
  items: Array<{ name: string; source: string; type: string; ac?: number }>,
  classes: Class5e[] = [],
  backgrounds: Background5e[] = [],
) {
  useGameDataStore.setState({
    gameData: {
      races: [],
      classes,
      backgrounds,
      spells: [],
      feats: [],
      items: items as never,
      itemsBase: [],
      itemProperties: [],
      itemTypes: [],
      classFeatures: [],
      actions: [],
      conditions: [],
      deities: [],
      skills: [],
      senses: [],
      languages: [],
      optionalfeatures: [],
      variantrules: [],
      trapHazards: [],
      rewards: [],
      cultsBoons: [],
      organizations: [],
      sources: [],
    },
  })
}

describe('useProvenance mutations', () => {
  beforeEach(() => {
    resetStore()
  })

  test('applyRaceSelection materializes fixed race skills and languages', () => {
    const character = makeCharacterFixture({
      id: 'race-profs',
      race: 'Human',
    })

    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const { result } = renderHook(useRaceProvenanceMutations)

    result.current.applyRaceSelection({
      name: 'Elf',
      source: 'PHB',
      skillProficiencies: [{ perception: true }],
      languageProficiencies: [{ elvish: true }],
      ability: [],
    })

    const updated = useCharacterStore.getState().activeCharacter
    expect(updated?.proficiencies.skills).toEqual(['perception'])
    expect(updated?.proficiencies.languages).toContain('elvish')
    expect(updated?.proficiencies.expertise).toEqual([])
  })

  test('applyClassSelection materializes saving throw proficiencies', () => {
    const character = makeCharacterFixture({
      id: 'class-saves',
    })

    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const cls = {
      name: 'Cleric',
      source: 'PHB',
      proficiency: ['wis', 'cha'],
      startingProficiencies: {
        armor: ['light'],
        weapons: ['simple'],
        tools: [],
      },
    }
    setGameDataItems([], [cls])
    const { result } = renderHook(useClassProvenanceMutations)
    result.current.applyClassSelection(cls)

    const updated = useCharacterStore.getState().activeCharacter
    expect(updated?.proficiencies.savingThrows).toEqual(['wisdom', 'charisma'])
  })

  test('applyClassSelection should add default class starting equipment', () => {
    const character = makeCharacterFixture({ id: 'class-equipment' })

    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const cls = {
      name: 'Fighter',
      source: 'PHB',
      proficiency: [],
      startingProficiencies: {},
      startingEquipment: {
        defaultData: [
          {
            a: ['Chain Mail|phb'],
            b: ['Shield|phb'],
          },
        ],
      },
    }
    setGameDataItems(
      [
        { name: 'Chain Mail', source: 'phb', type: 'HA', ac: 16 },
        { name: 'Shield', source: 'phb', type: 'S', ac: 2 },
      ],
      [cls],
    )
    const { result } = renderHook(useClassProvenanceMutations)
    result.current.applyClassSelection(cls)

    const updated = useCharacterStore.getState().activeCharacter
    expect(updated?.equipment.map((item) => item.name)).toContain('Chain Mail')
    expect(updated?.equipment.map((item) => item.name)).not.toContain('Shield')
  })

  test('applyBackgroundSelection should apply selected option and currency', () => {
    const character = makeCharacterFixture({ id: 'background-equipment' })

    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })

    const background = {
      name: 'Acolyte',
      source: 'PHB',
      skillProficiencies: [],
      languageProficiencies: [],
      toolProficiencies: [],
      startingEquipment: [
        {
          _: [{ special: 'sticks of incense', quantity: 5 }],
          a: ['Pouch|phb'],
          b: [
            { special: 'book of prayer' },
            { value: 250 },
            { item: 'Pouch|phb', quantity: 1, containsValue: 35 },
          ],
        },
      ],
    }
    setGameDataItems([{ name: 'Pouch', source: 'phb', type: 'G' }], [], [background])
    const { result } = renderHook(useBackgroundProvenanceMutations)
    result.current.applyBackgroundSelection(background, ['b'])

    const updated = useCharacterStore.getState().activeCharacter
    expect(updated?.equipment.map((item) => item.name)).toEqual([
      'sticks of incense',
      'book of prayer',
      'Pouch',
    ])
    expect(updated?.currency).toEqual({ cp: 5, sp: 8, ep: 0, gp: 2, pp: 0 })
    expect(updated?.backgroundEquipmentChoices).toEqual(['b'])
  })

  test('background auto-choices preserve unrelated unsaved edits', () => {
    const character = makeCharacterFixture({
      id: 'background-auto-choices',
      name: 'Persisted Name',
      originSystem: '2024',
      background: 'Guard',
      backgroundSource: 'XPHB',
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
      isActiveCharacterDirty: false,
    })
    useCharacterStore.getState().updateCharacter(character.id, { name: 'Unsaved Name' })
    const { result } = renderHook(useBackgroundProvenanceMutations)

    result.current.reconcileBackgroundAbilityChoices(
      {
        name: 'Guard',
        source: 'XPHB',
        ability: [
          {
            choose: {
              weighted: {
                from: ['strength', 'dexterity'],
                weights: [2, 1],
              },
            },
          },
        ],
      },
      0,
      ['strength', 'dexterity'],
    )

    const state = useCharacterStore.getState()
    expect(state.activeCharacter?.name).toBe('Unsaved Name')
    expect(state.activeCharacter?.backgroundAsiChoices).toEqual(['strength', 'dexterity'])
    expect(state.characters[0]?.name).toBe('Persisted Name')
    expect(state.characters[0]?.backgroundAsiChoices).toBeUndefined()
    expect(state.hasUnsavedChanges()).toBe(true)
  })
})
