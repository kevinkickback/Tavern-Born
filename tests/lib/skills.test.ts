import { describe, expect, test } from 'vitest'
import type { AbilityName } from '@/lib/calculations/abilityScores'
import {
  calculateSavingThrowModifier,
  calculateSkillModifier,
  deriveAllSavingThrows,
  deriveAllSkills,
  formatModifier,
  getSkillAbility,
} from '@/lib/calculations/skills'

const abilityModifiers: Record<AbilityName, number> = {
  strength: 1,
  dexterity: 3,
  constitution: 2,
  intelligence: 0,
  wisdom: -1,
  charisma: 4,
}

describe('skills', () => {
  test('getSkillAbility normalizes case and whitespace', () => {
    expect(getSkillAbility('  STEALTH ')).toBe('dexterity')
    expect(getSkillAbility('Arcana')).toBe('intelligence')
    expect(getSkillAbility('Unknown Skill')).toBeNull()
  })

  test('calculateSavingThrowModifier and formatModifier work together', () => {
    const mod = calculateSavingThrowModifier(2, 3, true)
    expect(mod).toBe(5)
    expect(formatModifier(mod)).toBe('+5')
  })

  test('deriveAllSavingThrows marks proficiencies and computes modifiers', () => {
    const results = deriveAllSavingThrows(abilityModifiers, ['dexterity', 'wisdom'], 3)

    expect(results).toHaveLength(6)
    expect(results.find((r) => r.ability === 'dexterity')).toMatchObject({
      proficient: true,
      modifier: 6,
      modifierString: '+6',
    })
    expect(results.find((r) => r.ability === 'charisma')).toMatchObject({
      proficient: false,
      modifier: 4,
    })
  })

  test('calculateSkillModifier handles expertise precedence over proficiency', () => {
    expect(calculateSkillModifier(2, 3, false, false)).toBe(2)
    expect(calculateSkillModifier(2, 3, true, false)).toBe(5)
    expect(calculateSkillModifier(2, 3, true, true)).toBe(8)
  })

  test('deriveAllSkills computes all 18 skills with proficiency and expertise', () => {
    const results = deriveAllSkills(abilityModifiers, ['stealth', 'arcana'], ['stealth'], 3)

    expect(results).toHaveLength(18)
    expect(results.find((r) => r.name === 'stealth')).toMatchObject({
      proficient: true,
      expertise: true,
      modifier: 9,
      modifierString: '+9',
    })
    expect(results.find((r) => r.name === 'arcana')).toMatchObject({
      proficient: true,
      expertise: false,
      modifier: 3,
    })
  })
})
