import { expect, test } from 'vitest'
import * as identity from '@/lib/5etools/classFeatureIdentity'
import {
  CONDITIONAL_OPTIONAL_CERTIFICATES,
  CONDITIONAL_PROFICIENCY_RULES,
} from '@/lib/5etools/conditionalProficiencyRules'
import { getConditionalOptionalIdentity } from '@/lib/5etools/conditionalProficiencySource'
import { getFeatureSourceDigest } from '@/lib/5etools/featureSourceAudit'
import { NATURAL_EXPLORER_TARGET } from '@/lib/5etools/naturalExplorerIdentity'
import { isAuditedNaturalExplorerFeature } from '@/lib/5etools/naturalExplorerSource'
import { getSubclassIntroReference } from '@/lib/5etools/subclassContent'
import * as certificates from '@/lib/5etools/subclassProficiencyCertificates'
import { SUBCLASS_PROFICIENCY_CHECKPOINT } from '@/lib/5etools/subclassProficiencyRegistry'
import * as preparation from '@/lib/5etools/subclassSourcePreparation'
import conditionalContexts from '../../scripts/lib/conditional-proficiency-contexts.json'
import {
  deriveConditionalProficiencyRules,
  validateConditionalSubclassProgression,
} from '../../scripts/lib/conditional-proficiency-source.mjs'
import { deriveSubclassProficiencyCertificates } from '../../scripts/lib/subclass-proficiency-source.mjs'
import {
  type ConditionalSourceDocument,
  conditionalSources,
} from '../fixtures/conditionalProficiencyFixtures'

const api = {
  materializeFeatures: preparation.materializeSubclassFeatureCopies,
  materializeRoots: preparation.materializeSubclassCopies,
  identity: identity.getSubclassFeatureIdentity,
  classIdentity: identity.getClassFeatureIdentity,
  optionalIdentity: getConditionalOptionalIdentity,
  digest: certificates.subclassProficiencyDigest,
  terrainTarget: NATURAL_EXPLORER_TARGET,
  isTerrainSource: isAuditedNaturalExplorerFeature,
}
function derive(document: ConditionalSourceDocument) {
  const result = deriveConditionalProficiencyRules([document], document.optionalfeature, api)
  const checkpoint = deriveSubclassProficiencyCertificates(
    [document],
    result.features.filter((row) => row.target.startsWith('subclass-feature|')),
    {
      materializeFeatures: preparation.materializeSubclassFeatureCopies,
      materializeRoots: preparation.materializeSubclassCopies,
      identity: identity.getSubclassFeatureIdentity,
      decode: identity.decodeSubclassFeatureReference,
      copyKey: certificates.getSubclassCopyLookupKey,
      paths: certificates.collectSubclassProficiencyPaths,
      owner: certificates.getSubclassProficiencyOwner,
      digest: certificates.subclassProficiencyDigest,
      entriesDigest: getFeatureSourceDigest,
      metadata: certificates.subclassProficiencyMetadata,
      intro: getSubclassIntroReference,
      validateProgression: (root) => validateConditionalSubclassProgression(root, result.features),
      admittedContexts: conditionalContexts.contexts,
    },
  )
  return { result, checkpoint }
}
test('three complete actual clauses and four copied owner paths exactly reproduce conditional certificates', () => {
  const { result, checkpoint } = derive(conditionalSources)
  expect(result).toEqual({
    features: CONDITIONAL_PROFICIENCY_RULES,
    optional: CONDITIONAL_OPTIONAL_CERTIFICATES,
  })
  const owners = new Set(
    conditionalSources.subclass.map((root) =>
      JSON.stringify(certificates.getSubclassProficiencyOwner(root)),
    ),
  )
  expect(owners.size).toBe(4)
  const expectedRoots = SUBCLASS_PROFICIENCY_CHECKPOINT.roots.filter((root) =>
    owners.has(JSON.stringify(root.owner)),
  )
  expect(expectedRoots).toHaveLength(4)
  const sourceTargets = preparation
    .materializeSubclassFeatureCopies(conditionalSources.subclassFeature)
    .map(identity.getSubclassFeatureIdentity)
  expect(sourceTargets.every(Boolean)).toBe(true)
  const targets = new Set(sourceTargets)
  expect(targets.size).toBe(sourceTargets.length)
  const expectedFeatures = SUBCLASS_PROFICIENCY_CHECKPOINT.features.filter((row) =>
    targets.has(row.target),
  )
  expect(expectedFeatures).toHaveLength(5)
  expect(checkpoint).toEqual({
    roots: expectedRoots,
    features: expectedFeatures,
  })
})
test.each([
  'Fire invocation',
  'Dragon condition',
  'ancestor paragraph',
  'ancestor wrapper',
  'root progression',
  'copied progression',
  'progression label',
  'srd shape',
  'duplicate Fire',
  'terrain condition',
])('ordinary generation rejects unreviewed %s before emission', (mode) => {
  const doc = structuredClone(conditionalSources)
  const carver = doc.subclassFeature.find((row) => row.name === 'Rune Carver')!
  const dragon = doc.subclassFeature.find((row) => row.name === 'Dragon Ancestor')!
  const runeRoot = doc.subclass.find(
    (row) => row.name === 'Rune Knight' && row.classSource === 'PHB',
  )!
  if (mode === 'Fire invocation')
    (doc.optionalfeature.find((row) => row.name === 'Fire Rune')!.entries as unknown[]).push(
      'Only at night.',
    )
  if (mode === 'Dragon condition') (dragon.entries as unknown[])[2] = 'Only while outdoors.'
  if (mode === 'ancestor paragraph') (carver.entries as unknown[]).push('Only while outdoors.')
  if (mode === 'ancestor wrapper') {
    const intro = doc.subclassFeature.find((row) => row.name === 'Rune Knight')!
    const entries = intro.entries as unknown[]
    entries[2] = { type: 'entries', name: 'Only while outdoors', entries: [entries[2]] }
  }
  if (mode === 'root progression')
    (
      runeRoot.optionalfeatureProgression as { progression: Record<string, number> }[]
    )[0].progression['3'] = 3
  if (mode === 'copied progression') {
    const copy = doc.subclass.find(
      (row) => row.name === 'Rune Knight' && row.classSource === 'XPHB',
    )!
    const changed = structuredClone(runeRoot.optionalfeatureProgression) as {
      progression: Record<string, number>
    }[]
    changed[0].progression['7'] = 4
    copy.optionalfeatureProgression = changed
  }
  if (mode === 'progression label')
    (runeRoot.optionalfeatureProgression as { name: string }[])[0].name = 'Other Runes'
  if (mode === 'srd shape')
    doc.subclass.find(
      (row) => row.name === 'Draconic Bloodline' && row.classSource === 'PHB',
    )!.srd = { condition: 'Only outdoors' }
  if (mode === 'duplicate Fire')
    doc.optionalfeature.push(
      structuredClone(doc.optionalfeature.find((row) => row.name === 'Fire Rune')!),
    )
  if (mode === 'terrain condition')
    (doc.classFeature.find((row) => row.name === 'Natural Explorer')!.entries as unknown[])[0] =
      'Only while outdoors.'
  expect(() => derive(doc)).toThrow()
})

