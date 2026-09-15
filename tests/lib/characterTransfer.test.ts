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
    hitPoints: { max: 24, current: 7, temporary: 3 },
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
    const copy = duplicateCharacter(source, 'exact', {
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

  test('resets runtime state without losing source-qualified build choices', () => {
    const source = makeUsedCharacter()
    const copy = duplicateCharacter(source, 'reusable-build', {
      id: 'build-copy',
      name: 'Source Hero (Build Copy)',
    })

    expect(copy.race).toBe(source.race)
    expect(copy.raceSource).toBe(source.raceSource)
    expect(copy.hitPoints).toEqual({ max: 0, current: 0, temporary: 0 })
    expect(copy.hitPointsInitialized).toBe(false)
    expect(copy.inspiration).toBe(false)
    expect(copy.deathSaves).toEqual({ successes: 0, failures: 0 })
    expect(copy.conditions).toEqual([])
    expect(copy.exhaustion).toBe(0)
    expect(copy.hitDiceUsed).toBe(0)
    expect(copy.classResources).toEqual({ 'test-resource': 0 })
    expect(copy.spells.spellSlots[1]?.used).toBe(0)
    expect(copy.spells.pactSpellSlots?.[1]?.used).toBe(0)
  })

  test('generates collision-free copy names', () => {
    expect(getDuplicateCharacterName('Hero', 'exact', ['Hero (Copy)'])).toBe('Hero (Copy 2)')
    expect(
      getDuplicateCharacterName('Hero', 'reusable-build', [
        'Hero (Build Copy)',
        'Hero (Build Copy 2)',
      ]),
    ).toBe('Hero (Build Copy 3)')
  })
})
