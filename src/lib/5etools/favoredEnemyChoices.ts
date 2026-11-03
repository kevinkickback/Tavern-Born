import type {
  ClassChoiceDiagnostic,
  NormalizedCharacterChoice,
  NormalizedChoiceOptionReference,
} from '@/types/classRules'
import { parseFilterTags } from './choiceFilterTags'
import {
  ENEMY_RACE_GROUP,
  ENEMY_TYPE_GROUP,
  FAVORED_ENEMY_GRANTS,
  FAVORED_ENEMY_TARGET,
  favoredEnemyOption,
  getFavoredEnemyChoiceId,
} from './favoredEnemyIdentity'
import {
  getFavoredEnemyContext,
  getFavoredEnemySources,
  isAuditedFavoredEnemyFeature,
} from './favoredEnemySource'
import { decodeFeatureOptionReference } from './featureOptionIdentity'
import type { ClassFeatureSourceCatalog } from './featureSourceAudit'
import type { UnconditionalFeatureReference } from './unconditionalFeatureReferences'

function hasFavoredEnemyGrant(rows: readonly UnconditionalFeatureReference[], target: string) {
  const matching = rows.filter((r) => r.target === target)
  return (
    matching.length > 0 && matching.every((r) => isAuditedFavoredEnemyFeature(r.reference.feature))
  )
}
function getFavoredEnemyTypes(feature: { entries?: unknown[] } | undefined) {
  return parseFilterTags(
    typeof feature?.entries?.[1] === 'string' ? feature.entries[1] : '',
  ).flatMap((tag) =>
    tag.entityType === 'creature' &&
    tag.filter.creatureTypes?.length === 1 &&
    tag.filter.creatureTypes[0] !== 'humanoid'
      ? tag.filter.creatureTypes
      : [],
  )
}
export function resolveFavoredEnemyOption(
  option: NormalizedChoiceOptionReference,
  catalogs: ClassFeatureSourceCatalog | undefined,
) {
  const target = decodeFeatureOptionReference(option)
  const base = getFavoredEnemySources(catalogs).get(FAVORED_ENEMY_TARGET)
  if (
    !base ||
    target?.format !== 'source-group' ||
    target.parentIdentity !== FAVORED_ENEMY_TARGET ||
    target.kind !== 'classFeature' ||
    ![ENEMY_TYPE_GROUP, ENEMY_RACE_GROUP].includes(target.group)
  )
    return undefined
  if (target.group === ENEMY_TYPE_GROUP && !getFavoredEnemyTypes(base).includes(target.literal))
    return undefined
  return {
    name: option.name,
    source: 'PHB',
    ref: option.ref!,
    group: target.group,
    entries: [
      ...getFavoredEnemyContext(catalogs),
      ...(target.group === ENEMY_RACE_GROUP
        ? [
            'Campaign-confirmed humanoid race; this label is not a catalog race or creature reference.',
          ]
        : []),
    ],
  }
}
export function normalizeFavoredEnemyChoices(
  owner: NormalizedCharacterChoice['owner'],
  declarations: readonly UnconditionalFeatureReference[],
  catalogs?: ClassFeatureSourceCatalog,
) {
  const choices: NormalizedCharacterChoice[] = [],
    diagnostics: ClassChoiceDiagnostic[] = []
  const base = declarations.find((r) => r.target === FAVORED_ENEMY_TARGET)?.reference.feature
  for (const grant of FAVORED_ENEMY_GRANTS) {
    const rows = declarations.filter((r) => r.target === grant.target)
    if (!rows.length) continue
    const level = Math.min(...rows.map((r) => r.level))
    if (
      !hasFavoredEnemyGrant(declarations, FAVORED_ENEMY_TARGET) ||
      !hasFavoredEnemyGrant(declarations, grant.target) ||
      (catalogs !== undefined &&
        (!getFavoredEnemySources(catalogs).get(FAVORED_ENEMY_TARGET) ||
          !getFavoredEnemySources(catalogs).get(grant.target)))
    ) {
      diagnostics.push({
        code: 'unverified-required-choice',
        className: owner.name,
        classSource: owner.source,
        featureName: 'Favored Enemy',
        level,
        message:
          'Favored Enemy rules are unavailable, conflicting or changed. Restore the exact enemy pool and earned grant.',
        requiredChoice: {
          replacedBy: 'Favored Foe|Ranger|PHB|1|TCE',
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
      id: getFavoredEnemyChoiceId(owner, grant.target, level),
      label: 'Favored Enemy',
      kind: 'feature-option',
      owner: { ...owner, featureName: 'Favored Enemy', featureSource: 'PHB' },
      level,
      minimumSelections: 1,
      maximumSelections: 2,
      selectionCountByLevel: Array.from({ length: 20 }, (_, i) => (i + 1 >= level ? 1 : 0)),
      options: getFavoredEnemyTypes(base).map((name) => favoredEnemyOption(name, 'type')),
      repeatable: false,
      replacement: { cadence: 'never' },
      source: { kind: 'class-feature-options', field: `${grant.ref}:source-group:favored-enemy` },
    })
  }
  return { choices, diagnostics }
}
