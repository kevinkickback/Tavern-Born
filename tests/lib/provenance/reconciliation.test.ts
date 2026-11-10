import { describe, expect, test } from 'vitest'
import {
  addAbilityBonus,
  addChoicePlaceholder,
  addGrant,
  addSpellGrant,
  emptyProvenance,
} from '@/lib/provenance/ledger'
import {
  diffProficiencyGrants,
  reconcileBackgroundChange,
  reconcileClassChange,
  reconcileRaceChange,
  reconcileSubraceChange,
} from '@/lib/provenance/reconciliation'
import type { SourceTag } from '@/lib/provenance/types'

const raceTag: SourceTag = {
  sourceType: 'race',
  sourceName: 'Elf',
  grantType: 'fixed',
  label: 'Elf',
}

const subraceTag: SourceTag = {
  sourceType: 'subrace',
  sourceName: 'High Elf',
  grantType: 'fixed',
  label: 'High Elf',
}

const classTag: SourceTag = {
  sourceType: 'class',
  sourceName: 'Wizard',
  grantType: 'fixed',
  label: 'Wizard',
}

const classTagCleric: SourceTag = {
  sourceType: 'class',
  sourceName: 'Cleric',
  grantType: 'fixed',
  label: 'Cleric',
}

const subclassTag: SourceTag = {
  sourceType: 'subclass',
  sourceName: 'Evocation',
  grantType: 'fixed',
  label: 'Evocation',
}

const backgroundTag: SourceTag = {
  sourceType: 'background',
  sourceName: 'Acolyte',
  grantType: 'fixed',
  label: 'Acolyte',
}

