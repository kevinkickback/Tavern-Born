import { describe, expect, test } from 'vitest'
import { isSubclassEligible } from '@/lib/calculations/subclassEligibility'
import type { Subclass5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

function subclass(name: string, overrides: Partial<Subclass5e> = {}): Subclass5e {
  return {
    name,
    shortName: name,
    source: 'PHB',
    className: 'Wizard',
    classSource: 'PHB',
    ...overrides,
  }
}

describe('isSubclassEligible', () => {
  test('applies the legacy Bladesinger race restriction and override', () => {
    const bladesinger = subclass('Bladesinger')

    expect(
      isSubclassEligible({
        subclass: bladesinger,
        className: 'Wizard',
        character: makeCharacterFixture({ race: 'Half-Elf' }),
      }),
    ).toBe(true)
    expect(
      isSubclassEligible({
        subclass: bladesinger,
        className: 'Wizard',
        character: makeCharacterFixture({ race: 'Human' }),
      }),
    ).toBe(false)
    expect(
      isSubclassEligible({
        subclass: bladesinger,
        className: 'Wizard',
        character: makeCharacterFixture({
          race: 'Human',
          variantRules: { bladesingerAnyRace: true },
        }),
      }),
    ).toBe(true)
  })

  test('applies the legacy Battlerager race restriction and override', () => {
    const battlerager = subclass('Battlerager', { className: 'Barbarian' })

    expect(
      isSubclassEligible({
        subclass: battlerager,
        className: 'Barbarian',
        character: makeCharacterFixture({ race: 'Mountain Dwarf' }),
      }),
    ).toBe(true)
    expect(
      isSubclassEligible({
        subclass: battlerager,
        className: 'Barbarian',
        character: makeCharacterFixture({ race: 'Human' }),
      }),
    ).toBe(false)
    expect(
      isSubclassEligible({
        subclass: battlerager,
        className: 'Barbarian',
        character: makeCharacterFixture({
          race: 'Human',
          variantRules: { battleragerAnyRace: true },
        }),
      }),
    ).toBe(true)
  })

  test('prefers parsed prerequisite data and allows unrestricted subclasses', () => {
    const parsed = subclass('Court Mage', {
      prerequisite: [{ race: ['Elf'] }],
    })

    expect(
      isSubclassEligible({
        subclass: parsed,
        className: 'Wizard',
        character: makeCharacterFixture({ race: 'Human' }),
      }),
    ).toBe(false)
    expect(
      isSubclassEligible({
        subclass: subclass('Evocation'),
        className: 'Wizard',
        character: makeCharacterFixture({ race: 'Human' }),
      }),
    ).toBe(true)
  })
})
