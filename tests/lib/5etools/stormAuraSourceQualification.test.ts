import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { featureOptionRulesSignature } from '@/lib/5etools/featureRulesSignature'
import { auditFeatureOptionSources } from '@/lib/5etools/featureTableOptions'
import {
  getAuditedStormSourceDigest,
  getStormRulesDigest,
  hasStormSourceShape,
  isAuditedStormFeature,
} from '@/lib/5etools/stormAuraSource'
import { makeStormAuraFixture } from '../../fixtures/stormAuraFixtures'

// Deliberately unmocked: short controlled fixtures do not establish production source authority.
test('audited body lookup is exact per complete target', () => {
  expect(
    getAuditedStormSourceDigest('subclass-feature|sea|barbarian|phb|storm herald|xge|6|xge'),
  ).toBe('69e918b7eeb60770357d6902c8244bd398718b177890614abda31d2d309cd768')
  expect(
    getAuditedStormSourceDigest('subclass-feature|sea|barbarian|xphb|storm herald|xge|6|xge'),
  ).toBeUndefined()
  expect(
    getAuditedStormSourceDigest('subclass-feature|sea|barbarian|phb|storm herald|xge|6|phb'),
  ).toBeUndefined()
})
test('canonical digest ignores object key order and attached enrichment, preserves rules structure', () => {
  const first = [
    {
      type: 'entries',
      name: 'Synthetic',
      entries: ['A', 'B'],
      feature: { entries: ['Enrichment'] },
      featureOptionSourceConflict: true,
    },
  ]
  const canonical = '[{"entries":["A","B"],"name":"Synthetic","type":"entries"}]'
  expect(featureOptionRulesSignature(first)).toBe(canonical)
  expect(getStormRulesDigest(first)).toBe(createHash('sha256').update(canonical).digest('hex'))
  expect(getStormRulesDigest([{ name: 'Synthetic', entries: ['A', 'B'], type: 'entries' }])).toBe(
    getStormRulesDigest(first),
  )
  expect(
    getStormRulesDigest([{ type: 'entries', name: 'Synthetic', entries: ['B', 'A'] }]),
  ).not.toBe(getStormRulesDigest(first))
  expect(
    getStormRulesDigest([
      { type: 'entries', name: 'Synthetic', entries: ['A', 'B'], condition: 'Only underwater' },
    ]),
  ).not.toBe(getStormRulesDigest(first))
  const cyclic: unknown[] = []
  cyclic.push(cyclic)
  expect(getStormRulesDigest(cyclic)).toBeUndefined()
})
test('real qualifier rejects authored fixtures, unknown metadata and claimed audit flags', () => {
  const f = makeStormAuraFixture()
  const row = f.document.subclassFeature.find((value) => value.name === 'Sea' && value.level === 6)!
  expect(hasStormSourceShape(row)).toBe(true)
  expect(isAuditedStormFeature(row)).toBe(false)
  for (const field of ['prerequisite', 'condition', 'activation'])
    expect(hasStormSourceShape({ ...row, [field]: 'New qualifier' })).toBe(false)
  expect(isAuditedStormFeature({ ...row, featureOptionSourceConflict: false, entries: [] })).toBe(
    false,
  )
  expect(
    auditFeatureOptionSources([row as unknown as Record<string, unknown>])[0]
      .featureOptionSourceConflict,
  ).toBe(true)
})
