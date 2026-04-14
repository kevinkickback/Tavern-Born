import { describe, expect, test } from 'vitest'
import { hasFlexibleRaceOriginAsi } from '@/lib/calculations/abilityScores'
import { ensureOriginLanguageBaseline } from '@/lib/calculations/languageOrigin'
import {
  countOriginFeatUnits,
  ensureOriginSystemInvariants,
  normalizeBackgroundForOriginSystem,
  normalizeRaceSelectionForOriginSystem,
} from '@/lib/calculations/originSystem'
import { applyBackgroundGrants } from '@/lib/provenance/applyBackgroundGrants'
import { applyRaceGrants } from '@/lib/provenance/applyRaceGrants'
import { addGrant } from '@/lib/provenance/ledger'
import { reconcileBackgroundChange, reconcileRaceChange } from '@/lib/provenance/reconciliation'
import { emptyProvenance } from '@/store/characterStore'
import type { Background5e, Race5e } from '@/types/5etools'

describe('originSystem normalization', () => {
  test('2024 strips race ability and feat origin benefits', () => {
    const race: Race5e = {
      name: 'Human',
      source: 'XPHB',
      ability: [{ strength: 1 }],
      feats: [{ anyFromCategory: { category: ['O'], count: 1 } }],
    }

    const normalized = normalizeRaceSelectionForOriginSystem(race, undefined, '2024')

    expect(normalized.race?.ability).toBeUndefined()
    expect(normalized.race?.feats).toBeUndefined()
  })

  test('2024 suppresses lineage-based flexible race ASI during grant application', () => {
    const race: Race5e = {
      name: 'Custom Lineage',
      source: 'TCE',
      lineage: true,
      ability: [{ choose: { from: ['str', 'dex'], count: 1, amount: 2 } }],
    }

    const normalized = normalizeRaceSelectionForOriginSystem(race, undefined, '2024')

    expect(hasFlexibleRaceOriginAsi(normalized.race)).toBe(false)

    const ledger = applyRaceGrants(normalized.race!, undefined, emptyProvenance())

    expect(ledger.abilityBonuses).toHaveLength(0)
    expect(ledger.choices.filter((choice) => choice.domain === 'abilityBonuses')).toHaveLength(0)
    expect(() => ensureOriginSystemInvariants(ledger, '2024')).toThrow(
      '2024 origin system must provide exactly one background origin feat.',
    )
  })

  test('2014 synthesizes flexible race ASI when race data has none', () => {
    const race: Race5e = {
      name: 'Goliath',
      source: 'XPHB',
    }

    const normalized = normalizeRaceSelectionForOriginSystem(race, undefined, '2014')

    expect(normalized.race?._tavernBornFlexibleAsi).toBe(true)
    expect(normalized.race?.feats).toBeUndefined()
  })

  test('2014 preserves race and subrace ASI data while stripping origin feats', () => {
    const race: Race5e = {
      name: 'Elf',
      source: 'PHB',
      ability: [{ dexterity: 2 }],
      feats: [{ anyFromCategory: { category: ['O'], count: 1 } }],
    }
    const subrace: Race5e = {
      name: 'High Elf',
      source: 'PHB',
      ability: [{ intelligence: 1 }],
      feats: [{ anyFromCategory: { category: ['O'], count: 1 } }],
    }

    const normalized = normalizeRaceSelectionForOriginSystem(race, subrace, '2014')

    expect(normalized.race?.ability).toEqual([{ dexterity: 2 }])
    expect(normalized.subrace?.ability).toEqual([{ intelligence: 1 }])
    expect(normalized.race?.feats).toBeUndefined()
    expect(normalized.subrace?.feats).toBeUndefined()
  })

  test('2024 synthesizes background ASI and origin feat when missing', () => {
    const background: Background5e = {
      name: 'Soldier',
      source: 'PHB',
    }

    const normalized = normalizeBackgroundForOriginSystem(background, '2024')

    expect(normalized?.ability).toHaveLength(2)
    expect(normalized?.feats).toEqual([{ anyFromCategory: { category: ['O'], count: 1 } }])
  })

  test('2014 strips background ASI and origin feat grants', () => {
    const background: Background5e = {
      name: 'Acolyte',
      source: 'XPHB',
      ability: [{ choose: { weighted: { from: ['wisdom'], weights: [1] } } }],
      feats: [{ anyFromCategory: { category: ['O'], count: 1 } }],
    }

    const normalized = normalizeBackgroundForOriginSystem(background, '2014')

    expect(normalized?.ability).toBeUndefined()
    expect(normalized?.feats).toBeUndefined()
  })

  test('2024 invariant expects exactly one background origin feat unit', () => {
    let ledger = emptyProvenance()
    ledger = addGrant(ledger, 'feats', 'Alert', {
      sourceType: 'background',
      sourceName: 'Guide',
      grantType: 'fixed',
      label: 'Guide',
    })
    ledger = ensureOriginLanguageBaseline(ledger, '2024')

    expect(countOriginFeatUnits(ledger, '2024')).toBe(1)
    expect(() => ensureOriginSystemInvariants(ledger, '2024')).not.toThrow()
  })

  test('2024: invariants hold after switching race — no duplicate origin grants', () => {
    const raceA: Race5e = {
      name: 'Human',
      source: 'XPHB',
      ability: [{ strength: 1 }],
      feats: [{ anyFromCategory: { category: ['O'], count: 1 } }],
    }
    const raceB: Race5e = {
      name: 'Elf',
      source: 'XPHB',
      ability: [{ dexterity: 2 }],
      feats: [{ anyFromCategory: { category: ['O'], count: 1 } }],
    }
    const background: Background5e = {
      name: 'Acolyte',
      source: 'XPHB',
      ability: [{ choose: { weighted: { from: ['wisdom', 'intelligence'], weights: [2, 1] } } }],
      feats: [{ anyFromCategory: { category: ['O'], count: 1 } }],
    }

    // First selection: Human + Acolyte (2024)
    const normA = normalizeRaceSelectionForOriginSystem(raceA, undefined, '2024')
    const normBg = normalizeBackgroundForOriginSystem(background, '2024')
    let ledger = emptyProvenance()
    ledger = applyRaceGrants(normA.race!, undefined, ledger)
    ledger = applyBackgroundGrants(normBg!, ledger)
    ledger = ensureOriginLanguageBaseline(ledger, '2024')
    expect(() => ensureOriginSystemInvariants(ledger, '2024')).not.toThrow()

    // Switch race to Elf — reconcile then re-apply
    ledger = reconcileRaceChange(ledger, raceA.name, undefined)
    const normB = normalizeRaceSelectionForOriginSystem(raceB, undefined, '2024')
    ledger = applyRaceGrants(normB.race!, undefined, ledger)
    ledger = ensureOriginLanguageBaseline(ledger, '2024')

    // Invariants must still hold with exactly one origin feat (from background)
    expect(() => ensureOriginSystemInvariants(ledger, '2024')).not.toThrow()
    expect(countOriginFeatUnits(ledger, '2024')).toBe(1)
  })

  test('2014: invariants hold after switching background — no stale ASI/feat grants', () => {
    const race: Race5e = {
      name: 'Dwarf',
      source: 'PHB',
      ability: [{ constitution: 2 }],
    }
    const bgA: Background5e = {
      name: 'Acolyte',
      source: 'XPHB',
      ability: [{ choose: { weighted: { from: ['wisdom', 'intelligence'], weights: [2, 1] } } }],
      feats: [{ anyFromCategory: { category: ['O'], count: 1 } }],
    }
    const bgB: Background5e = {
      name: 'Soldier',
      source: 'PHB',
    }

    // Apply Dwarf + Acolyte (2014 — bg ASI/feat stripped by normalizer)
    const normRace = normalizeRaceSelectionForOriginSystem(race, undefined, '2014')
    const normBgA = normalizeBackgroundForOriginSystem(bgA, '2014')
    let ledger = emptyProvenance()
    ledger = applyRaceGrants(normRace.race!, undefined, ledger)
    ledger = applyBackgroundGrants(normBgA!, ledger)
    expect(() => ensureOriginSystemInvariants(ledger, '2014')).not.toThrow()

    // Switch background to Soldier — reconcile then re-apply
    ledger = reconcileBackgroundChange(ledger, bgA.name)
    const normBgB = normalizeBackgroundForOriginSystem(bgB, '2014')
    ledger = applyBackgroundGrants(normBgB!, ledger)

    expect(() => ensureOriginSystemInvariants(ledger, '2014')).not.toThrow()
  })
})
