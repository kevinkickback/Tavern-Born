import { describe, expect, test } from 'vitest'
import { applyRest } from '@/lib/character/commands/restCommands'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

function restCharacter() {
  return makeCharacterFixture({
    spells: {
      ...makeCharacterFixture().spells,
      spellSlots: { 1: { max: 3, used: 2 } },
      pactSpellSlots: { 2: { max: 2, used: 1 } },
    },
    classResources: { 'test-short': 0, 'test-long': 1 },
    hitDiceUsed: 3,
    hitPoints: { max: 0, current: 4, temporary: 3 },
  })
}

const restContext = {
  spellSlots: {
    shared: { 1: { max: 3 } },
    pact: { 2: { max: 2 } },
  },
  resources: [
    {
      id: 'test-short',
      label: 'Test short resource',
      current: 0,
      max: 2,
      recovery: { shortRest: 1, longRest: 'all' as const },
    },
    {
      id: 'test-long',
      label: 'Test long resource',
      current: 1,
      max: 4,
      recovery: { longRest: 'all' as const },
    },
  ],
  maximumHitPoints: 12,
  hitDiceRecovered: 2,
  restoreHitPoints: true,
}

describe('applyRest', () => {
  test('previews short-rest pact and partial resource recovery without changing HP or hit dice', () => {
    const character = restCharacter()
    const result = applyRest(character, 'short', restContext)

    expect(result.patch.spells.spellSlots[1]?.used).toBe(2)
    expect(result.patch.spells.pactSpellSlots?.[2]?.used).toBe(0)
    expect(result.patch.classResources).toEqual({ 'test-short': 1, 'test-long': 1 })
    expect(result.patch.hitDiceUsed).toBe(3)
    expect(result.patch.hitPoints).toEqual(character.hitPoints)
    expect(character.spells.pactSpellSlots?.[2]?.used).toBe(1)
  })

  test('builds one long-rest patch for slots, resources, hit dice, and chosen HP recovery', () => {
    const result = applyRest(restCharacter(), 'long', restContext)

    expect(result.patch.spells.spellSlots[1]?.used).toBe(0)
    expect(result.patch.spells.pactSpellSlots?.[2]?.used).toBe(0)
    expect(result.patch.classResources).toEqual({ 'test-short': 2, 'test-long': 4 })
    expect(result.patch.hitDiceUsed).toBe(1)
    expect(result.patch.hitPoints).toEqual({ max: 0, current: 12, temporary: 0 })
    expect(result.changes.map((change) => change.id)).toEqual(
      expect.arrayContaining([
        'spell-slot:shared:1',
        'spell-slot:pact:2',
        'resource:test-short',
        'resource:test-long',
        'hit-dice',
        'hit-points',
        'temporary-hit-points',
      ]),
    )
  })
})
