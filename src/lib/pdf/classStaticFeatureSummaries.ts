import { CLASSIC_WILD_SHAPE_RESOURCE_ID } from '@/lib/5etools/archdruidSource'
import {
  getCurrentBardJackOfAllTrades,
  getCurrentBardMagicalSecrets,
  hasCurrentBardWordsOfCreation,
  WORDS_OF_CREATION_TARGET,
} from '@/lib/5etools/bardSpellSources'
import { getLandStaticFeatures } from '@/lib/5etools/circleOfTheLand'
import { getClassResourceDefs } from '@/lib/5etools/classData'
import { getSubclassFeatureIdentity } from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import {
  formatClassResourceRecovery,
  getClassResourceRecoveryAtLevel,
} from '@/lib/5etools/classRuleNormalization'
import { getCurrentDirectClassFeature } from '@/lib/5etools/directClassFeatureSource'
import {
  getCurrentNativeSorcerer,
  getDraconicPresence,
  getDragonCompanion,
  getDragonWings,
  getInnateSorcery,
  getInnateSorceryUpgrades,
} from '@/lib/5etools/sorcererSource'
import { getNativeWarlockPatronFeatureOwner } from '@/lib/5etools/warlockPatronFeatureSource'
import { getFeatureActionGroupId } from '@/lib/calculations/featureActionGroups'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import { renderEntriesToText } from '@/lib/entryText'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import { getSourceCompatibility } from '@/lib/sourceCompatibility'
import type { Class5e, ClassFeature, SubclassFeature } from '@/types/5etools'
import type { Character, CharacterClassEntry, Feature } from '@/types/character'
import { getDeclaredSubclassStaticFeatures } from './declaredSubclassStaticFeatures'
import { getWarlockStaticFeatures } from './warlockStaticFeatures'

export interface ClassStaticFeatureSummary {
  text: string
  compactText: string
  replaces?: Feature
  actionId?: string
  actionNotesSource?: 'class' | 'subclass'
}

const sharedDruidCircles = [
  'circle of dreams|xge',
  'circle of the shepherd|xge',
  'circle of spores|tce',
  'circle of wildfire|tce',
]
const reviewedDruidCircles = {
  phb: [...sharedDruidCircles, 'circle of the moon|phb', 'circle of stars|tce'],
  xphb: [
    ...sharedDruidCircles,
    'circle of the moon|xphb',
    'circle of the sea|xphb',
    'circle of the stars|xphb',
  ],
}
const sharedSorcererOrigins = [
  'pyromancer (psk)|psk',
  'divine soul|xge',
  'storm sorcery|xge',
  'lunar sorcery|dsotdq',
]
const reviewedSorcererOrigins = {
  phb: [
    ...sharedSorcererOrigins,
    'wild magic|phb',
    'shadow magic|xge',
    'aberrant mind|tce',
    'clockwork soul|tce',
  ],
  xphb: [
    ...sharedSorcererOrigins,
    'aberrant sorcery|xphb',
    'clockwork sorcery|xphb',
    'wild magic sorcery|xphb',
    'spellfire sorcery|frhof',
    'shadow sorcery|rhw',
  ],
}

const sharedWizardTraditions = [
  'war magic|xge',
  'chronurgy magic|egw',
  'graviturgy magic|egw',
  'order of scribes|tce',
]
const reviewedWizardTraditions = {
  phb: [
    ...sharedWizardTraditions,
    'bladesinging|tce',
    ...[
      'abjuration',
      'conjuration',
      'divination',
      'enchantment',
      'evocation',
      'illusion',
      'necromancy',
      'transmutation',
    ].map((school) => `school of ${school}|phb`),
  ],
  xphb: [
    ...sharedWizardTraditions,
    'abjurer|xphb',
    'diviner|xphb',
    'evoker|xphb',
    'illusionist|xphb',
    'bladesinger|frhof',
    'conjurer|au',
    'enchanter|au',
    'necromancer|au',
    'transmuter|au',
  ],
}

