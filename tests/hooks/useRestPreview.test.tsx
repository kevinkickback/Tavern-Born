import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useRestPreview } from '@/hooks/character/useRestPreview'
import { useCharacterStore } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

vi.mock('@/hooks/character/useSpellSlots', () => ({
  useSpellSlots: () => ({
    sharedSlots: [{ level: 2, max: 3, used: 2, available: 1 }],
    pactSlots: [{ level: 2, max: 2, used: 1, available: 1 }],
  }),
}))

vi.mock('@/hooks/character/useClassResources', () => ({
  useClassResources: () => ({
    resources: [
      {
        id: 'test-focus',
        label: 'Test Focus',
        current: 0,
        max: 2,
        recovery: { shortRest: 1, longRest: 'all' },
      },
    ],
  }),
}))

vi.mock('@/hooks/character/useHitPoints', () => ({
  useHitPoints: () => ({
    effectiveMaxHP: 18,
    hitDicePools: [{ id: 'fighter|phb', label: 'Fighter', die: 10, max: 3, used: 2 }],
  }),
}))

describe('useRestPreview', () => {
  beforeEach(() => {
    const original = makeCharacterFixture()
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 3 }],
      hitPoints: { current: 7, temporary: 3 },
      hitDiceUsed: { 'fighter|phb': 2 },
      classResources: { 'test-focus': 0 },
      spells: {
        ...original.spells,
        spellSlots: { ...original.spells.spellSlots, 2: { max: 3, used: 2 } },
        pactSpellSlots: { ...original.spells.pactSpellSlots, 2: { max: 2, used: 1 } },
      },
    })
    useCharacterStore.setState({
      characters: [character],
      activeCharacterId: character.id,
      activeCharacter: character,
    })
  })

  test('previews and commits one atomic long-rest patch', () => {
    const { result } = renderHook(() => useRestPreview())
    const preview = result.current.preview({
      restType: 'long',
      restoreHitPoints: true,
      hitDiceRecovered: { 'fighter|phb': 1 },
    })

    expect(preview?.changes.map((change) => change.id)).toEqual(
      expect.arrayContaining([
        'spell-slot:shared:2',
        'spell-slot:pact:2',
        'resource:test-focus',
        'hit-dice:fighter|phb',
        'hit-points',
        'temporary-hit-points',
      ]),
    )

    act(() => {
      if (preview) result.current.commit(preview)
    })

    const character = useCharacterStore.getState().activeCharacter
    expect(character?.spells.spellSlots[2]?.used).toBe(0)
    expect(character?.spells.pactSpellSlots?.[2]?.used).toBe(0)
    expect(character?.classResources?.['test-focus']).toBe(2)
    expect(character?.hitDiceUsed).toEqual({ 'fighter|phb': 1 })
    expect(character?.hitPoints).toEqual({ current: 18, temporary: 0 })
  })
})
