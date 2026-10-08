import { describe, expect, test } from 'vitest'
import { getFixedFeatOptionKey, resolveFixedFeatGrant } from '@/lib/featGrants'
import type { SourceTag } from '@/lib/provenance/types'
import { validateFeatSetup } from '@/lib/readiness/coreReadiness'
import type { Feat5e } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const revised = {
  name: 'Magic Initiate',
  source: 'XPHB',
  additionalSpells: [{ name: 'Cleric Spells' }],
} as Feat5e
const older = { ...revised, source: 'PHB', entries: ['Different printed rules.'] }
const tag: SourceTag = {
  sourceType: 'background',
  sourceName: 'Acolyte',
  sourceRef: 'XPHB',
  grantSource: 'XPHB',
  grantType: 'fixed',
  grantVariant: 'cleric',
  label: 'Acolyte',
}

describe('fixed feat printing identity', () => {
  test('preserves an explicit missing source and variant without borrowing another printing', () => {
    const input = { catalog: [older], tag }
    const before = structuredClone(input)
    const resolved = resolveFixedFeatGrant(input.catalog, 'magic initiate', input.tag)
    expect(resolved.feat).toBeUndefined()
    expect(resolved.name).toBe('magic initiate')
    expect(resolved.source).toBe('XPHB')
    expect(resolved.variant).toBe('cleric')
    expect(resolved.fixedSpellcastingClass).toBeUndefined()
    expect(getFixedFeatOptionKey(resolved.name, resolved.source, resolved.variant)).toBe(
      'magic initiate|xphb|cleric',
    )
    expect(input).toEqual(before)
  })

  test('resolves an exact printing regardless of order or identity casing', () => {
    expect(
      resolveFixedFeatGrant([older, revised], 'MAGIC INITIATE', {
        ...tag,
        grantSource: 'xphb',
      }).feat,
    ).toBe(revised)
  })

  test('ignores boundary whitespace without changing the target printing', () => {
    expect(
      resolveFixedFeatGrant([older, revised], ' Magic Initiate ', {
        ...tag,
        grantSource: ' XPHB ',
      }).feat,
    ).toBe(revised)
  })

  test.each([
    undefined,
    '',
    '  ',
  ])('keeps ambiguous unqualified grants unresolved: %j', (grantSource) => {
    const resolved = resolveFixedFeatGrant([older, revised], 'Magic Initiate', {
      ...tag,
      grantSource,
    })
    expect(resolved.feat).toBeUndefined()
    expect(resolved.source).toBe(grantSource?.trim() ?? '')
    expect(resolved.fixedSpellcastingClass).toBeUndefined()
  })

  test('does not guess an unqualified grant from a unique printing', () => {
    const resolved = resolveFixedFeatGrant([revised], 'magic initiate', {
      ...tag,
      grantSource: undefined,
    })
    expect(resolved.feat).toBeUndefined()
    expect(resolved.source).toBe('')
    expect(resolved.fixedSpellcastingClass).toBeUndefined()
  })

  test('uses the exact raw target when only a different printing is visible', () => {
    const resolved = resolveFixedFeatGrant([older], 'magic initiate', tag, [revised])
    expect(resolved.feat).toBe(revised)
    expect(resolved.source).toBe('XPHB')
    expect(resolved.fixedSpellcastingClass).toBe('Cleric Spells')
  })

  test('prefers an exact primary target to a duplicate raw target', () => {
    expect(resolveFixedFeatGrant([revised], 'Magic Initiate', tag, [{ ...revised }]).feat).toBe(
      revised,
    )
  })

  test('does not substitute a different raw printing for a missing explicit target', () => {
    expect(resolveFixedFeatGrant([], 'Magic Initiate', tag, [older]).feat).toBeUndefined()
  })

  test('does not infer an unqualified target from duplicate primary/raw records', () => {
    expect(
      resolveFixedFeatGrant(
        [revised],
        'Magic Initiate',
        {
          ...tag,
          grantSource: undefined,
        },
        [{ ...revised }],
      ).feat,
    ).toBeUndefined()
  })

  test('does not infer an unqualified target when another printing is hidden', () => {
    expect(
      resolveFixedFeatGrant(
        [revised],
        'Magic Initiate',
        {
          ...tag,
          grantSource: undefined,
        },
        [older],
      ).feat,
    ).toBeUndefined()
  })

  test('reports a missing fixed printing even when options for that UID were saved', () => {
    const character = makeCharacterFixture({
      feats: [],
      specialFeats: [],
      classFeatChoices: [],
      provenance: {
        ...makeCharacterFixture().provenance!,
        feats: { 'magic initiate': [tag] },
        choices: [],
      },
      fixedFeatOptions: { 'magic initiate|xphb|cleric': { spellcastingClass: 'Cleric Spells' } },
    })
    const before = structuredClone(character)
    expect(validateFeatSetup(character, { 'Magic Initiate|PHB': older })).toEqual([
      expect.objectContaining({
        severity: 'blocking',
        section: 'feats',
        title: 'Resolve magic initiate',
        explanation: expect.stringContaining('XPHB'),
      }),
    ])
    expect(character).toEqual(before)
  })

  test('reports unqualified fixed identity instead of guessing a printing', () => {
    const character = makeCharacterFixture({
      feats: [],
      specialFeats: [],
      classFeatChoices: [],
      provenance: {
        ...makeCharacterFixture().provenance!,
        feats: { 'magic initiate': [{ ...tag, grantSource: undefined }] },
        choices: [],
      },
    })
    expect(
      validateFeatSetup(character, {
        'Magic Initiate|PHB': older,
        'Magic Initiate|XPHB': revised,
      }),
    ).toEqual([
      expect.objectContaining({
        title: 'Resolve magic initiate',
        explanation: expect.stringContaining('does not identify its source'),
      }),
    ])
  })

  test('retains separate missing-data issues for distinct fixed variants', () => {
    const character = makeCharacterFixture({
      feats: [],
      specialFeats: [],
      classFeatChoices: [],
      provenance: {
        ...makeCharacterFixture().provenance!,
        feats: {
          'magic initiate': [tag, { ...tag, grantVariant: 'druid' }],
        },
        choices: [],
      },
    })
    const issues = validateFeatSetup(character, {})
    expect(issues).toHaveLength(2)
    expect(new Set(issues.map((issue) => issue.id)).size).toBe(2)
    expect(issues.every((issue) => issue.navigationTarget === '/feats?view=character')).toBe(true)
  })

  test('accepts existing options when the exact fixed printing is available', () => {
    const character = makeCharacterFixture({
      feats: [],
      specialFeats: [],
      classFeatChoices: [],
      provenance: {
        ...makeCharacterFixture().provenance!,
        feats: { 'magic initiate': [tag] },
        choices: [],
      },
      fixedFeatOptions: { 'magic initiate|xphb|cleric': { spellcastingClass: 'Cleric Spells' } },
    })
    expect(validateFeatSetup(character, { 'Magic Initiate|XPHB': revised })).toEqual([])
  })
})
