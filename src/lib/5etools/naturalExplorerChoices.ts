import type { Class5e, ClassFeature } from '@/types/5etools'
import type {
  ClassChoiceDiagnostic,
  NormalizedCharacterChoice,
  NormalizedChoiceOptionReference,
} from '@/types/classRules'
import {
  decodeFeatureOptionReference,
  encodeSourceGroupOptionReference,
} from './featureOptionIdentity'
import {
  DEFT_EXPLORER_REF,
  DEFT_EXPLORER_TARGET,
  FAVORED_TERRAIN_GROUP,
  FAVORED_TERRAINS,
  getNaturalExplorerChoiceId,
  NATURAL_EXPLORER_GRANTS,
  NATURAL_EXPLORER_REF,
  NATURAL_EXPLORER_TARGET,
} from './naturalExplorerIdentity'
import {
  type ClassFeatureSourceCatalog,
  getNaturalExplorerSources,
  isAuditedNaturalExplorerFeature,
} from './naturalExplorerSource'
import {
  collectUnconditionalFeatureReferences,
  type UnconditionalFeatureReference,
} from './unconditionalFeatureReferences'

export interface SourceGroupOption {
  name: string
  source: string
  ref: string
  group: string
  entries: unknown[]
}
/** Only the exact, singular current TCE declaration may waive this source family. */
export function isNaturalExplorerReplaced(
  classData: Pick<Class5e, 'classFeatureRefs'> | undefined,
  includeVariants: boolean,
  catalogs: ClassFeatureSourceCatalog | undefined,
): boolean {
  if (
    !includeVariants ||
    !classData ||
    !getNaturalExplorerSources(catalogs).get(DEFT_EXPLORER_TARGET)
  )
    return false
  const declarations = collectUnconditionalFeatureReferences(
    classData.classFeatureRefs ?? [],
    'classFeature',
  ).filter((row) => row.target === DEFT_EXPLORER_TARGET)
  return (
    declarations.length === 1 && isAuditedNaturalExplorerFeature(declarations[0].reference.feature)
  )
}
/** Audited structural paths retain the complete conditional rule while excluding alternatives/instructions. */
function naturalExplorerContext(feature: ClassFeature): unknown[] {
  const first = feature.entries?.[0]
  if (typeof first !== 'string') return []
  const start = first.indexOf('When you make an Intelligence or Wisdom check')
  return start < 0 ? [] : [first.slice(start), ...(feature.entries ?? []).slice(1, 3)]
}
export function resolveNaturalExplorerOption(
  option: NormalizedChoiceOptionReference,
  catalogs: ClassFeatureSourceCatalog | undefined,
): SourceGroupOption | undefined {
  const target = decodeFeatureOptionReference(option)
  const source = getNaturalExplorerSources(catalogs).get(NATURAL_EXPLORER_TARGET)
  if (
    !source ||
    target?.format !== 'source-group' ||
    target.kind !== 'classFeature' ||
    target.parentIdentity !== NATURAL_EXPLORER_TARGET ||
    target.group !== FAVORED_TERRAIN_GROUP
  )
    return undefined
  const name = FAVORED_TERRAINS.find((value) => value.toLowerCase() === target.literal)
  return name
    ? {
        name,
        source: 'PHB',
        ref: encodeSourceGroupOptionReference(
          { kind: 'classFeature', ref: NATURAL_EXPLORER_REF },
          FAVORED_TERRAIN_GROUP,
          target.literal,
        ),
        group: FAVORED_TERRAIN_GROUP,
        entries: naturalExplorerContext(source),
      }
    : undefined
}
export function hasNaturalExplorerGrant(
  declarations: readonly UnconditionalFeatureReference[],
  target: string,
): boolean {
  const matching = declarations.filter((row) => row.target === target)
  return (
    matching.length > 0 &&
    matching.every((row) => isAuditedNaturalExplorerFeature(row.reference.feature))
  )
}
export function normalizeNaturalExplorerChoices(
  owner: NormalizedCharacterChoice['owner'],
  declarations: readonly UnconditionalFeatureReference[],
): { choices: NormalizedCharacterChoice[]; diagnostics: ClassChoiceDiagnostic[] } {
  const choices: NormalizedCharacterChoice[] = [],
    diagnostics: ClassChoiceDiagnostic[] = []
  const base = hasNaturalExplorerGrant(declarations, NATURAL_EXPLORER_TARGET)
  for (const grant of NATURAL_EXPLORER_GRANTS) {
    const rows = declarations.filter((row) => row.target === grant.target)
    if (!rows.length) continue
    const level = Math.min(...rows.map((row) => row.level))
    if (!base || !hasNaturalExplorerGrant(declarations, grant.target)) {
      diagnostics.push({
        code: 'unverified-required-choice',
        className: owner.name,
        classSource: owner.source,
        featureName: 'Natural Explorer',
        level,
        message:
          'Natural Explorer favored-terrain rules are unavailable, conflicting or changed. Restore the exact pool and earned grant to verify this choice.',
        requiredChoice: {
          replacedBy: DEFT_EXPLORER_REF,
          target: {
            entityType: 'classFeature',
            name: grant.ref.split('|')[0],
            source: 'PHB',
            ref: grant.ref,
          },
        },
      })
      continue
    }
    choices.push({
      id: getNaturalExplorerChoiceId(owner, grant.target, level),
      label: 'Natural Explorer',
      kind: 'feature-option',
      owner: { ...owner, featureName: 'Natural Explorer', featureSource: 'PHB' },
      level,
      minimumSelections: 1,
      maximumSelections: 1,
      selectionCountByLevel: Array.from({ length: 20 }, (_, index) => (index + 1 >= level ? 1 : 0)),
      options: FAVORED_TERRAINS.map((name) => ({
        entityType: 'featureOption',
        name,
        source: 'PHB',
        ref: encodeSourceGroupOptionReference(
          { kind: 'classFeature', ref: NATURAL_EXPLORER_REF },
          FAVORED_TERRAIN_GROUP,
          name,
        ),
      })),
      repeatable: false,
      replacement: { cadence: 'never' },
      source: {
        kind: 'class-feature-options',
        field: `${grant.ref}:source-group:${FAVORED_TERRAIN_GROUP}`,
      },
    })
  }
  return { choices, diagnostics }
}
