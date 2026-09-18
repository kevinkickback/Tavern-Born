import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test } from 'vitest'
import { useSpellSlotMutations } from '@/hooks/character/useSpellSlotMutations'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

describe('useSpellSlotMutations', () => {
  beforeEach(() => {
    const character = makeCharacterFixture({
      spells: {
        ...makeCharacterFixture().spells,
        spellSlots: {
          ...makeCharacterFixture().spells.spellSlots,
          2: { max: 3, used: 1 },
        },
        pactSpellSlots: {
          ...makeCharacterFixture().spells.pactSpellSlots,
          2: { max: 2, used: 1 },
        },
      },
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
  })

  test('updates shared and pact pools independently through the character store', () => {
    const { result, rerender } = renderHook(() => useSpellSlotMutations())

    act(() => result.current.spend('shared', 2, 3))
    rerender()
    act(() => result.current.restoreOne('pact', 2, 2))

    const character = useCharacterStore.getState().activeCharacter
    expect(character?.spells.spellSlots[2]).toEqual({ max: 3, used: 2 })
    expect(character?.spells.pactSpellSlots?.[2]).toEqual({ max: 2, used: 0 })
  })

  test('supports an explicit usage correction without changing the slot maximum', () => {
    const { result } = renderHook(() => useSpellSlotMutations())

    act(() => result.current.correctUsage('shared', 2, 0, 3))

    expect(useCharacterStore.getState().activeCharacter?.spells.spellSlots[2]).toEqual({
      max: 3,
      used: 0,
    })
  })
})
