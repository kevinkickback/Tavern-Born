import { describe, expect, test } from 'vitest';
import {
  applyClassAsiChoice,
  resetClassAsiChoice,
} from '@/pages/build/class/model/asi';

describe('buildClassAsiUtils', () => {
  test('applyClassAsiChoice applies a new ASI and appends choice', () => {
    const result = applyClassAsiChoice({
      characterAbilityScores: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      currentAsiChoices: [],
      className: 'Fighter',
      level: 4,
      abilityChanges: { strength: 2 },
    });

    expect(result.abilityScores.strength).toBe(12);
    expect(result.asiChoices).toEqual([
      {
        id: 'asi-Fighter-4',
        className: 'Fighter',
        level: 4,
        abilityChanges: { strength: 2 },
      },
    ]);
  });

  test('applyClassAsiChoice replaces existing ASI at same class/level', () => {
    const result = applyClassAsiChoice({
      characterAbilityScores: {
        strength: 12,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      currentAsiChoices: [
        {
          id: 'asi-Fighter-4',
          className: 'Fighter',
          level: 4,
          abilityChanges: { strength: 2 },
        },
      ],
      className: 'Fighter',
      level: 4,
      abilityChanges: { constitution: 2 },
    });

    expect(result.abilityScores.strength).toBe(10);
    expect(result.abilityScores.constitution).toBe(12);
    expect(result.asiChoices).toHaveLength(1);
    expect(result.asiChoices[0]?.abilityChanges).toEqual({ constitution: 2 });
  });

  test('resetClassAsiChoice reverts scores and removes matching ASI', () => {
    const result = resetClassAsiChoice({
      characterAbilityScores: {
        strength: 12,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      currentAsiChoices: [
        {
          id: 'asi-Fighter-4',
          className: 'Fighter',
          level: 4,
          abilityChanges: { strength: 2 },
        },
      ],
      className: 'Fighter',
      level: 4,
    });

    expect(result).not.toBeNull();
    expect(result?.abilityScores.strength).toBe(10);
    expect(result?.asiChoices).toEqual([]);
  });
});