const inheritedPaladinOaths = [
  'oath of the crown|scag',
  'oath of conquest|xge',
  'oath of redemption|xge',
  'oath of the watchers|tce',
]
const reviewedBardColleges = {
  phb: [
    'college of lore|phb',
    'college of valor|phb',
    'college of glamour|xge',
    'college of swords|xge',
    'college of whispers|xge',
    'college of creation|tce',
    'college of eloquence|tce',
    'college of spirits|vrgr',
  ],
  xphb: [
    'college of lore|xphb',
    'college of valor|xphb',
    'college of glamour|xphb',
    'college of dance|xphb',
    'college of the moon|frhof',
    'college of spirits|rhw',
    'college of swords|xge',
    'college of whispers|xge',
    'college of creation|tce',
    'college of eloquence|tce',
  ],
}

const reviewedPaladinOaths = {
  phb: [
    ...inheritedPaladinOaths,
    'oath of the ancients|phb',
    'oath of devotion|phb',
    'oath of vengeance|phb',
    'oath of glory|tce',
    'oathbreaker|dmg',
  ],
  xphb: [
    ...inheritedPaladinOaths,
    'oath of the ancients|xphb',
    'oath of devotion|xphb',
    'oath of vengeance|xphb',
    'oath of glory|xphb',
    'oath of the noble genies|frhof',
  ],
}

function beastShapeLimits(entries: readonly unknown[], level: number) {
  // The classic table is top-level and the revised table is inside its rules group.
  const tables = entries
    .flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const row = entry as Record<string, unknown>
      return Array.isArray(row.entries) ? row.entries : [row]
    })
    .filter((entry) => entry?.type === 'table' && entry.caption === 'Beast Shapes')
  if (tables.length !== 1) return ''
  const { rows, colLabels } = tables[0]
  if (!Array.isArray(rows) || !Array.isArray(colLabels)) return ''
  const byLevel = new Map<number, unknown[]>()
  for (const cells of rows) {
    if (!Array.isArray(cells) || cells.length !== colLabels.length) return ''
    const gain = typeof cells[0] === 'string' && /^(\d+)(?:st|nd|rd|th)?$/.exec(cells[0])
    if (!gain || byLevel.has(Number(gain[1]))) return ''
    byLevel.set(Number(gain[1]), cells)
  }
  const current = [...byLevel.keys()].filter((gain) => gain <= level)
  const cells = current.length ? byLevel.get(Math.max(...current)) : undefined
  if (!cells) return ''
  return colLabels
    .slice(1)
    .flatMap((label, index) => {
      if (typeof label !== 'string' || label === 'Example') return []
      const value = renderEntriesToText([cells[index + 1]])
      return value ? [`${label}: ${value}`] : []
    })
    .join(' · ')
}

function wildShapeSummary(
  cls: Class5e,
  level: number,
  catalogs: ClassChoiceFeatureCatalogs,
  unlimited: boolean,
) {
  if (level < 2) return undefined
  const source = cls.source.trim().toLowerCase()
  const wildShape = getCurrentDirectClassFeature(
    cls,
    catalogs,
    `class-feature|wild shape|druid|${source}|2|${source}`,
  )
  if (!wildShape) return undefined
  const limits = beastShapeLimits(wildShape.entries ?? [], level)
  const resource =
    unlimited && source === 'phb'
      ? undefined
      : getClassResourceDefs(cls, level).find((row) => row.id === CLASSIC_WILD_SHAPE_RESOURCE_ID)
  const useRule = resource
    ? `Base uses: ${resource.maxPerLevel[level - 1]}. ${formatClassResourceRecovery(getClassResourceRecoveryAtLevel(resource, level - 1))}`
    : ''
  const text = [useRule, limits && `Base Beast Shapes: ${limits}`].filter(Boolean).join('. ')
  return { text: text ? `${wildShape.name}: ${text}` : wildShape.name, compactText: wildShape.name }
}

