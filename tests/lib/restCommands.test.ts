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
    classProgression: [{ name: 'Fighter', source: 'PHB', levels: 5 }],
    hitDiceUsed: { 'fighter|phb': 3 },
    hitPoints: { current: 4, temporary: 3 },
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
  hitDiceRecovered: { 'fighter|phb': 2 },
  restoreHitPoints: true,
}

describe('applyRest', () => {
  test('previews short-rest pact and partial resource recovery without changing HP or hit dice', () => {
    const character = restCharacter()
    const result = applyRest(character, 'short', restContext)

    expect(result.patch.spells.spellSlots[1]?.used).toBe(2)
    expect(result.patch.spells.pactSpellSlots?.[2]?.used).toBe(0)
    expect(result.patch.classResources).toEqual({ 'test-short': 1, 'test-long': 1 })
    expect(result.patch.hitDiceUsed).toEqual({ 'fighter|phb': 3 })
    expect(result.patch.hitPoints).toEqual(character.hitPoints)
    expect(character.spells.pactSpellSlots?.[2]?.used).toBe(1)
  })

  test('builds one long-rest patch for slots, resources, hit dice, and chosen HP recovery', () => {
    const result = applyRest(restCharacter(), 'long', restContext)

    expect(result.patch.spells.spellSlots[1]?.used).toBe(0)
    expect(result.patch.spells.pactSpellSlots?.[2]?.used).toBe(0)
    expect(result.patch.classResources).toEqual({ 'test-short': 2, 'test-long': 4 })
    expect(result.patch.hitDiceUsed).toEqual({ 'fighter|phb': 1 })
    expect(result.patch.hitPoints).toEqual({ current: 12, temporary: 0 })
    expect(result.changes.map((change) => change.id)).toEqual(
      expect.arrayContaining([
        'spell-slot:shared:1',
        'spell-slot:pact:2',
        'resource:test-short',
        'resource:test-long',
        'hit-dice:fighter|phb',
        'hit-points',
        'temporary-hit-points',
      ]),
    )
  })

  test('recovers multiclass hit dice from the selected class pools', () => {
    const character = makeCharacterFixture({
      classProgression: [
        { name: 'Fighter', source: 'PHB', levels: 3 },
        { name: 'Wizard', source: 'PHB', levels: 2 },
      ],
      hitDiceUsed: { 'fighter|phb': 2, 'wizard|phb': 2 },
    })

    const result = applyRest(character, 'long', {
      ...restContext,
      hitDiceRecovered: { 'fighter|phb': 1, 'wizard|phb': 2 },
    })

    expect(result.patch.hitDiceUsed).toEqual({ 'fighter|phb': 1 })
    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'hit-dice:fighter|phb', before: 2, after: 1 }),
        expect.objectContaining({ id: 'hit-dice:wizard|phb', before: 2, after: 0 }),
      ]),
    )
  })
})
