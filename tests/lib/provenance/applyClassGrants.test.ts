import { describe, expect, test } from 'vitest'
import { applyClassSpellGrant, emptyProvenance } from '@/lib/provenance'

describe('provenance/applyClassGrants', () => {
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
