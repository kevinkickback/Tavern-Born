import { expect, test } from 'vitest'
import * as identity from '@/lib/5etools/classFeatureIdentity'
import { OPTIONAL_CLASS_FEATURE_RULES } from '@/lib/5etools/optionalClassFeatureRules'
import { subclassProficiencyDigest } from '@/lib/5etools/subclassProficiencyCertificates'
import * as preparation from '@/lib/5etools/subclassSourcePreparation'
import { deriveOptionalClassFeatureRules } from '../../scripts/lib/optional-class-feature-source.mjs'
import { optionalClassSources } from '../fixtures/optionalClassFeatureFixtures'

const api = {
  classIdentity: identity.getClassFeatureIdentity,
  subclassIdentity: identity.getSubclassFeatureIdentity,
  decodeClass: identity.decodeClassFeatureReference,
  materializeSubclassFeatures: preparation.materializeSubclassFeatureCopies,
  digest: subclassProficiencyDigest,
}
const derive = (document = optionalClassSources) =>
  deriveOptionalClassFeatureRules([document], document.variantrule, api)
test('real pilot bodies and independently captured classification identities reproduce the bounded checkpoint', () => {
  expect(derive()).toEqual(OPTIONAL_CLASS_FEATURE_RULES)
  expect(derive().roots).toHaveLength(3)
  expect(derive().features).toHaveLength(11)
  expect(derive().knownOptionalTargets).toHaveLength(50)
})
test.each([
  'root qualifier',
  'child clause',
  'mixed facet order',
  'compatible Foe Slayer',
  'rule meaning',
  'lost optional flag',
  'class owner duplicate',
  'declaration wrapper',
])('ordinary regeneration cannot certify a changed %s', (mode) => {
  const doc = structuredClone(optionalClassSources)
  const ranger = doc.class.find((row) => row.name === 'Ranger' && row.source === 'PHB')!
  const deft = doc.classFeature.find(
    (row) => row.name === 'Deft Explorer' && row.classSource === 'PHB',
  )!
  if (mode === 'root qualifier') deft.qualifier = 'Only at night'
  if (mode === 'child clause') {
    const child = doc.classFeature.find(
      (row) => row.name === 'Deft Explorer Improvement' && row.level === 6,
    )!
    ;(child.entries as unknown[]).push('Only while alone.')
  }
  if (mode === 'mixed facet order') {
    const gain = doc.classFeature.find(
      (row) => row.name === 'Favored Enemy and Natural Explorer improvements',
    )!
    gain.entries = [...(gain.entries as unknown[])].reverse()
  }
  if (mode === 'compatible Foe Slayer') {
    const feature = doc.classFeature.find(
      (row) => row.name === 'Foe Slayer' && row.classSource === 'PHB',
    )!
    ;(feature.entries as unknown[]).push('Only with the original Favored Enemy feature.')
  }
  if (mode === 'rule meaning')
    (doc.variantrule[0].entries as unknown[]).push('All options are gained automatically.')
  if (mode === 'lost optional flag') delete deft.isClassFeatureVariant
  if (mode === 'class owner duplicate') doc.class.push(structuredClone(ranger))
  if (mode === 'declaration wrapper')
    ranger.classFeatures = (ranger.classFeatures as unknown[]).map((row) =>
      row === 'Deft Explorer|Ranger||1|TCE'
        ? { classFeature: row, condition: 'Only at night' }
        : row,
    )
  expect(() => derive(doc)).toThrow()
  expect(derive()).toEqual(OPTIONAL_CLASS_FEATURE_RULES)
})
