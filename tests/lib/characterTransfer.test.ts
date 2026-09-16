import { describe, expect, test } from 'vitest'
import { duplicateCharacter, getDuplicateCharacterName } from '@/lib/character/characterTransfer'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

function makeUsedCharacter() {
  return makeCharacterFixture({
    id: 'source-character',
    name: 'Source Hero',
    race: 'Test Lineage',
    raceSource: 'TEST',
    portrait: 'data:image/png;base64,example',
    hitPoints: { current: 7, temporary: 3 },
    hitPointsInitialized: true,
    inspiration: true,
    deathSaves: { successes: 2, failures: 1 },
    conditions: ['test condition'],
    exhaustion: 2,
    hitDiceUsed: 3,
    classResources: { 'test-resource': 2 },
    spells: {
      ...makeCharacterFixture().spells,
      spellSlots: { 1: { max: 3, used: 2 } },
      pactSpellSlots: { 1: { max: 1, used: 1 } },
    },
  })
}

describe('character transfer', () => {
  test('creates an independent exact copy with fresh identity metadata', () => {
    const source = makeUsedCharacter()
    const copy = duplicateCharacter(source, {
      id: 'exact-copy',
      name: 'Source Hero (Copy)',
      now: '2026-09-15T00:00:00.000Z',
    })

    expect(copy).toMatchObject({
      id: 'exact-copy',
      name: 'Source Hero (Copy)',
      hitPoints: source.hitPoints,
      conditions: source.conditions,
      createdAt: '2026-09-15T00:00:00.000Z',
      lastModified: '2026-09-15T00:00:00.000Z',
    })
    copy.hitPoints.current = 1
    expect(source.hitPoints.current).toBe(7)
  })

  test('generates collision-free copy names', () => {
    expect(getDuplicateCharacterName('Hero', ['Hero (Copy)'])).toBe('Hero (Copy 2)')
    expect(getDuplicateCharacterName('Hero', ['Hero (Copy)', 'Hero (Copy 2)'])).toBe(
      'Hero (Copy 3)',
    )
  })
})