function featureSummary(
  feature: Pick<ClassFeature, 'name' | 'entries'> | undefined,
  entries = feature?.entries,
) {
  const text = renderEntriesToText(entries)
  return feature && text ? [{ text: `${feature.name}: ${text}`, compactText: feature.name }] : []
}

function savedClassLabel(
  character: Character,
  entry: CharacterClassEntry,
  feature: ClassFeature | SubclassFeature,
) {
  const subclass = 'subclassShortName' in feature
  const owner = subclass ? { name: entry.subclass, source: entry.subclassSource } : entry
  const featureSource = subclass ? feature.source?.trim() || entry.subclassSource : feature.source
  const source = (subclass ? featureSource : entry.source)?.trim().toLowerCase()
  const tags = character.provenance?.features[feature.name.trim().toLowerCase()]
  const tag = tags?.[0]
  if (
    tags?.length !== 1 ||
    tag?.sourceType !== (subclass ? 'subclass' : 'class') ||
    tag.grantType !== 'fixed' ||
    tag.grantVariant ||
    (tag.grantSource && tag.grantSource.trim().toLowerCase() !== source) ||
    !findClassReference(owner, [{ name: tag.sourceName, source: tag.sourceRef }])
  )
    return undefined
  const labels = character.features.filter(
    (row) =>
      row.level === feature.level &&
      findClassReference({ name: feature.name, source: featureSource }, [row]),
  )
  return labels.length === 1 && !labels[0].description?.trim() ? labels[0] : undefined
}

