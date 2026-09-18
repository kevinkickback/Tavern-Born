import { describe, expect, test } from 'vitest'
import { MAX_CHARACTER_LEVEL } from '@/lib/calculations/gameRules'
import { applyClassProgressionUpdate, applyLevelUp } from '@/lib/character/commands/classCommands'
import type { Character } from '@/types/character'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const CORE_CLASSES = [
  ['Barbarian', 12],
  ['Bard', 8],
  ['Cleric', 8],
  ['Druid', 8],
  ['Fighter', 10],
  ['Monk', 8],
  ['Paladin', 10],
  ['Ranger', 10],
  ['Rogue', 8],
  ['Sorcerer', 6],
  ['Warlock', 8],
  ['Wizard', 6],
] as const

const EDITIONS = [
  { originSystem: '2014' as const, source: 'PHB' },
  { originSystem: '2024' as const, source: 'XPHB' },
] as const

function mergeCommandResult(
  character: Character,
  result: ReturnType<typeof applyLevelUp> | ReturnType<typeof applyClassProgressionUpdate>,
): Character {
  return {
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  }
}

describe('core class level progression matrix', () => {
  test.each(
    EDITIONS.flatMap((edition) =>
      CORE_CLASSES.map(([className, hitDie]) => ({ ...edition, className, hitDie })),
    ),
  )('$originSystem $className records every level, keeps current HP full, and retracts removed levels', ({
    originSystem,
    source,
    className,
    hitDie,
  }) => {
    const constitutionModifier = 2
    const averageDieResult = Math.floor(hitDie / 2) + 1
    let expectedMaximum = hitDie + constitutionModifier
    let character = makeCharacterFixture({
      id: `${originSystem}-${className.toLowerCase()}-matrix`,
      originSystem,
      classProgression: [{ name: className, source, levels: 1 }],
      abilityScores: {
        strength: 10,
        dexterity: 10,
        constitution: 14,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      hitPoints: { current: expectedMaximum, temporary: 0 },
      hitPointsInitialized: true,
      hitPointGains: [],
    })

    for (let classLevel = 2; classLevel <= MAX_CHARACTER_LEVEL; classLevel += 1) {
      expectedMaximum += averageDieResult + constitutionModifier
      const result = applyLevelUp(
        character,
        character.provenance,
        [{ name: className, source, levels: classLevel }],
        {
          className,
          classSource: source,
          classLevel,
          hitDie,
          dieResult: averageDieResult,
          method: 'average',
        },
        expectedMaximum,
      )
      character = mergeCommandResult(character, result)

      expect(character.classProgression).toEqual([{ name: className, source, levels: classLevel }])
      expect(character.hitPoints.current).toBe(expectedMaximum)
      expect(character.hitPointGains).toHaveLength(classLevel - 1)
      expect(character.hitPointGains?.[character.hitPointGains.length - 1]).toMatchObject({
        characterLevel: classLevel,
        classLevel,
        className,
        classSource: source,
        hitDie,
        dieResult: averageDieResult,
      })
    }

    const levelDown = applyClassProgressionUpdate(character, character.provenance, [
      { name: className, source, levels: 1 },
    ])
    const reduced = mergeCommandResult(character, levelDown)
    expect(reduced.hitPointGains).toEqual([])
    expect(reduced.classProgression).toEqual([{ name: className, source, levels: 1 }])
    expect(reduced.classChoiceSelections ?? []).toEqual([])
    expect(reduced.asiChoices ?? []).toEqual([])
  })

  test('rejects progression beyond the level cap instead of partially mutating state', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: MAX_CHARACTER_LEVEL }],
    })

    expect(() =>
      applyLevelUp(
        character,
        character.provenance,
        [{ name: 'Fighter', source: 'PHB', levels: MAX_CHARACTER_LEVEL + 1 }],
        {
          className: 'Fighter',
          classSource: 'PHB',
          classLevel: MAX_CHARACTER_LEVEL + 1,
          hitDie: 10,
          dieResult: 6,
          method: 'average',
        },
        200,
      ),
    ).toThrow(RangeError)
    expect(character.classProgression[0]?.levels).toBe(MAX_CHARACTER_LEVEL)
  })
})
