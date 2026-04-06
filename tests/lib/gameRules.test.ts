import { describe, expect, test } from 'vitest';
import {
  ABILITY_SCORE_ABSOLUTE_MAX,
  calculatePointBuyTotal,
  checkMulticlassRequirements,
  getAbilityModifier,
  getASILevelsFromClass,
  getCarryCapacity,
  getHitDiceFromClass,
  getPointBuyCost,
  getProficiencyBonus,
  getRemainingPointBuy,
  parseHitDice,
} from '@/lib/calculations/gameRules';
import { makeClassFixture } from '../fixtures/gameDataFixtures';

describe('gameRules', () => {
  test('parseHitDice extracts die faces and falls back to 8', () => {
    expect(parseHitDice('1d12')).toBe(12);
    expect(parseHitDice('d10')).toBe(10);
    expect(parseHitDice(undefined)).toBe(8);
  });

  test('getHitDiceFromClass reads class hd and falls back to 8', () => {
    expect(getHitDiceFromClass(makeClassFixture({ hd: { faces: 10 } }))).toBe(
      10,
    );
    expect(getHitDiceFromClass(null)).toBe(8);
  });

  test('getASILevelsFromClass parses and sorts distinct ASI levels', () => {
    const cls = makeClassFixture({
      classFeatures: [
        'Ability Score Improvement|Wizard|PHB|12',
        'Ability Score Improvement|Wizard|PHB|4',
        'Ability Score Improvement|Wizard|PHB|8',
        'Ability Score Improvement|Wizard|PHB|4',
      ],
    });

    expect(getASILevelsFromClass(cls)).toEqual([4, 8, 12]);
  });

  test('getASILevelsFromClass falls back when class data is missing', () => {
    expect(getASILevelsFromClass(undefined)).toEqual([4, 8, 12, 16, 19]);
  });

  test('checkMulticlassRequirements handles direct requirements', () => {
    const fighter = makeClassFixture({
      name: 'Fighter',
      multiclassing: {
        requirements: { str: 13 },
      },
    });

    expect(
      checkMulticlassRequirements(fighter, {
        strength: 13,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      }).meetsRequirements,
    ).toBe(true);

    expect(
      checkMulticlassRequirements(fighter, {
        strength: 12,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      }).meetsRequirements,
    ).toBe(false);

    expect(
      checkMulticlassRequirements(fighter, {
        strength: 13,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      }).requirementText,
    ).toBe('Strength 13');
  });

  test('checkMulticlassRequirements handles OR groups', () => {
    const bard = makeClassFixture({
      name: 'Bard',
      multiclassing: {
        requirements: {
          or: [{ dex: 13 }, { cha: 13 }],
        },
      },
    });

    expect(
      checkMulticlassRequirements(bard, {
        strength: 10,
        dexterity: 13,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      }).meetsRequirements,
    ).toBe(true);

    expect(
      checkMulticlassRequirements(bard, {
        strength: 10,
        dexterity: 12,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 12,
      }).meetsRequirements,
    ).toBe(false);

    expect(
      checkMulticlassRequirements(bard, {
        strength: 10,
        dexterity: 13,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      }).requirementText,
    ).toBe('Dexterity 13; Charisma 13');
  });

  test('checkMulticlassRequirements requires both base and OR groups when both exist', () => {
    const ranger = makeClassFixture({
      name: 'Ranger',
      multiclassing: {
        requirements: {
          str: 13,
          or: [{ dex: 13 }, { wis: 13 }],
        },
      },
    });

    expect(
      checkMulticlassRequirements(ranger, {
        strength: 13,
        dexterity: 13,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      }),
    ).toEqual({
      meetsRequirements: true,
      requirementText: 'Dexterity 13; Wisdom 13; Strength 13',
    });

    expect(
      checkMulticlassRequirements(ranger, {
        strength: 12,
        dexterity: 13,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      }).meetsRequirements,
    ).toBe(false);

    expect(
      checkMulticlassRequirements(ranger, {
        strength: 13,
        dexterity: 12,
        constitution: 10,
        intelligence: 10,
        wisdom: 12,
        charisma: 10,
      }).meetsRequirements,
    ).toBe(false);
  });

  test('getProficiencyBonus clamps out-of-range levels and applies breakpoints', () => {
    expect(getProficiencyBonus(0)).toBe(2);
    expect(getProficiencyBonus(1)).toBe(2);
    expect(getProficiencyBonus(4)).toBe(2);
    expect(getProficiencyBonus(5)).toBe(3);
    expect(getProficiencyBonus(20)).toBe(6);
    expect(getProficiencyBonus(99)).toBe(6);
  });

  test('getAbilityModifier returns expected values around thresholds', () => {
    expect(getAbilityModifier(8)).toBe(-1);
    expect(getAbilityModifier(10)).toBe(0);
    expect(getAbilityModifier(18)).toBe(4);
  });

  test('point-buy helpers compute totals and remaining budget', () => {
    const scores = {
      strength: 15,
      dexterity: 14,
      constitution: 13,
      intelligence: 12,
      wisdom: 10,
      charisma: 8,
    };

    expect(getPointBuyCost(15)).toBe(9);
    expect(calculatePointBuyTotal(scores)).toBe(27);
    expect(getRemainingPointBuy(scores)).toBe(0);
  });

  test('getCarryCapacity multiplies strength by 15', () => {
    expect(getCarryCapacity(8)).toBe(120);
    expect(getCarryCapacity(15)).toBe(225);
  });

  test('ability absolute max constant remains at supported cap', () => {
    expect(ABILITY_SCORE_ABSOLUTE_MAX).toBe(30);
  });
});
