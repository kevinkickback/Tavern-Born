import { describe, expect, test } from 'vitest'
import { applyBackgroundGrants, applyRaceGrants, emptyProvenance } from '@/lib/provenance'
import {
  applyFeatGrantBlocks,
  parseFeatGrantBlocks,
} from '@/lib/provenance/applyFeatAndOptionalFeatureGrants'

describe('parseFeatGrantBlocks', () => {
  test('returns empty array for undefined/empty input', () => {
    expect(parseFeatGrantBlocks(undefined)).toEqual([])
    expect(parseFeatGrantBlocks([])).toEqual([])
  })

  test('parses fixed feat grant: { "feat name|source": true }', () => {
    const result = parseFeatGrantBlocks([{ 'magic initiate; cleric|xphb': true }])
    expect(result).toEqual([{ type: 'fixed', name: 'magic initiate; cleric', source: 'xphb' }])
  })

  test('parses fixed feat grant without source', () => {
    const result = parseFeatGrantBlocks([{ alert: true }])
    expect(result).toEqual([{ type: 'fixed', name: 'alert', source: '' }])
  })

  test('parses { "any": N } blocks', () => {
    const result = parseFeatGrantBlocks([{ any: 1 }])
    expect(result).toEqual([{ type: 'chooseAny', count: 1 }])
  })

  test('parses anyFromCategory blocks (2024 origin feat)', () => {
    const result = parseFeatGrantBlocks([{ anyFromCategory: { category: ['O'], count: 1 } }])
    expect(result).toEqual([{ type: 'chooseFromCategory', categories: ['O'], count: 1 }])
  })

  test('defaults count to 1 when missing from anyFromCategory', () => {
    const result = parseFeatGrantBlocks([{ anyFromCategory: { category: ['O'] } }])
    expect(result).toEqual([{ type: 'chooseFromCategory', categories: ['O'], count: 1 }])
  })

  test('ignores non-object entries', () => {
    expect(parseFeatGrantBlocks([null, 'invalid', 42])).toEqual([])
  })
})

describe('applyFeatGrantBlocks', () => {
  test('grants a fixed feat to the ledger from a background', () => {
    const ledger = applyFeatGrantBlocks(
      emptyProvenance(),
      [{ 'magic initiate; cleric|xphb': true }],
      'background',
      'Acolyte',
      'XPHB',
    )

    expect(ledger.feats['magic initiate; cleric']).toBeDefined()
    expect(ledger.feats['magic initiate; cleric'][0]).toMatchObject({
      sourceType: 'background',
      sourceName: 'Acolyte',
      grantType: 'fixed',
      sourceRef: 'xphb',
    })
  })

  test('creates a chooseAny choice placeholder from a race (Variant Human)', () => {
    const ledger = applyFeatGrantBlocks(emptyProvenance(), [{ any: 1 }], 'race', 'Human', 'PHB')

    const featChoices = ledger.choices.filter((c) => c.domain === 'feats')
    expect(featChoices).toHaveLength(1)
    expect(featChoices[0]).toMatchObject({
      domain: 'feats',
      chooseCount: 1,
      optionPool: [],
      status: 'pending',
      sourceTag: {
        sourceType: 'race',
        sourceName: 'Human',
        grantType: 'placeholder',
      },
    })
  })

  test('creates a chooseFromCategory choice placeholder (2024 Human origin feat)', () => {
    const ledger = applyFeatGrantBlocks(
      emptyProvenance(),
      [{ anyFromCategory: { category: ['O'], count: 1 } }],
      'race',
      'Human',
      'XPHB',
    )

    const featChoices = ledger.choices.filter((c) => c.domain === 'feats')
    expect(featChoices).toHaveLength(1)
    expect(featChoices[0]).toMatchObject({
      domain: 'feats',
      chooseCount: 1,
      optionPool: ['category:O'],
      status: 'pending',
      sourceTag: {
        sourceType: 'race',
        sourceName: 'Human',
        grantType: 'placeholder',
      },
    })
  })

  test('returns ledger unchanged for undefined/empty blocks', () => {
    const original = emptyProvenance()
    expect(applyFeatGrantBlocks(original, undefined, 'race', 'Elf')).toBe(original)
    expect(applyFeatGrantBlocks(original, [], 'race', 'Elf')).toBe(original)
  })
})

describe('applyRaceGrants feat integration', () => {
  test('Variant Human (PHB) gets a feat choice placeholder', () => {
    const ledger = applyRaceGrants(
      {
        name: 'Human',
        source: 'PHB',
        feats: [{ any: 1 }],
      },
      undefined,
      emptyProvenance(),
    )

    const featChoices = ledger.choices.filter((c) => c.domain === 'feats')
    expect(featChoices).toHaveLength(1)
    expect(featChoices[0]).toMatchObject({
      chooseCount: 1,
      optionPool: [],
      sourceTag: { sourceType: 'race', sourceName: 'Human' },
    })
  })

  test('2024 Human (XPHB) gets origin feat category choice', () => {
    const ledger = applyRaceGrants(
      {
        name: 'Human',
        source: 'XPHB',
        feats: [{ anyFromCategory: { category: ['O'], count: 1 } }],
      },
      undefined,
      emptyProvenance(),
    )

    const featChoices = ledger.choices.filter((c) => c.domain === 'feats')
    expect(featChoices).toHaveLength(1)
    expect(featChoices[0]).toMatchObject({
      chooseCount: 1,
      optionPool: ['category:O'],
      sourceTag: { sourceType: 'race', sourceName: 'Human' },
    })
  })

  test('race without feats produces no feat grants', () => {
    const ledger = applyRaceGrants({ name: 'Elf', source: 'PHB' }, undefined, emptyProvenance())
    expect(Object.keys(ledger.feats)).toHaveLength(0)
    expect(ledger.choices.filter((c) => c.domain === 'feats')).toHaveLength(0)
  })
})

describe('applyBackgroundGrants feat integration', () => {
  test('2024 Acolyte (XPHB) grants Magic Initiate; Cleric', () => {
    const ledger = applyBackgroundGrants(
      {
        name: 'Acolyte',
        source: 'XPHB',
        feats: [{ 'magic initiate; cleric|xphb': true }],
      },
      emptyProvenance(),
    )

    expect(ledger.feats['magic initiate; cleric']).toBeDefined()
    expect(ledger.feats['magic initiate; cleric'][0]).toMatchObject({
      sourceType: 'background',
      sourceName: 'Acolyte',
      grantType: 'fixed',
    })
  })

  test('background without feats produces no feat grants', () => {
    const ledger = applyBackgroundGrants({ name: 'Acolyte', source: 'PHB' }, emptyProvenance())
    expect(Object.keys(ledger.feats)).toHaveLength(0)
  })
})