test.each([
  ['Rune Knight', 'PHB'],
  ['Rune Knight', 'XPHB'],
  ['Draconic Bloodline', 'PHB'],
  ['Draconic Bloodline', 'XPHB'],
])('generation requires the admitted %s/%s owner and original intro independently', (name, classSource) => {
  for (const removeRoot of [false, true]) {
    const doc = structuredClone(conditionalSources)
    const index = doc.subclass.findIndex(
      (row) => row.name === name && row.classSource === classSource,
    )
    expect(index).toBeGreaterThanOrEqual(0)
    if (removeRoot) doc.subclass.splice(index, 1)
    else doc.subclass[index].subclassFeatures = []
    expect(() => derive(doc)).toThrow()
  }
  expect(derive(structuredClone(conditionalSources)).checkpoint.roots).toHaveLength(4)
})

test.each([
  'options wrapper',
  'missing target',
])('generation rejects an unreachable reviewed copied Dragon intro: %s', (mode) => {
  const doc = structuredClone(conditionalSources)
  const intro = doc.subclassFeature.find(
    (row) => row.name === 'Draconic Bloodline' && row.classSource === 'XPHB',
  )!
  // Exercise an override of the actual copied intro, preserving its inherited complete content.
  const effective = preparation
    .materializeSubclassFeatureCopies(doc.subclassFeature)
    .find((row) => row.name === 'Draconic Bloodline' && row.classSource === 'XPHB')!
  const entries = structuredClone(effective.entries) as Record<string, unknown>[]
  intro.entries = entries
  const index = entries.findIndex(
    (row) =>
      row.type === 'refSubclassFeature' &&
      String(row.subclassFeature).startsWith('Dragon Ancestor|'),
  )
  expect(index).toBeGreaterThanOrEqual(0)
  if (mode === 'options wrapper') entries[index] = { type: 'options', entries: [entries[index]] }
  else entries[index].subclassFeature = 'Missing Ancestor|Sorcerer|PHB|Draconic|PHB|1'
  expect(() => derive(doc)).toThrow()
  expect(derive(structuredClone(conditionalSources)).checkpoint.roots).toHaveLength(4)
})

test.each([
  { name: 'fire rune' },
  { source: 'tce' },
  { name: ' Fire Rune ' },
  { source: ' TCE ' },
])('generation counts every raw canonical Fire producer: %j', (change) => {
  for (const conflicting of [false, true]) {
    const doc = structuredClone(conditionalSources)
    const duplicate = structuredClone(doc.optionalfeature.find((row) => row.name === 'Fire Rune')!)
    Object.assign(duplicate, change)
    if (conflicting) (duplicate.entries as unknown[]).push('Only at night.')
    doc.optionalfeature.push(duplicate)
    expect(() => derive(doc)).toThrow('Conditional source missing or duplicated')
  }
  expect(derive(structuredClone(conditionalSources)).result.optional).toEqual(
    CONDITIONAL_OPTIONAL_CERTIFICATES,
  )
})
