import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useFeatProvenanceMutations } from '@/hooks/character/useFeatProvenanceMutations'
import { useCharacterStore } from '@/store/characterStore'
import type { Spell5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/lib/storage/idb-storage', () => ({
  createIdbStorage: () => ({
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }),
}))

describe('useFeatProvenanceMutations bonus feats', () => {
  beforeEach(() => {
    const character = makeCharacterFixture({
      specialFeats: [
        {
          id: 'bonus-skilled-phb',
          name: 'Skilled',
          source: 'PHB',
          description: '',
        },
      ],
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
  })

  test('persists options and retracts their grants when the bonus feat is removed', () => {
    const { result } = renderHook(() => useFeatProvenanceMutations())

    act(() => {
      result.current.commitFeatWithOptions(
        { name: 'Skilled', source: 'PHB' },
        { skills: ['Arcana'], abilityScore: 'int' },
      )
    })

    let updated = useCharacterStore.getState().activeCharacter
    expect(updated?.specialFeats?.[0].options).toEqual({
      skills: ['Arcana'],
      abilityScore: 'int',
    })
    expect(updated?.proficiencies.skills).toEqual(['arcana'])
    expect(updated?.skills.arcana).toMatchObject({ proficient: true })
    expect(updated?.abilityScores.intelligence).toBe(11)
    expect(updated?.provenance?.proficiencies.skills.arcana).toHaveLength(1)

    act(() => {
      result.current.replaceBonusFeatSelections([{ name: 'Skilled', source: 'PHB' }])
    })

    updated = useCharacterStore.getState().activeCharacter
    expect(updated?.specialFeats?.[0].options).toEqual({
      skills: ['Arcana'],
      abilityScore: 'int',
    })

    act(() => {
      result.current.replaceBonusFeatSelections([])
    })

    updated = useCharacterStore.getState().activeCharacter
    expect(updated?.specialFeats).toEqual([])
    expect(updated?.proficiencies.skills).toEqual([])
    expect(updated?.skills.arcana).toMatchObject({ proficient: false, expertise: false })
    expect(updated?.abilityScores.intelligence).toBe(10)
    expect(updated?.provenance?.proficiencies.skills.arcana).toBeUndefined()
  })

  test('persists fixed feat options without adding a normal or bonus feat', () => {
    const { result } = renderHook(() => useFeatProvenanceMutations())

    act(() => {
      result.current.commitFeatWithOptions(
        { name: 'Magic Initiate', source: 'XPHB', grantVariant: 'cleric' },
        {
          spellcastingClass: 'Cleric Spells',
          spells: ['Guidance|XPHB'],
        },
        [{ name: 'Guidance', source: 'XPHB', level: 0 }] as Spell5e[],
      )
    })

    const updated = useCharacterStore.getState().activeCharacter
    expect(updated?.feats).toEqual([])
    expect(updated?.specialFeats).toHaveLength(1)
    expect(updated?.fixedFeatOptions?.['magic initiate|xphb|cleric']).toEqual({
      spellcastingClass: 'Cleric Spells',
      spells: ['Guidance|XPHB'],
    })
    expect(updated?.provenance?.spells.guidance?.[0]).toMatchObject({
      sourceType: 'feat',
      sourceName: 'Magic Initiate; cleric',
    })
  })
})
