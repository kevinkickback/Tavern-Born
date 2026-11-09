import type { ClassFeature } from '@/types/5etools'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import { getFeatureSourceDigest, hasFeatureSourceShape } from './featureSourceAudit'

const norm = (value: string) => value.trim().toLowerCase()

/**
 * Missing structured meaning only: these exact source prose bodies attribute spells to a class
 * and describe a future class-level replacement. Counts, filters and abilities remain live data.
 * Pinned source b9061583 data/optionalfeatures.json and data/feats.json. Any new adjacent prose
 * restriction or unfamiliar root member requires assessment; structured parsing is independent.
 */
const semantics = [
  {
    type: 'optionalFeature',
    name: 'blessed warrior',
    source: 'tce',
    className: 'paladin',
    prerequisite: null,
    prose: 'ccc8fba13805e49b2c1ec75a700e84cfd3dbbbf654263346f6e0763dcf9c6c04',
  },
  {
    type: 'optionalFeature',
    name: 'druidic warrior',
    source: 'tce',
    className: 'ranger',
    prerequisite: null,
    prose: 'e787fd0ced438a2566410d2790b5feed855bcfffbbe6f26340e0c6262fe5b62d',
  },
  {
    type: 'feat',
    name: 'blessed warrior',
    source: 'xphb',
    className: 'paladin',
    prerequisite: 'd96db45b525d71ab4ef53b01226605f38dfea74b2a662657875852d1f432b5a7',
    prose: 'ab8282a887dd994d8c71af79e21def3f763aee0e6e87a95826e324774ac10873',
  },
  {
    type: 'feat',
    name: 'druidic warrior',
    source: 'xphb',
    className: 'ranger',
    prerequisite: 'e7af2dd5906be2f7e4a9cd95869908face7a1c3d1ce736d962218dbfbdc85c2b',
    prose: 'a45dbde5f96394465a6b54ec912494cd5d748518fff2914a6376702e4e958c71',
  },
] as const
const fields = new Set([
  'name',
  'source',
  'page',
  'srd52',
  'basicRules2024',
  'reprintedAs',
  'isClassFeatureVariant',
  'featureType',
  'category',
  'prerequisite',
  'entries',
  'additionalSpells',
])

export function getClassFeatureSpellSemantics(type: string, name: string, source: string) {
  return semantics.find(
    (row) => row.type === type && row.name === norm(name) && row.source === norm(source),
  )
}

export function hasCurrentFeatureSpellSemantics(
  type: string,
  feature: { name: string; source?: string; entries?: unknown[]; prerequisite?: unknown },
  className: string,
) {
  const rule = getClassFeatureSpellSemantics(type, feature.name, feature.source ?? '')
  return (
    !!rule &&
    rule.className === norm(className) &&
    hasFeatureSourceShape(feature, fields) &&
    (rule.prerequisite === null ||
      getFeatureSourceDigest([feature.prerequisite], false) === rule.prerequisite) &&
    getFeatureSourceDigest([feature.entries], false) === rule.prose
  )
}

/** Exact prose-only acquisition context, not a general prerequisite bypass or level-up event. */
export function hasDeclaredClassFeatSpellContext(
  choice: NormalizedCharacterChoice,
  feature: { name: string; source: string; entries?: unknown[]; prerequisite?: unknown },
  declaration: ClassFeature | undefined,
) {
  if (
    choice.kind !== 'feat' ||
    choice.owner.type !== 'class' ||
    !declaration ||
    norm(declaration.classSource ?? '') !== 'xphb' ||
    norm(declaration.source) !== 'xphb' ||
    !choice.source.field.endsWith(':entries.filter-alternative-v1') ||
    !hasCurrentFeatureSpellSemantics('feat', feature, declaration.className ?? '') ||
    !choice.options.some(
      (option) =>
        option.entityType === 'feat' &&
        norm(option.name) === norm(feature.name) &&
        norm(option.source ?? '') === norm(feature.source),
    )
  )
    return false
  const blocks = feature.prerequisite as Array<{ otherSummary?: { entry?: string } }>
  const clause = blocks?.[0]?.otherSummary?.entry?.match(
    /^When Gaining the Level (\d+) ([^"]+) "([^"]+)" Feature$/,
  )
  return (
    !!clause &&
    choice.level === Number(clause[1]) &&
    declaration.level === Number(clause[1]) &&
    norm(declaration.className ?? '') === norm(clause[2]) &&
    norm(declaration.name) === norm(clause[3])
  )
}
