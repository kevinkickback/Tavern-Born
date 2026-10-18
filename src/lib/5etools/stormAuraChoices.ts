import type { ClassFeature } from '@/types/5etools'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import { decodeSubclassFeatureReference, getSubclassFeatureIdentity } from './classFeatureIdentity'
import { featureOptionRulesSignature } from './featureTableOptions'
import {
  getStormAuraChoiceId,
  STORM_AURA_TARGET,
  STORM_ENVIRONMENTS,
  stormFeatureRef,
  stormTarget,
} from './stormAuraIdentity'
import { isAuditedStormFeature } from './stormAuraSource'
import type { UnconditionalFeatureReference } from './unconditionalFeatureReferences'

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
export function resolveStormFeature(
  target: string,
  candidates: readonly (ClassFeature | undefined)[],
): ClassFeature | undefined {
  const first = candidates[0]
  const signature =
    first && Array.isArray(first.entries) && first.entries.length
      ? featureOptionRulesSignature(first.entries)
      : undefined
  return signature &&
    candidates.every(
      (feature) =>
        feature &&
        !feature.featureOptionSourceConflict &&
        isAuditedStormFeature(feature) &&
        getSubclassFeatureIdentity(feature) === target &&
        Array.isArray(feature.entries) &&
        featureOptionRulesSignature(feature.entries) === signature,
    )
    ? first
    : undefined
}
/** Source-audited choose-one semantics; countless groups elsewhere remain presentation only. */
export function stormOptionGroup(
  feature: ClassFeature | undefined,
  name: string,
  level: number,
): boolean {
  if (!feature || !resolveStormFeature(stormTarget(name, level), [feature])) return false
  const blocks = feature.entries!.map(record).filter((row) => row?.type === 'options')
  if (blocks.length !== 1 || blocks[0]!.count !== undefined || !Array.isArray(blocks[0]!.entries))
    return false
  const targets = (blocks[0]!.entries as unknown[]).map((value) => {
    const row = record(value)
    return row?.type === 'refSubclassFeature' && typeof row.subclassFeature === 'string'
      ? getSubclassFeatureIdentity(decodeSubclassFeatureReference(row.subclassFeature))
      : undefined
  })
  return (
    targets.length === 3 &&
    new Set(targets).size === 3 &&
    STORM_ENVIRONMENTS.every((environment) => targets.includes(stormTarget(environment, level)))
  )
}
export function stormContextEntries(feature: ClassFeature): unknown[] {
  return (feature.entries ?? []).filter((value) => record(value)?.type !== 'options')
}
export function normalizeStormAuraChoices(
  owner: NormalizedCharacterChoice['owner'],
  declarations: readonly UnconditionalFeatureReference[],
): NormalizedCharacterChoice[] {
  if (
    owner.name.trim().toLowerCase() !== 'barbarian' ||
    !['phb', 'xphb'].includes(owner.source.trim().toLowerCase()) ||
    owner.subclassName?.trim().toLowerCase() !== 'path of the storm herald' ||
    owner.subclassSource?.trim().toLowerCase() !== 'xge' ||
    declarations.some(
      (row) =>
        row.target === stormTarget('Path of the Storm Herald', 3) &&
        row.reference.feature?.featureOptionSourceConflict,
    )
  )
    return []
  const intro = declarations.filter(
    (row) => row.target === stormTarget('Path of the Storm Herald', 3),
  )
  if (
    !intro.length ||
    !resolveStormFeature(
      stormTarget('Path of the Storm Herald', 3),
      intro.map((row) => row.reference.feature),
    )
  )
    return []
  const refs = declarations.filter((row) => row.target === STORM_AURA_TARGET)
  const feature = resolveStormFeature(
    STORM_AURA_TARGET,
    refs.map((row) => row.reference.feature),
  )
  if (!feature || !stormOptionGroup(feature, 'Storm Aura', 3)) return []
  const level = Math.min(...refs.map((row) => row.level))
  return [
    {
      id: getStormAuraChoiceId(owner, level),
      label: 'Storm Aura',
      kind: 'subclass-feature',
      owner: { ...owner, featureName: 'Storm Aura', featureSource: 'XGE' },
      level,
      minimumSelections: 1,
      maximumSelections: 1,
      selectionCountByLevel: Array.from({ length: 20 }, (_, index) => (index + 1 >= level ? 1 : 0)),
      options: STORM_ENVIRONMENTS.map((name) => ({
        entityType: 'subclassFeature',
        name,
        source: 'XGE',
        ref: stormFeatureRef(name, 3),
      })),
      repeatable: false,
      replacement: { cadence: 'class-level', maximumPerEvent: 1 },
      source: {
        kind: 'class-feature-options',
        field: 'Storm Aura|Barbarian|PHB|Storm Herald|XGE|3|XGE:environment',
      },
    },
  ]
}
