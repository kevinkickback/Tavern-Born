import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import * as identity from '@/lib/5etools/classFeatureIdentity'
import { getFeatureSourceDigest } from '@/lib/5etools/featureSourceAudit'
import {
  DIRECT_FIXED_CLASS_CERTIFICATES,
  FIXED_PROFICIENCY_RULES,
} from '@/lib/5etools/fixedProficiencyRules'
import * as certificates from '@/lib/5etools/subclassProficiencyCertificates'
import * as preparation from '@/lib/5etools/subclassSourcePreparation'
import { deriveFixedProficiencyRules } from '../../scripts/lib/fixed-proficiency-source.mjs'
import { fixedSources } from '../fixtures/fixedProficiencyFixtures'
import rogueLanguageSources from '../fixtures/rogueLanguageSources.json'

const api = {
  materializeFeatures: preparation.materializeSubclassFeatureCopies,
  subclassIdentity: identity.getSubclassFeatureIdentity,
  classIdentity: identity.getClassFeatureIdentity,
  decodeClass: identity.decodeClassFeatureReference,
  entriesDigest: getFeatureSourceDigest,
  digest: certificates.subclassProficiencyDigest,
  metadata: certificates.subclassProficiencyMetadata,
}
test('complete actual fixed producers reproduce the descriptors and direct declarations', () => {
  const sources = {
    ...fixedSources,
    class: fixedSources.class.filter((row) => row.name !== 'Rogue'),
  }
  const bundledDruid = JSON.parse(
    readFileSync('resources/srd/core/data/class/class-druid.json', 'utf8'),
  )
  expect(deriveFixedProficiencyRules([sources, bundledDruid, rogueLanguageSources], api)).toEqual({
    features: FIXED_PROFICIENCY_RULES.filter((row) => row.kind !== 'fixed-training').map((row) =>
      row.className === 'Druid'
        ? {
            ...row,
            metadataDigest: row.bundledMetadataDigest,
            fields: row.fields.filter((field) => !['page', 'basicRules2024'].includes(field)),
          }
        : row,
    ),
    directClasses: DIRECT_FIXED_CLASS_CERTIFICATES,
  })
})
test.each([
  'page',
  'header',
  'subclassShortName',
  'subclassSource',
])('generation rejects unsupported %s shapes before producing certificates', (field) => {
  for (const value of [{ condition: 'only outdoors' }, '', -1, 0.5, null]) {
    if (['page', 'header'].includes(field) && typeof value === 'string') continue
    const doc = structuredClone(fixedSources)
    doc.subclassFeature.find((row) => row.name === 'Survivalist')![field] = value
    expect(() => deriveFixedProficiencyRules([doc], api)).toThrow()
  }
})
test('otherSources metadata rejects blank identities, unsupported pages and extra qualifiers', () => {
  for (const row of [
    null,
    { source: '', page: 58 },
    { source: 'ERLW', page: -1 },
    { source: 'ERLW', page: {} },
    { source: 'ERLW', page: 58, condition: 'outdoors' },
  ]) {
    const doc = structuredClone(fixedSources)
    doc.classFeature.find((feature) => feature.name === 'Tool Expertise')!.otherSources = [row]
    expect(() => deriveFixedProficiencyRules([doc], api)).toThrow()
  }
})
