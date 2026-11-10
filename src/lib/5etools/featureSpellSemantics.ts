import type { ClassFeature } from '@/types/5etools'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import type { NormalizedCharacterChoice } from '@/types/classRules'
import { parseAdditionalSpellBlocks } from './additionalSpells'
import { getFeatureSourceDigest, hasFeatureSourceShape } from './featureSourceAudit'
import { namesFilteredFeatAlternatives } from './filteredFeatAlternative'

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
  feature: {
    name: string
    source: string
    entries?: unknown[]
    prerequisite?: unknown
    additionalSpells?: unknown
  },
  declaration: ClassFeature | undefined,
) {
  if (
    choice.kind !== 'feat' ||
    choice.owner.type !== 'class' ||
    !declaration ||
    !choice.source.field.endsWith(':entries.filter-alternative-v1') ||
    !choice.options.some(
      (option) =>
        option.entityType === 'feat' &&
        norm(option.name) === norm(feature.name) &&
        norm(option.source ?? '') === norm(feature.source),
    )
  )
    return false
  const blocks = feature.prerequisite as Array<{ otherSummary?: { entry?: string } }>
  const entry = blocks?.[0]?.otherSummary?.entry
  const clause =
    typeof entry === 'string' &&
    entry.match(/^When Gaining the Level (\d+) ([^"]+) "([^"]+)" Feature$/)
  return (
    !!clause &&
    choice.level === Number(clause[1]) &&
    declaration.level === Number(clause[1]) &&
    norm(declaration.name) === norm(clause[3]) &&
    (namesFilteredFeatAlternatives(declaration.entries?.[0])
      ? hasListedCantripStyle(feature, blocks, clause[2], declaration.className)
      : norm(declaration.classSource ?? '') === 'xphb' &&
        norm(declaration.source) === 'xphb' &&
        norm(declaration.className ?? '') === norm(clause[2]) &&
        hasCurrentFeatureSpellSemantics('feat', feature, clause[2]))
  )
}

/** A listed class acquisition can borrow a style's own source-defined spell list. */
function hasListedCantripStyle(
  feature: { entries?: unknown[]; additionalSpells?: unknown },
  prerequisite: unknown,
  printedOwner: string,
  declarationOwner?: string,
) {
  const [entry] = feature.entries ?? []
  if (
    feature.entries?.length !== 1 ||
    typeof entry !== 'string' ||
    !Array.isArray(prerequisite) ||
    prerequisite.length !== 1 ||
    !prerequisite[0] ||
    typeof prerequisite[0] !== 'object' ||
    Object.keys(prerequisite[0]).length !== 1 ||
    !hasFeatureSourceShape(feature, fields)
  )
    return false
  const prose = entry.match(
    /^You learn two \{@filter [^|{}]+\|spells\|level=0\|class=([^|{};]+)\} of your choice\. \{@spell [^{}]+\} and \{@spell [^{}]+\} are recommended\. The chosen cantrips count as ([^.,]+) spells for you, and (Wisdom|Intelligence|Charisma) is your spellcasting ability for them\. Whenever you gain a(?:n)? ([^.,]+) level, you can replace one of these cantrips with another ([^.,]+) cantrip\.$/,
  )
  if (!prose) return false
  const [, list, attributedClass, ability, replacementClass, replacementList] = prose
  if (
    norm(attributedClass) !== norm(replacementClass) ||
    norm(replacementList) !== norm(list) ||
    (norm(printedOwner) !== norm(attributedClass) &&
      norm(printedOwner) !== norm(declarationOwner ?? ''))
  )
    return false
  try {
    const blocks = parseAdditionalSpellBlocks(feature.additionalSpells as AdditionalSpellBlock[])
    const [block] = blocks
    const choice = block?.choices[0]
    return (
      blocks.length === 1 &&
      block.ability === norm(ability).slice(0, 3) &&
      !block.grants.length &&
      !block.expanded?.length &&
      block.choices.length === 1 &&
      choice?.level === 0 &&
      choice.isCantrip &&
      choice.count === 2 &&
      choice.source === 'known' &&
      choice.usage === 'direct' &&
      choice.filter?.classes.length === 1 &&
      norm(choice.filter.classes[0]) === norm(list)
    )
  } catch {
    return false
  }
}