describe('provenance/reconciliation', () => {
  test('reconcileRaceChange removes old race and old subrace grants', () => {
    let ledger = emptyProvenance()
    ledger = addGrant(ledger, 'languages', 'Common', raceTag)
    ledger = addSpellGrant(ledger, 'Fire Bolt', subraceTag)

    const reconciled = reconcileRaceChange(ledger, { name: 'Elf' }, { name: 'High Elf' })

    expect(reconciled.proficiencies.languages.common).toBeUndefined()
    expect(reconciled.spells['fire bolt']).toBeUndefined()
  })

  test('reconcileSubraceChange removes only subrace grants', () => {
    let ledger = emptyProvenance()
    ledger = addGrant(ledger, 'languages', 'Common', raceTag)
    ledger = addSpellGrant(ledger, 'Fire Bolt', subraceTag)

    const reconciled = reconcileSubraceChange(ledger, { name: 'High Elf' })

    expect(reconciled.proficiencies.languages.common).toEqual([raceTag])
    expect(reconciled.spells['fire bolt']).toBeUndefined()
  })

  test('reconcileClassChange removes old class and subclass grants', () => {
    let ledger = emptyProvenance()
    ledger = addGrant(ledger, 'savingThrows', 'intelligence', classTag)
    ledger = addGrant(ledger, 'features', 'sculpt spells', subclassTag)

    const reconciled = reconcileClassChange(
      ledger,
      { name: 'Wizard', source: 'PHB', levels: 3, subclass: 'Evocation', subclassSource: 'PHB' },
      [],
    )

    expect(reconciled.proficiencies.savingThrows.intelligence).toBeUndefined()
    expect(reconciled.features['sculpt spells']).toBeUndefined()
  })

  test('reconcileBackgroundChange removes old background grants', () => {
    let ledger = emptyProvenance()
    ledger = addGrant(ledger, 'skills', 'Insight', backgroundTag)

    const reconciled = reconcileBackgroundChange(ledger, 'Acolyte')

    expect(reconciled.proficiencies.skills.insight).toBeUndefined()
  })

  test('diffProficiencyGrants returns only keys exclusively owned by source', () => {
    let ledger = emptyProvenance()
    ledger = addGrant(ledger, 'skills', 'Arcana', classTag)
    ledger = addGrant(ledger, 'skills', 'History', classTag)
    ledger = addGrant(ledger, 'skills', 'History', raceTag)

    const diff = diffProficiencyGrants(ledger, 'skills', 'class', 'Wizard')

    expect(diff.toRemove).toEqual(['arcana'])
  })

  test('reconcileRaceChange preserves grants still attributed to other sources', () => {
    let ledger = emptyProvenance()
    ledger = addGrant(ledger, 'skills', 'History', raceTag)
    ledger = addGrant(ledger, 'skills', 'History', classTag)
    ledger = addGrant(ledger, 'skills', 'Perception', raceTag)

    const reconciled = reconcileRaceChange(ledger, { name: 'Elf' }, undefined)

    expect(reconciled.proficiencies.skills.history).toEqual([classTag])
    expect(reconciled.proficiencies.skills.perception).toBeUndefined()
  })

  test('reconcileBackgroundChange removes background choices and ability bonuses', () => {
    let ledger = emptyProvenance()
    ledger = addAbilityBonus(ledger, {
      ability: 'wisdom',
      value: 1,
      sourceTag: backgroundTag,
    })
    ledger = addChoicePlaceholder(ledger, {
      id: 'background:skill:acolyte',
      domain: 'skills',
      sourceTag: backgroundTag,
      chooseCount: 2,
      optionPool: ['Insight', 'Religion'],
      selected: ['Insight'],
      status: 'partially-resolved',
    })
    ledger = addChoicePlaceholder(ledger, {
      id: 'class:skill:wizard',
      domain: 'skills',
      sourceTag: classTag,
      chooseCount: 2,
      optionPool: ['Arcana', 'History'],
      selected: ['Arcana'],
      status: 'partially-resolved',
    })

    const reconciled = reconcileBackgroundChange(ledger, 'Acolyte')

    expect(reconciled.abilityBonuses).toEqual([])
    expect(reconciled.choices).toHaveLength(1)
    expect(reconciled.choices[0]?.sourceTag.sourceType).toBe('class')
    expect(reconciled.choices[0]?.sourceTag.sourceName).toBe('Wizard')
  })

  test('reconcileClassChange removes only the replaced class in multiclass state', () => {
    let ledger = emptyProvenance()
    ledger = addSpellGrant(ledger, 'Magic Missile', classTag)
    ledger = addSpellGrant(ledger, 'Cure Wounds', classTagCleric)

    const reconciled = reconcileClassChange(ledger, { name: 'Wizard', source: 'PHB', levels: 1 }, [
      { name: 'Cleric', source: 'PHB', levels: 1 },
    ])

    expect(reconciled.spells['magic missile']).toBeUndefined()
    expect(reconciled.spells['cure wounds']).toEqual([classTagCleric])
  })

  test.each([
    [' artificer ', false],
    [' wizard ', true],
  ])('retains a matching subclass grant only within its parent class (%s)', (name, retained) => {
    const tag = { ...subclassTag, sourceRef: 'EXAMPLE' }
    const ledger = addGrant(emptyProvenance(), 'features', 'sculpt spells', tag)
    const reconciled = reconcileClassChange(
      ledger,
      {
        name: 'Wizard',
        source: 'PHB',
        levels: 3,
        subclass: 'Evocation',
        subclassSource: 'EXAMPLE',
      },
      [{ name, source: 'XPHB', levels: 3, subclass: ' evocation ', subclassSource: 'example' }],
    )

    expect(reconciled.features['sculpt spells']).toEqual(retained ? [tag] : undefined)
  })

  test.each([
    [
      'exact retained owner',
      'EXAMPLE',
      'subclass-feature|evocation|wizard|xphb|evocation|xphb|3|xphb',
      5,
      true,
    ],
    [
      'conflicting printing',
      'OTHER',
      'subclass-feature|evocation|wizard|xphb|evocation|xphb|3|xphb',
      5,
      false,
    ],
    ['incomplete feature', 'EXAMPLE', 'subclass-feature|', 5, false],
    [
      'invalid gain level',
      'EXAMPLE',
      'subclass-feature|evocation|wizard|xphb|evocation|xphb|3|xphb',
      -1,
      false,
    ],
  ])('checks a named spell’s retained subclass attribution (%s)', (_, source, target, level, kept) => {
    const tag: SourceTag = {
      ...subclassTag,
      sourceRef: 'EXAMPLE',
      grantVariant: JSON.stringify(['Mage', 'EXAMPLE', 'Evocation', source, target, level]),
    }
    const ledger = addSpellGrant(emptyProvenance(), 'Fireball|XPHB', tag)
    const reconciled = reconcileClassChange(
      ledger,
      {
        name: 'Wizard',
        source: 'XPHB',
        levels: 5,
        subclass: 'Evocation',
        subclassSource: 'EXAMPLE',
      },
      [
        {
          name: 'Mage',
          source: 'EXAMPLE',
          levels: 5,
          subclass: 'Evocation',
          subclassSource: source,
        },
      ],
    )

    expect(!!reconciled.spells.fireball).toBe(kept)
  })
})
