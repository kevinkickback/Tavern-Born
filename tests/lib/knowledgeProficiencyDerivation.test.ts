import { expect, test } from 'vitest'
import * as identity from '@/lib/5etools/classFeatureIdentity'
import { classProficiencyRule } from '@/lib/5etools/classProficiencyRules'
import { getFeatureSourceDigest } from '@/lib/5etools/featureSourceAudit'
import { getSubclassIntroReference } from '@/lib/5etools/subclassContent'
import * as certificates from '@/lib/5etools/subclassProficiencyCertificates'
import { SUBCLASS_PROFICIENCY_CHECKPOINT } from '@/lib/5etools/subclassProficiencyRegistry'
import * as preparation from '@/lib/5etools/subclassSourcePreparation'
import { getItemTypeCodes, isSelectableEquipmentItem } from '@/lib/calculations/itemClassification'
import {
  deriveArtisanToolPool,
  deriveSubclassProficiencyCertificates,
  deriveSubclassProficiencyRules,
} from '../../scripts/lib/subclass-proficiency-source.mjs'
import { knowledgeSources } from '../fixtures/knowledgeProficiencyFixtures'

const classify = { types: getItemTypeCodes, selectable: isSelectableEquipmentItem }
const tools = (uid: string) => deriveArtisanToolPool(uid, [knowledgeSources.items], classify)
const api = {
  materializeRoots: preparation.materializeSubclassCopies,
  materializeFeatures: preparation.materializeSubclassFeatureCopies,
  identity: identity.getSubclassFeatureIdentity,
  decode: identity.decodeSubclassFeatureReference,
  copyKey: certificates.getSubclassCopyLookupKey,
  paths: certificates.collectSubclassProficiencyPaths,
  owner: certificates.getSubclassProficiencyOwner,
  digest: certificates.subclassProficiencyDigest,
  entriesDigest: getFeatureSourceDigest,
  metadata: certificates.subclassProficiencyMetadata,
  intro: getSubclassIntroReference,
}
test('actual structured tools, two complete rules and five production owner paths exactly reproduce reviewed certificates', () => {
  const rules = deriveSubclassProficiencyRules(
    preparation.materializeSubclassFeatureCopies(knowledgeSources.document.subclassFeature),
    tools,
    identity.getSubclassFeatureIdentity,
    getFeatureSourceDigest,
  )
  expect(rules).toHaveLength(2)
  for (const rule of rules) expect(rule).toEqual(classProficiencyRule(rule.target))
  const owners = preparation
    .materializeSubclassCopies(knowledgeSources.document.subclass)
    .map(certificates.getSubclassProficiencyOwner)
  const targets = preparation
    .materializeSubclassFeatureCopies(knowledgeSources.document.subclassFeature)
    .map(identity.getSubclassFeatureIdentity)
  const ownerKeys = new Set(owners.map((owner) => JSON.stringify(owner)))
  const targetKeys = new Set(targets)
  expect(owners).toHaveLength(5)
  expect(owners.every(Boolean)).toBe(true)
  expect(ownerKeys.size).toBe(5)
  expect(targets).toHaveLength(7)
  expect(targets.every(Boolean)).toBe(true)
  expect(targetKeys.size).toBe(7)
  const expected = {
    features: SUBCLASS_PROFICIENCY_CHECKPOINT.features.filter((row) => targetKeys.has(row.target)),
    roots: SUBCLASS_PROFICIENCY_CHECKPOINT.roots.filter((row) =>
      ownerKeys.has(JSON.stringify(row.owner)),
    ),
  }
  expect(expected.features).toHaveLength(7)
  expect(expected.roots).toHaveLength(5)
  expect(deriveSubclassProficiencyCertificates([knowledgeSources.document], rules, api)).toEqual(
    expected,
  )
  expect(tools("Artisan's Tools|XPHB").names).toHaveLength(17)
})
test('generation rejects duplicate and qualified paired mechanics and ambiguous structured group members', () => {
  const features = preparation.materializeSubclassFeatureCopies(
    knowledgeSources.document.subclassFeature,
  )
  const leaf = features.find((row) => row.name === 'Blessings of Knowledge')!
  for (const rows of [
    [...features, structuredClone(leaf)],
    features.map((row) => (row === leaf ? { ...leaf, eligibility: 'Only outside combat' } : row)),
    features.map((row) =>
      row === leaf ? { ...leaf, entries: [...(leaf.entries as unknown[]), 'Only at night.'] } : row,
    ),
  ]) {
    expect(() =>
      deriveSubclassProficiencyRules(
        rows,
        tools,
        identity.getSubclassFeatureIdentity,
        getFeatureSourceDigest,
      ),
    ).toThrow()
  }
  for (const mode of ['group', 'member', 'qualifier'] as const) {
    const items = structuredClone(knowledgeSources.items)
    if (mode === 'group') items.itemGroup.push(structuredClone(items.itemGroup[0]))
    if (mode === 'member') items.item.push(structuredClone(items.item[0]))
    if (mode === 'qualifier') items.itemGroup[0].eligibility = 'Only at night'
    expect(() => deriveArtisanToolPool("Artisan's Tools|XPHB", [items], classify)).toThrow()
  }
})

test.each([
  'paragraph',
  'wrapper',
  'reference prerequisite',
])('ordinary generation rejects a new ancestor %s before certifying unconditional benefits', (change) => {
  const document = structuredClone(knowledgeSources.document)
  const ancestor = document.subclassFeature.find(
    (row: Record<string, unknown>) => row.name === 'Knowledge Domain' && row.classSource === 'PHB',
  )!
  const entries = ancestor.entries as (string | Record<string, unknown>)[]
  const index = entries.findIndex(
    (entry) => typeof entry === 'object' && entry.type === 'refSubclassFeature',
  )
  expect(index).toBeGreaterThanOrEqual(0)
  if (change === 'paragraph') entries.push('You gain the benefits below only while outdoors.')
  if (change === 'wrapper')
    entries[index] = { type: 'entries', name: 'Only while outdoors', entries: [entries[index]] }
  if (change === 'reference prerequisite')
    entries[index] = { ...(entries[index] as Record<string, unknown>), prerequisite: 'outdoors' }
  const rules = deriveSubclassProficiencyRules(
    preparation.materializeSubclassFeatureCopies(document.subclassFeature),
    tools,
    identity.getSubclassFeatureIdentity,
    getFeatureSourceDigest,
  )
  expect(() => deriveSubclassProficiencyCertificates([document], rules, api)).toThrow(
    /Unreviewed enabling feature semantics/,
  )
})
