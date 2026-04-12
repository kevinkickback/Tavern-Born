import { describe, expect, test } from 'vitest'
import { applyRaceGrants, emptyProvenance } from '@/lib/provenance'

describe('provenance/applyRaceGrants', () => {
  test('applies race additionalSpells progressively by character level', () => {
    const race = {
      name: 'Tiefling',
      source: 'PHB',
      additionalSpells: [
        {
          known: {
            '1': ['thaumaturgy#c'],
          },
          innate: {
            '3': {
              daily: {
                '1': ['hellish rebuke'],
              },
            },
            '5': {
              daily: {
                '1': ['darkness'],
              },
            },
          },
          ability: 'cha',
        },
      ],
    }

    const level1 = applyRaceGrants(race, undefined, emptyProvenance(), undefined, 0, 1)
    expect(Object.keys(level1.spells).some((key) => key.includes('thaumaturgy'))).toBe(true)
    expect(level1.spells['hellish rebuke']).toBeUndefined()

    const level3 = applyRaceGrants(race, undefined, emptyProvenance(), undefined, 0, 3)
    expect(level3.spells['hellish rebuke']?.length ?? 0).toBeGreaterThan(0)
    expect(level3.spells.darkness).toBeUndefined()

    const level5 = applyRaceGrants(race, undefined, emptyProvenance(), undefined, 0, 5)
    expect(level5.spells.darkness?.length ?? 0).toBeGreaterThan(0)
  })

  test('adds Common and one standard language choice for lineage races without explicit language blocks', () => {
    const ledger = applyRaceGrants(
      {
        name: 'Aarakocra',
        source: 'MPMM',
        lineage: 'VRGR',
      },
      undefined,
      emptyProvenance(),
    )

    expect(ledger.proficiencies.languages.common).toBeDefined()
    expect(ledger.proficiencies.languages.common[0]).toMatchObject({
      sourceType: 'race',
      sourceName: 'Aarakocra',
      grantType: 'fixed',
    })

    const languageChoices = ledger.choices.filter((choice) => choice.domain === 'languages')
    expect(languageChoices).toHaveLength(1)
    expect(languageChoices[0]).toMatchObject({
      chooseCount: 1,
      optionPool: [],
      sourceTag: {
        sourceType: 'race',
        sourceName: 'Aarakocra',
      },
    })
  })

  test('does not synthesize lineage language blocks when explicit language proficiencies exist', () => {
    const ledger = applyRaceGrants(
      {
        name: 'Custom Lineage',
        source: 'TCE',
        lineage: true,
        languageProficiencies: [{ common: true, anyStandard: 1 }],
      },
      undefined,
      emptyProvenance(),
    )

    expect(ledger.proficiencies.languages.common).toBeDefined()
    const languageChoices = ledger.choices.filter((choice) => choice.domain === 'languages')
    expect(languageChoices).toHaveLength(1)
    expect(languageChoices[0].chooseCount).toBe(1)
  })

  test('supports race tool, armor, and weapon proficiency shapes', () => {
    const ledger = applyRaceGrants(
      {
        name: 'Test Race',
        source: 'TST',
        toolProficiencies: [{ any: 2 }, { "poisoner's kit": true }],
        armorProficiencies: [{ light: true }],
        weaponProficiencies: [
          { 'battleaxe|phb': true },
          {
            choose: {
              fromFilter: 'type=martial weapon|miscellaneous=mundane',
              count: 2,
            },
          },
        ],
      },
      undefined,
      emptyProvenance(),
      (domain, fromFilter) =>
        domain === 'weapons' && fromFilter === 'type=martial weapon|miscellaneous=mundane'
          ? ['Longsword', 'Warhammer']
          : [],
    )

    expect(ledger.proficiencies.tools["poisoner's kit"]).toBeDefined()
    expect(ledger.proficiencies.armor.light).toBeDefined()
    expect(ledger.proficiencies.weapons.battleaxe).toBeDefined()

    expect(
      ledger.choices.find(
        (choice) =>
          choice.domain === 'tools' &&
          choice.optionPool.length === 1 &&
          choice.optionPool[0] === 'tool',
      ),
    ).toBeDefined()

    expect(
      ledger.choices.find(
        (choice) =>
          choice.domain === 'weapons' &&
          choice.chooseCount === 2 &&
          choice.optionPool.includes('Longsword') &&
          choice.optionPool.includes('Warhammer'),
      ),
    ).toBeDefined()
  })

  test('synthesizes +2/+1 lineage ability choices by default', () => {
    const ledger = applyRaceGrants(
      {
        name: 'Reborn',
        source: 'VRGR',
        lineage: 'VRGR',
      },
      undefined,
      emptyProvenance(),
    )

    const abilityChoices = ledger.choices.filter((choice) => choice.domain === 'abilityBonuses')
    expect(abilityChoices).toHaveLength(2)
    expect(abilityChoices[0]).toMatchObject({ chooseCount: 1, amount: 2 })
    expect(abilityChoices[1]).toMatchObject({ chooseCount: 1, amount: 1 })
  })

  test('synthesizes +1/+1/+1 lineage ability choices when block 1 is selected', () => {
    const ledger = applyRaceGrants(
      {
        name: 'Reborn',
        source: 'VRGR',
        lineage: 'VRGR',
      },
      undefined,
      emptyProvenance(),
      undefined,
      1,
    )

    const abilityChoices = ledger.choices.filter((choice) => choice.domain === 'abilityBonuses')
    expect(abilityChoices).toHaveLength(3)
    for (const choice of abilityChoices) {
      expect(choice).toMatchObject({ chooseCount: 1, amount: 1 })
    }
  })
})
