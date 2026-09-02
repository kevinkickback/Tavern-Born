import { describe, expect, test } from 'vitest'
import {
  getFixedFeatOptionKey,
  getFixedSpellcastingClass,
  resolveFixedFeatGrant,
} from '@/lib/featGrants'
import type { SourceTag } from '@/lib/provenance/types'
import type { Feat5e } from '@/types/5etools'

const magicInitiate = {
  name: 'Magic Initiate',
  source: 'XPHB',
  entries: ['You gain the following benefits.'],
  additionalSpells: [
    { name: 'Cleric Spells' },
    { name: 'Druid Spells' },
    { name: 'Wizard Spells' },
  ],
} as Feat5e

function fixedTag(variant?: string): SourceTag {
  return {
    sourceType: 'background',
    sourceName: 'Acolyte',
    sourceRef: 'xphb',
    grantType: 'fixed',
    grantVariant: variant,
    label: 'Acolyte',
  }
}

describe('fixed feat grant resolution', () => {
  test('resolves a parameterized grant to its canonical feat and spell list', () => {
    const resolved = resolveFixedFeatGrant([magicInitiate], 'magic initiate', fixedTag('cleric'))

    expect(resolved.feat).toBe(magicInitiate)
    expect(resolved.name).toBe('Magic Initiate')
    expect(resolved.variantLabel).toBe('Cleric')
    expect(resolved.fixedSpellcastingClass).toBe('Cleric Spells')
  })

  test('prefers the feat with the matching source', () => {
    const legacy = { ...magicInitiate, source: 'PHB' }
    expect(resolveFixedFeatGrant([legacy, magicInitiate], 'Magic Initiate', fixedTag()).feat).toBe(
      magicInitiate,
    )
  })

  test('leaves ordinary fixed feats unconstrained', () => {
    const alert = { name: 'Alert', source: 'XPHB' } as Feat5e
    const resolved = resolveFixedFeatGrant([alert], 'alert', fixedTag())

    expect(resolved.name).toBe('Alert')
    expect(resolved.variant).toBeUndefined()
    expect(resolved.fixedSpellcastingClass).toBeUndefined()
  })

  test('does not invent a class when the variant has no matching spell entry', () => {
    expect(getFixedSpellcastingClass(magicInitiate, 'bard')).toBeUndefined()
  })

  test('builds stable case-insensitive option keys', () => {
    expect(getFixedFeatOptionKey('Magic Initiate', 'XPHB', 'Cleric')).toBe(
      'magic initiate|xphb|cleric',
    )
  })
})