/** Print-only rules which have a current, unambiguous declaration and an earned owner. */
export function getClassStaticFeatureSummaries(
  character: Character,
  catalogs: ClassChoiceFeatureCatalogs | undefined,
  unlimited: boolean,
): ClassStaticFeatureSummary[] {
  if (!catalogs) return []
  const progression = getCharacterClassEntries(character)
  const sorcerer = getCurrentNativeSorcerer(character, catalogs)
  return progression.flatMap((entry) => {
    if (entry === sorcerer?.owner) {
      const { cls, source } = sorcerer
      const origin = `${norm(entry.subclass)}|${norm(entry.subclassSource)}`
      const declared = reviewedSorcererOrigins[source].includes(origin)
        ? getDeclaredSubclassStaticFeatures(
            cls,
            entry,
            catalogs,
            source === 'phb'
              ? { level: 1, intro: 'sorcerous origin', later: 'sorcerous origin feature' }
              : { level: 3, intro: 'sorcerer subclass', later: 'subclass feature' },
          ).flatMap((feature) =>
            featureSummary(feature).map((summary) => ({
              ...summary,
              replaces: savedClassLabel(character, entry, feature),
            })),
          )
        : []
      const actionSummaries = [getDragonWings(sorcerer), getDraconicPresence(sorcerer)].flatMap(
        (rule) => {
          if (!rule) return []
          return featureSummary(rule.feature).map((summary) => ({
            ...summary,
            actionId: getFeatureActionGroupId(
              rule.ownerKey,
              rule.target,
              rule.feature.entries ?? [],
            ),
          }))
        },
      )
      const companion = featureSummary(getDragonCompanion(sorcerer))
      const innate = getInnateSorcery(sorcerer)
      if (!innate) return [...actionSummaries, ...companion, ...declared]
      const activation = renderEntriesToText(innate.entries?.slice(0, -1))
      return [
        ...actionSummaries,
        {
          text: `${innate.name} activation: ${activation}`,
          compactText: '',
          replaces: savedClassLabel(character, entry, innate),
        },
        ...getInnateSorceryUpgrades(sorcerer).flatMap((feature) =>
          feature
            ? featureSummary(feature).map((summary) => ({
                ...summary,
                replaces: savedClassLabel(character, entry, feature),
              }))
            : [],
        ),
        ...companion,
        ...declared,
      ]
    }
    const name = entry.name.trim().toLowerCase()
    const source = entry.source.trim().toLowerCase()
    if (
      (name !== 'bard' &&
        name !== 'barbarian' &&
        name !== 'druid' &&
        name !== 'paladin' &&
        name !== 'wizard' &&
        name !== 'warlock') ||
      (source !== 'phb' && source !== 'xphb') ||
      progression.filter((owner) => findClassReference(entry, [owner])).length !== 1
    )
      return []
    const classes = catalogs.classes?.filter((cls) => findClassReference(entry, [cls]))
    if (classes?.length !== 1 || classes[0].sourceIdentityConflict) return []
    const cls = classes[0]
    if (name === 'bard') {
      if (!getSourceCompatibility(source, character.originSystem ?? '2014').compatible) return []
      const jack = entry.levels >= 2 && getCurrentBardJackOfAllTrades(cls, catalogs)
      const secrets = (source === 'phb' ? [10, 14, 18] : [10]).flatMap((gain) => {
        const feature =
          entry.levels >= gain && getCurrentBardMagicalSecrets([cls], catalogs, source, gain)
        return feature ? [feature] : []
      })
      const words =
        entry.levels === 20 && hasCurrentBardWordsOfCreation(cls, catalogs)
          ? getCurrentDirectClassFeature(cls, catalogs, WORDS_OF_CREATION_TARGET)
          : undefined
      const college = reviewedBardColleges[source].includes(
        `${norm(entry.subclass)}|${norm(entry.subclassSource)}`,
      )
        ? getDeclaredSubclassStaticFeatures(cls, entry, catalogs, {
            level: 3,
            intro: source === 'phb' ? 'bard college' : 'bard subclass',
            later: source === 'phb' ? 'bard college feature' : 'subclass feature',
            expandNestedRules: true,
          })
        : []
      return [...(jack ? [jack] : []), ...secrets, ...(words ? [words] : []), ...college].flatMap(
        (feature) =>
          featureSummary(feature).map((summary) => ({
            ...summary,
            replaces: savedClassLabel(character, entry, feature),
          })),
      )
    }
    if (name === 'barbarian') {
      if (!getSourceCompatibility(source, character.originSystem ?? '2014').compatible) return []
      const gain = (level: number, feature: string) =>
        entry.levels < level
          ? undefined
          : getCurrentDirectClassFeature(
              cls,
              catalogs,
              `class-feature|${feature}|barbarian|${source}|${level}|${source}`,
            )
      const base = [
        gain(1, 'rage'),
        gain(1, 'unarmored defense'),
        gain(5, 'fast movement'),
        gain(20, 'primal champion'),
      ]
      if (source === 'xphb') base.push(gain(3, 'primal knowledge'))
      const path = getDeclaredSubclassStaticFeatures(cls, entry, catalogs, {
        sourceDeclaredGains: true,
        expandNestedRules: true,
      })
      return [...base, ...path].flatMap((feature) =>
        feature
          ? featureSummary(feature).map((summary) => ({
              ...summary,
              replaces: savedClassLabel(character, entry, feature),
            }))
          : [],
      )
    }
    if (name === 'paladin') {
      if (!getSourceCompatibility(source, character.originSystem ?? '2014').compatible) return []
      const aura =
        entry.levels >= 6
          ? getCurrentDirectClassFeature(
              cls,
              catalogs,
              `class-feature|aura of protection|paladin|${source}|6|${source}`,
            )
          : undefined
      const oath = reviewedPaladinOaths[source].includes(
        `${norm(entry.subclass)}|${norm(entry.subclassSource)}`,
      )
        ? getDeclaredSubclassStaticFeatures(
            cls,
            entry,
            catalogs,
            source === 'phb'
              ? {
                  level: 3,
                  intro: 'sacred oath',
                  later: 'sacred oath feature',
                  expandNestedRules: true,
                }
              : {
                  level: 3,
                  intro: 'paladin subclass',
                  later: 'subclass feature',
                  expandNestedRules: true,
                },
          )
        : []
      return [...(aura ? [aura] : []), ...oath].flatMap((feature) =>
        featureSummary(feature).map((summary) => ({
          ...summary,
          replaces: savedClassLabel(character, entry, feature),
        })),
      )
    }
    if (name === 'warlock') {
      if (!getSourceCompatibility(source, character.originSystem ?? '2014').compatible) return []
      return getWarlockStaticFeatures(cls, entry, catalogs).flatMap((feature) => {
        const target =
          'subclassShortName' in feature ? getSubclassFeatureIdentity(feature) : undefined
        const patron = getNativeWarlockPatronFeatureOwner(target)
        const actionId =
          target && patron && patron.shortName !== 'fiend'
            ? getFeatureActionGroupId(
                getFeatureOwnerKey(entry.name, entry.source, patron.name, patron.source),
                target,
                feature.entries ?? [],
              )
            : undefined
        return featureSummary(feature).map((summary) => ({
          ...summary,
          replaces: savedClassLabel(character, entry, feature),
          ...(actionId && !character.manualActions?.some((action) => action.id === actionId)
            ? { actionId, actionNotesSource: 'subclass' as const }
            : {}),
        }))
      })
    }
    if (name === 'wizard') {
      if (!Number.isInteger(entry.levels) || entry.levels < 1) return []
      const tradition =
        getSourceCompatibility(source, character.originSystem ?? '2014').compatible &&
        reviewedWizardTraditions[source].includes(
          `${norm(entry.subclass)}|${norm(entry.subclassSource)}`,
        )
          ? getDeclaredSubclassStaticFeatures(
              cls,
              entry,
              catalogs,
              source === 'phb'
                ? { level: 2, intro: 'arcane tradition', later: 'arcane tradition feature' }
                : { level: 3, intro: 'wizard subclass', later: 'subclass feature' },
            ).flatMap((feature) =>
              featureSummary(feature).map((summary) => ({
                ...summary,
                replaces: savedClassLabel(character, entry, feature),
              })),
            )
          : []
      const feature = getCurrentDirectClassFeature(
        cls,
        catalogs,
        `class-feature|arcane recovery|wizard|${source}|1|${source}`,
      )
      if (!feature) return tradition
      const [summary] = featureSummary(feature)
      if (!summary) return tradition
      const replaces = savedClassLabel(character, entry, feature)
      return [replaces ? { ...summary, replaces } : summary, ...tradition]
    }
    const shape = wildShapeSummary(cls, entry.levels, catalogs, unlimited)
    const subclasses = cls.subclasses?.filter((subclass) =>
      findClassReference({ name: entry.subclass, source: entry.subclassSource }, [subclass]),
    )
    const land =
      subclasses?.length === 1 ? getLandStaticFeatures(cls, subclasses[0], entry.levels) : []
    const landSummaries = land.flatMap((feature) => {
      let entries = feature.entries
      if (feature.name === "Nature's Ward" && feature.source === 'XPHB') {
        // The selected resistance already has a current terrain summary.
        const line = entries?.[0]
        const immunity =
          typeof line === 'string' &&
          /^(You are immune to the \{@condition [^|{}]+\|XPHB\} condition), and you have /.exec(
            line,
          )
        if (!immunity) return []
        entries = [`${immunity[1]}.`]
      }
      return featureSummary(feature, entries)
    })
    const otherCircle = reviewedDruidCircles[source].includes(
      `${norm(entry.subclass)}|${norm(entry.subclassSource)}`,
    )
      ? getDeclaredSubclassStaticFeatures(
          cls,
          entry,
          catalogs,
          source === 'phb'
            ? { level: 2, intro: 'druid circle', later: 'druid circle feature' }
            : { level: 3, intro: 'druid subclass', later: 'subclass feature' },
        ).flatMap((feature) =>
          featureSummary(feature).map((summary) => ({
            ...summary,
            replaces: savedClassLabel(character, entry, feature),
          })),
        )
      : []
    return [...(shape ? [shape] : []), ...landSummaries, ...otherCircle]
  })
}
