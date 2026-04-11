import { describe, expect, test } from 'vitest'
import {
  addAbilityBonus,
  addChoicePlaceholder,
  addGrant,
  clearChoiceSelectionsBySource,
  emptyProvenance,
  removeGrantsBySource,
  removeGrantsBySourceFromDomain,
  replaceSourceGrants,
  resolveChoice,
} from '@/lib/provenance/ledger'
import type { ChoiceRecord, SourceTag } from '@/lib/provenance/types'

const raceTag: SourceTag = {
  sourceType: 'race',
  sourceName: 'Elf',
  sourceRef: 'PHB',
  grantType: 'fixed',
  label: 'Elf',
}

const classTag: SourceTag = {
  sourceType: 'class',
  sourceName: 'Wizard',
  sourceRef: 'PHB',
  grantType: 'fixed',
  label: 'Wizard',
}

describe('provenance/ledger', () => {
  test('addGrant normalizes keys and is idempotent for duplicate tags', () => {
    let ledger = emptyProvenance()

    ledger = addGrant(ledger, 'skills', '{@skill Arcana|PHB}', raceTag)
    ledger = addGrant(ledger, 'skills', 'arcana', raceTag)

    expect(Object.keys(ledger.proficiencies.skills)).toEqual(['arcana'])
    expect(ledger.proficiencies.skills.arcana).toHaveLength(1)
  })

  test('removeGrantsBySourceFromDomain removes matching tags and prunes empty keys', () => {
    let ledger = emptyProvenance()
    ledger = addGrant(ledger, 'skills', 'Stealth', raceTag)
    ledger = addGrant(ledger, 'skills', 'Stealth', classTag)

    const afterRaceRemoval = removeGrantsBySourceFromDomain(ledger, 'skills', 'race', 'Elf')
    expect(afterRaceRemoval.proficiencies.skills.stealth).toEqual([classTag])

    const afterClassRemoval = removeGrantsBySourceFromDomain(
      afterRaceRemoval,
      'skills',
      'class',
      'Wizard',
    )
    expect(afterClassRemoval.proficiencies.skills.stealth).toBeUndefined()
  })

  test('removeGrantsBySource removes entries across maps, ability bonuses, and choices', () => {
    let ledger = emptyProvenance()
    ledger = addGrant(ledger, 'features', 'darkvision', raceTag)
    ledger = addGrant(ledger, 'skills', 'Perception', raceTag)
    ledger = addAbilityBonus(ledger, {
      ability: 'dexterity',
      value: 2,
      sourceTag: raceTag,
    })
    ledger = addChoicePlaceholder(ledger, {
      id: 'choice-1',
      domain: 'skills',
      sourceTag: raceTag,
      chooseCount: 1,
      optionPool: ['Arcana', 'History'],
      selected: ['Arcana'],
      status: 'resolved',
    })

    const cleaned = removeGrantsBySource(ledger, 'race', 'Elf')

    expect(cleaned.features.darkvision).toBeUndefined()
    expect(cleaned.proficiencies.skills.perception).toBeUndefined()
    expect(cleaned.abilityBonuses).toEqual([])
    expect(cleaned.choices).toEqual([])
  })

  test('replaceSourceGrants clears old source entries before reapplying', () => {
    let ledger = emptyProvenance()
    ledger = addGrant(ledger, 'skills', 'Arcana', raceTag)

    const replaced = replaceSourceGrants(ledger, 'race', 'Elf', (cleared) =>
      addGrant(cleared, 'skills', 'Perception', raceTag),
    )

    expect(replaced.proficiencies.skills.arcana).toBeUndefined()
    expect(replaced.proficiencies.skills.perception).toEqual([raceTag])
  })

  test('addAbilityBonus is idempotent for identical records', () => {
    let ledger = emptyProvenance()
    const bonus = {
      ability: 'intelligence',
      value: 1,
      sourceTag: classTag,
    } as const

    ledger = addAbilityBonus(ledger, bonus)
    ledger = addAbilityBonus(ledger, bonus)

    expect(ledger.abilityBonuses).toEqual([bonus])
  })

  test('addChoicePlaceholder is idempotent by id', () => {
    let ledger = emptyProvenance()
    const choice: ChoiceRecord = {
      id: 'choice-dup',
      domain: 'skills',
      sourceTag: classTag,
      chooseCount: 1,
      optionPool: ['Arcana', 'History'],
      selected: [],
      status: 'pending',
    }

    ledger = addChoicePlaceholder(ledger, choice)
    ledger = addChoicePlaceholder(ledger, choice)

    expect(ledger.choices).toHaveLength(1)
  })

  test('resolveChoice computes pending, partially-resolved, and resolved statuses', () => {
    let ledger = emptyProvenance()
    ledger = addChoicePlaceholder(ledger, {
      id: 'choice-status',
      domain: 'skills',
      sourceTag: classTag,
      chooseCount: 2,
      optionPool: ['Arcana', 'History', 'Religion'],
      selected: [],
      status: 'pending',
    })

    ledger = resolveChoice(ledger, 'choice-status', [])
    expect(ledger.choices[0]?.status).toBe('pending')

    ledger = resolveChoice(ledger, 'choice-status', ['Arcana'])
    expect(ledger.choices[0]?.status).toBe('partially-resolved')

    ledger = resolveChoice(ledger, 'choice-status', ['Arcana', 'History'])
    expect(ledger.choices[0]?.status).toBe('resolved')
  })

  test('clearChoiceSelectionsBySource resets only matching source choices', () => {
    let ledger = emptyProvenance()
    ledger = addChoicePlaceholder(ledger, {
      id: 'choice-a',
      domain: 'skills',
      sourceTag: raceTag,
      chooseCount: 1,
      optionPool: ['Arcana'],
      selected: ['Arcana'],
      status: 'resolved',
    })
    ledger = addChoicePlaceholder(ledger, {
      id: 'choice-b',
      domain: 'skills',
      sourceTag: classTag,
      chooseCount: 1,
      optionPool: ['History'],
      selected: ['History'],
      status: 'resolved',
    })

    const cleared = clearChoiceSelectionsBySource(ledger, 'race', 'Elf')

    expect(cleared.choices.find((c) => c.id === 'choice-a')).toMatchObject({
      selected: [],
      status: 'pending',
    })
    expect(cleared.choices.find((c) => c.id === 'choice-b')).toMatchObject({
      selected: ['History'],
      status: 'resolved',
    })
  })
})
