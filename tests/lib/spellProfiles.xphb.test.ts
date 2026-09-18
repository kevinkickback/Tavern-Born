import { describe, expect, test } from 'vitest'
import {
  buildSpellcastingClassDetails,
  getPreparedSpellLimit,
  isLevelOnlyPreparedCaster,
  isPreparedCaster,
  isTruePreparedCaster,
} from '@/lib/calculations/spellProfiles'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import {
  makeClassFixture,
  makeXphbBardFixture,
  makeXphbClericFixture,
  makeXphbRangerFixture,
  makeXphbSorcererFixture,
  makeXphbWarlockFixture,
  makeXphbWizardFixture,
} from '../fixtures/gameDataFixtures'

const xphbCasters = [
  ['Sorcerer', makeXphbSorcererFixture],
  ['Cleric', makeXphbClericFixture],
  ['Wizard', makeXphbWizardFixture],
  ['Warlock', makeXphbWarlockFixture],
  ['Ranger', makeXphbRangerFixture],
  ['Bard', makeXphbBardFixture],
] as const

function makeCharacter(
  className: string,
  levels: number,
  ability: 'intelligence' | 'wisdom' | 'charisma',
) {
  return characterPersistenceSchema.parse(
    makeCharacterFixture({
      classProgression: [{ name: className, source: 'XPHB', levels }],
      abilityScores: { ...makeCharacterFixture().abilityScores, [ability]: 16 },
    }),
  )
}

describe('2024 spellcasting profiles', () => {
  test.each(xphbCasters)('recognizes %s as a prepared caster', (_name, makeClass) => {
    expect(isPreparedCaster(makeClass())).toBe(true)
  })

  test.each([
    ['Cleric', makeXphbClericFixture, true],
    ['Ranger', makeXphbRangerFixture, true],
    ['Sorcerer', makeXphbSorcererFixture, false],
    ['Bard', makeXphbBardFixture, false],
    ['Warlock', makeXphbWarlockFixture, false],
    ['Wizard', makeXphbWizardFixture, false],
  ] as const)('classifies %s daily preparation as %s', (_name, makeClass, expected) => {
    expect(isTruePreparedCaster(makeClass())).toBe(expected)
  })

  test.each([
    ['Sorcerer', makeXphbSorcererFixture, true],
    ['Bard', makeXphbBardFixture, true],
    ['Warlock', makeXphbWarlockFixture, true],
    ['Cleric', makeXphbClericFixture, false],
    ['Wizard', makeXphbWizardFixture, false],
    ['Ranger', makeXphbRangerFixture, false],
  ] as const)('classifies %s level-only preparation as %s', (_name, makeClass, expected) => {
    expect(isLevelOnlyPreparedCaster(makeClass())).toBe(expected)
  })

  test('does not classify a 2014 prepared caster as level-only', () => {
    expect(
      isLevelOnlyPreparedCaster(
        makeClassFixture({
          name: 'Wizard',
          source: 'PHB',
          casterProgression: 'full',
          spellcastingAbility: 'int',
          preparedSpells: '<$level$> + <$int_mod$>',
        }),
      ),
    ).toBe(false)
  })

  test.each([
    [makeXphbSorcererFixture, 1, 3, 2],
    [makeXphbSorcererFixture, 5, 3, 9],
    [makeXphbSorcererFixture, 20, 5, 22],
    [makeXphbSorcererFixture, 21, 3, 22],
    [makeXphbClericFixture, 1, 0, 4],
    [makeXphbClericFixture, 1, 5, 4],
    [makeXphbClericFixture, 10, 4, 15],
    [makeXphbWizardFixture, 1, 3, 4],
    [makeXphbWizardFixture, 20, 5, 25],
  ] as const)('reads prepared progression at level %s', (makeClass, level, modifier, expected) => {
    expect(getPreparedSpellLimit(makeClass(), level, modifier)).toBe(expected)
  })

  test.each([
    {
      className: 'Sorcerer',
      levels: 5,
      ability: 'charisma' as const,
      makeClass: makeXphbSorcererFixture,
      expected: {
        isLevelOnlyPreparedCaster: true,
        isTruePreparedCaster: false,
        knownSpellLimit: 9,
        preparedSpellLimit: null,
      },
    },
    {
      className: 'Cleric',
      levels: 3,
      ability: 'wisdom' as const,
      makeClass: makeXphbClericFixture,
      expected: {
        isLevelOnlyPreparedCaster: false,
        isTruePreparedCaster: true,
        knownSpellLimit: null,
        preparedSpellLimit: 6,
      },
    },
    {
      className: 'Warlock',
      levels: 9,
      ability: 'charisma' as const,
      makeClass: makeXphbWarlockFixture,
      expected: {
        casterProgression: 'pact',
        isLevelOnlyPreparedCaster: true,
        knownSpellLimit: 10,
        preparedSpellLimit: null,
      },
    },
    {
      className: 'Wizard',
      levels: 5,
      ability: 'intelligence' as const,
      makeClass: makeXphbWizardFixture,
      expected: {
        isPreparedCaster: true,
        isTruePreparedCaster: false,
        isLevelOnlyPreparedCaster: false,
        knownSpellLimit: 14,
        preparedSpellLimit: 9,
      },
    },
  ])('builds $className casting detail', ({ className, levels, ability, makeClass, expected }) => {
    const character = makeCharacter(className, levels, ability)
    const details = buildSpellcastingClassDetails(
      character,
      new Map([[`class:${className}|XPHB`, makeClass()]]),
      character.abilityScores,
    )

    expect(details).toHaveLength(1)
    expect(details[0]).toMatchObject(expected)
  })

  test('keeps the 2014 Wizard spellbook and prepared totals independent', () => {
    const character = characterPersistenceSchema.parse(
      makeCharacterFixture({
        classProgression: [{ name: 'Wizard', source: 'PHB', levels: 5 }],
        abilityScores: { ...makeCharacterFixture().abilityScores, intelligence: 16 },
      }),
    )
    const wizard = makeClassFixture({
      name: 'Wizard',
      source: 'PHB',
      casterProgression: 'full',
      spellcastingAbility: 'int',
      preparedSpells: '<$level$> + <$int_mod$>',
      spellsKnownProgressionFixed: [6, 2, 2, 2, 2],
    })

    expect(
      buildSpellcastingClassDetails(
        character,
        new Map([['class:Wizard|PHB', wizard]]),
        character.abilityScores,
      )[0],
    ).toMatchObject({
      isPreparedCaster: true,
      isTruePreparedCaster: false,
      isLevelOnlyPreparedCaster: false,
      knownSpellLimit: 14,
      preparedSpellLimit: 8,
    })
  })
})
