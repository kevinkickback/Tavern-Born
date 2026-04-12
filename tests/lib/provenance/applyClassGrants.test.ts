import { describe, expect, test } from 'vitest'
import { applyClassGrants, applyClassSpellGrant, emptyProvenance } from '@/lib/provenance'

describe('provenance/applyClassGrants', () => {
  test('applies multiclass proficienciesGained when isMulticlassGrant is true', () => {
    const ledger = applyClassGrants(
      {
        name: 'Fighter',
        source: 'PHB',
        proficiency: ['str', 'con'],
        startingProficiencies: {
          armor: ['light', 'medium', 'heavy', 'shields'],
          weapons: ['simple', 'martial'],
        },
        multiclassing: {
          proficienciesGained: {
            armor: ['light', 'medium', 'shields'],
            weapons: ['simple', 'martial'],
          },
        },
      },
      undefined,
      emptyProvenance(),
      { isMulticlassGrant: true },
    )

    expect(ledger.proficiencies.armor.light?.length ?? 0).toBeGreaterThan(0)
    expect(ledger.proficiencies.armor.medium?.length ?? 0).toBeGreaterThan(0)
    expect(ledger.proficiencies.armor.shields?.length ?? 0).toBeGreaterThan(0)
    expect(ledger.proficiencies.armor.heavy).toBeUndefined()
    expect(ledger.proficiencies.weapons.simple?.length ?? 0).toBeGreaterThan(0)
    expect(ledger.proficiencies.weapons.martial?.length ?? 0).toBeGreaterThan(0)
    expect(ledger.proficiencies.savingThrows.str).toBeUndefined()
    expect(ledger.proficiencies.savingThrows.con).toBeUndefined()
  })

  test('applies starting proficiencies and saving throws for non-multiclass grants', () => {
    const ledger = applyClassGrants(
      {
        name: 'Fighter',
        source: 'PHB',
        proficiency: ['str', 'con'],
        startingProficiencies: {
          armor: ['light', 'medium', 'heavy', 'shields'],
          weapons: ['simple', 'martial'],
        },
        multiclassing: {
          proficienciesGained: {
            armor: ['light', 'medium', 'shields'],
            weapons: ['simple', 'martial'],
          },
        },
      },
      undefined,
      emptyProvenance(),
    )

    expect(ledger.proficiencies.armor.heavy?.length ?? 0).toBeGreaterThan(0)
    expect(ledger.proficiencies.savingThrows.str?.length ?? 0).toBeGreaterThan(0)
    expect(ledger.proficiencies.savingThrows.con?.length ?? 0).toBeGreaterThan(0)
  })

  test('does not grant class starting equipment for multiclass grants', () => {
    const ledger = applyClassGrants(
      {
        name: 'Fighter',
        source: 'PHB',
        multiclassing: {
          proficienciesGained: {
            armor: ['light'],
          },
        },
        startingEquipment: {
          defaultData: [
            {
              A: [{ item: '{@item chain mail|phb}' }],
            },
          ],
        },
      },
      undefined,
      emptyProvenance(),
      { isMulticlassGrant: true },
    )

    expect(Object.keys(ledger.equipment)).toHaveLength(0)
  })

  test('applies structured tool proficiency blocks and skill choices', () => {
    const ledger = applyClassGrants(
      {
        name: 'Bard',
        source: 'PHB',
        startingProficiencies: {
          toolProficiencies: [
            {
              anyMusicalInstrument: 3,
            },
          ],
          skills: {
            choose: {
              from: ['arcana', 'history', 'performance'],
              count: 2,
            },
          },
        },
      },
      undefined,
      emptyProvenance(),
    )

    const musicChoice = ledger.choices.find((choice) => choice.id.includes(':tools:generic:'))
    expect(musicChoice).toBeTruthy()
    expect(musicChoice?.chooseCount).toBe(3)

    const skillsChoice = ledger.choices.find((choice) => choice.id.includes(':skills:choose'))
    expect(skillsChoice).toBeTruthy()
    expect(skillsChoice?.chooseCount).toBe(2)
    expect(skillsChoice?.optionPool).toEqual(expect.arrayContaining(['arcana', 'history']))
  })

  test('applyClassSpellGrant replaces existing class spell attribution for same class/source', () => {
    let ledger = emptyProvenance()

    ledger = applyClassSpellGrant(ledger, 'Wizard', 'PHB', 'Fireball', 'choice', {
      spellGrantedAtLevel: 5,
      spellAttributionMode: 'inferred-lowest-eligible',
    })

    ledger = applyClassSpellGrant(ledger, 'Wizard', 'PHB', 'Fireball', 'choice', {
      spellGrantedAtLevel: 3,
      spellAttributionMode: 'exact',
    })

    const tags = ledger.spells.fireball ?? []
    expect(tags).toHaveLength(1)
    expect(tags[0]).toMatchObject({
      sourceType: 'class',
      sourceName: 'Wizard',
      sourceRef: 'PHB',
      spellGrantedAtLevel: 3,
      spellAttributionMode: 'exact',
    })
  })

  test('applyClassSpellGrant keeps spell attribution from different sources', () => {
    let ledger = emptyProvenance()

    ledger = applyClassSpellGrant(ledger, 'Wizard', 'PHB', 'Shield', 'choice', {
      spellGrantedAtLevel: 1,
      spellAttributionMode: 'exact',
    })

    ledger = applyClassSpellGrant(ledger, 'Sorcerer', 'PHB', 'Shield', 'choice', {
      spellGrantedAtLevel: 1,
      spellAttributionMode: 'exact',
    })

    const tags = ledger.spells.shield ?? []
    expect(tags).toHaveLength(2)
    expect(tags.map((tag) => `${tag.sourceName}|${tag.sourceRef ?? ''}`)).toEqual(
      expect.arrayContaining(['Wizard|PHB', 'Sorcerer|PHB']),
    )
  })
})
