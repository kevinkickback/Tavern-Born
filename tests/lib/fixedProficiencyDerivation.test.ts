import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import * as identity from '@/lib/5etools/classFeatureIdentity'
import { getFeatureSourceDigest } from '@/lib/5etools/featureSourceAudit'
import {
  DIRECT_FIXED_CLASS_CERTIFICATES,
  FIXED_PROFICIENCY_RULES,
} from '@/lib/5etools/fixedProficiencyRules'
import { getSubclassIntroReference } from '@/lib/5etools/subclassContent'
import * as certificates from '@/lib/5etools/subclassProficiencyCertificates'
import { SUBCLASS_PROFICIENCY_PACKAGES } from '@/lib/5etools/subclassProficiencyRegistry'
import * as preparation from '@/lib/5etools/subclassSourcePreparation'
import { deriveDragonAncestorLanguage } from '../../scripts/lib/dragon-ancestor-language-source.mjs'
import { deriveFixedProficiencyRules } from '../../scripts/lib/fixed-proficiency-source.mjs'
import { conditionalSources } from '../fixtures/conditionalProficiencyFixtures'
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
const windSpeakerTarget = 'subclass-feature|wind speaker|sorcerer|phb|storm|xge|1|xge'
const configuredSorcerer = 'data/class/class-sorcerer.json'
const configuredBard = 'data/class/class-bard.json'
test('complete actual fixed producers reproduce the descriptors and direct declarations', () => {
  const sources = {
    ...fixedSources,
    class: fixedSources.class.filter((row) => row.name !== 'Rogue'),
  }
  const bundledDruid = JSON.parse(
    readFileSync('resources/srd/core/data/class/class-druid.json', 'utf8'),
  )
  const bundledSorcerer = JSON.parse(
    readFileSync('resources/srd/core/data/class/class-sorcerer.json', 'utf8'),
  )
  const dragon = deriveDragonAncestorLanguage(conditionalSources, bundledSorcerer, {
    ...api,
    materializeRoots: preparation.materializeSubclassCopies,
    identity: identity.getSubclassFeatureIdentity,
    decode: identity.decodeSubclassFeatureReference,
    copyKey: certificates.getSubclassCopyLookupKey,
    paths: certificates.collectSubclassProficiencyPaths,
    owner: certificates.getSubclassProficiencyOwner,
    intro: getSubclassIntroReference,
  })
  const configured = existsSync(configuredSorcerer)
  const windSpeaker = configured
    ? JSON.parse(readFileSync(configuredSorcerer, 'utf8')).subclassFeature.filter(
        (row: Record<string, unknown>) =>
          identity.getSubclassFeatureIdentity(row) === windSpeakerTarget,
      )
    : []
  if (configured) expect(windSpeaker).toHaveLength(1)
  const bard = existsSync(configuredBard) ? [JSON.parse(readFileSync(configuredBard, 'utf8'))] : []
  const derived = deriveFixedProficiencyRules(
    [sources, bundledDruid, rogueLanguageSources, { subclassFeature: windSpeaker }, ...bard],
    api,
  )
  derived.features.push(dragon.rule)
  derived.features.sort((left, right) => left.target.localeCompare(right.target))
  expect(derived).toEqual({
    features: FIXED_PROFICIENCY_RULES.filter((row) =>
      row.className === 'Bard'
        ? bard.length === 1
        : row.kind !== 'fixed-training' && (configured || row.target !== windSpeakerTarget),
    ).map((row) =>
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
  expect(dragon.package).toEqual(SUBCLASS_PROFICIENCY_PACKAGES.find((source) => source.fixedOnly))
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
