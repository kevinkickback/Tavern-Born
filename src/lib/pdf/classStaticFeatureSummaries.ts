import { CLASSIC_WILD_SHAPE_RESOURCE_ID } from '@/lib/5etools/archdruidSource'
import { getChosenArmorModel } from '@/lib/5etools/artificerArmorModels'
import {
  getArtificerItemCapacity,
  getCurrentArtificerRules,
} from '@/lib/5etools/artificerJourneyRules'
import {
  getCurrentBardJackOfAllTrades,
  getCurrentBardMagicalSecrets,
  hasCurrentBardWordsOfCreation,
  WORDS_OF_CREATION_TARGET,
} from '@/lib/5etools/bardSpellSources'
import { isCircleOfTheLand, isLandChoiceFeature } from '@/lib/5etools/circleOfTheLand'
import { getNormalizedClassChoiceId } from '@/lib/5etools/classChoiceId'
import { getClassResourceDefs, getSelectedSubclassData } from '@/lib/5etools/classData'
import {
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
} from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import {
  formatClassResourceRecovery,
  getClassResourceRecoveryAtLevel,
} from '@/lib/5etools/classRuleNormalization'
import { getCurrentDirectClassFeature } from '@/lib/5etools/directClassFeatureSource'
import { getCurrentMysticRules, getMysticPsiLimit } from '@/lib/5etools/mysticJourneyRules'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
  optionalDeclarationObject as record,
  scanOptionalDeclarationReferences,
} from '@/lib/5etools/optionalClassDeclarationStructure'
import { revisedHunterRules } from '@/lib/5etools/revisedHunterIdentity'
import { getRogueStrikeEntries } from '@/lib/5etools/rogueStrikeEntries'
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
import { getClassChoiceFeatureId, getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import {
  createClassChoiceCatalogs,
  getCharacterClassChoices,
  getClassChoiceOptionKey,
  getEarnedFixedClassChoiceOptions,
  isClassChoiceOptionEligible,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import { renderEntriesToText } from '@/lib/entryText'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import { getSourceCompatibility } from '@/lib/sourceCompatibility'
import type { Class5e, ClassFeature, SubclassFeature } from '@/types/5etools'
import type {
  Character,
  CharacterClassEntry,
  Feature,
  OptionalClassFeatureOwner,
} from '@/types/character'
import {
  getCopiedSubclassSheetFeature,
  getDeclaredSubclassStaticFeatures,
  getInheritedSubclassStaticFeatures,
} from './declaredSubclassStaticFeatures'
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

function withoutArtificerPlanTables(entries: unknown[]): unknown[] {
  return entries.flatMap((entry) => {
    const row = record(entry)
    if (
      row.type === 'table' &&
      typeof row.caption === 'string' &&
      /^Magic Item Plans \(Artificer Level \d+\+\)$/.test(row.caption)
    )
      return []
    return Array.isArray(row.entries)
      ? [{ ...row, entries: withoutArtificerPlanTables(row.entries) }]
      : [entry]
  })
}

function getClassicHunterSelectedRules(
  character: Character,
  owner: CharacterClassEntry,
  feature: SubclassFeature,
) {
  const groups = (feature.entries ?? []).map(record).filter((row) => row.type === 'options')
  const group = groups[0]
  const level = feature.level
  if (
    !level ||
    groups.length !== 1 ||
    !Array.isArray(group.entries) ||
    typeof group.count !== 'number'
  )
    return []
  const id = getNormalizedClassChoiceId(
    {
      type: 'subclass',
      name: owner.name,
      source: owner.source,
      subclassName: owner.subclass,
      subclassSource: owner.subclassSource,
    },
    feature.name,
    level,
  )
  const rows = character.classChoiceSelections?.filter((selection) => selection.choiceId === id)
  const saved = rows?.[0]
  if (
    rows?.length !== 1 ||
    !saved ||
    saved.inactive ||
    saved.kind !== 'subclass-feature' ||
    saved.classLevel !== feature.level ||
    getFeatureOwnerKey(
      saved.className,
      saved.classSource,
      saved.subclassName,
      saved.subclassSource,
    ) !== getFeatureOwnerKey(owner.name, owner.source, owner.subclass, owner.subclassSource) ||
    saved.selected.length !== group.count ||
    new Set(saved.selected.map((option) => getClassChoiceFeatureId(saved, option))).size !==
      group.count
  )
    return []
  const refs = group.entries.map(record)
  return saved.selected.flatMap((option) => {
    if (
      option.entityType !== 'subclassFeature' ||
      option.slotLevel !== feature.level ||
      !option.ref ||
      norm(option.source) !== norm(feature.source)
    )
      return []
    const target = decodeOptionalDeclaration(option.ref, 'subclassFeature')?.target
    const choices = refs.filter(
      (row) =>
        row.type === 'refSubclassFeature' &&
        typeof row.subclassFeature === 'string' &&
        decodeOptionalDeclaration(row.subclassFeature, 'subclassFeature')?.target === target &&
        exactOptionalDeclarationReference(row, row.subclassFeature, 'subclassFeature'),
    )
    const choice = choices[0]?.feature as SubclassFeature | undefined
    return target &&
      choices.length === 1 &&
      choice &&
      !choice.sourceIdentityConflict &&
      !choice.featureOptionSourceConflict &&
      !choice.isClassFeatureVariant &&
      !('_copy' in choice) &&
      norm(choice.name) === norm(option.name) &&
      getSubclassFeatureIdentity(choice) === target
      ? featureSummary(choice).map((summary) => ({
          ...summary,
          replaces: character.features.find(
            (row) => row.id === getClassChoiceFeatureId(saved, option),
          ),
        }))
      : []
  })
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

function getClericStaticSummaries(
  character: Character,
  cls: Class5e,
  entry: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs,
  source: 'phb' | 'xphb',
) {
  const activity = createOptionalClassFeatureActivity(character, catalogs)
  const classOwner: OptionalClassFeatureOwner = ['class', 'cleric', source]
  const domainName = norm(entry.subclass)
  const domainSource = norm(entry.subclassSource)
  const domainOwner: OptionalClassFeatureOwner = [
    'subclass',
    'cleric',
    source,
    domainName,
    domainSource,
  ]
  const classic = source === 'phb'
  const direct = cls.classFeatureRefs ?? []
  const baseRules = [
    'channel divinity',
    'divine intervention',
    ...(classic
      ? ['divine intervention improvement']
      : ['greater divine intervention', 'sear undead', 'improved blessed strikes']),
  ]
  const exact = (ref: (typeof direct)[number] | undefined) => {
    const target = ref && getClassFeatureIdentity(ref)
    return ref?.level && ref.level <= entry.levels && target
      ? getCurrentDirectClassFeature(cls, catalogs, target)
      : undefined
  }
  const base = baseRules.flatMap((name) => {
    const matches = direct.filter((ref) => norm(ref.name) === name)
    if (name === 'channel divinity') {
      // Classic later uses share the label. The first declaration owns the full rule and its options.
      const [first, next] = matches.sort((a, b) => (a.level ?? Infinity) - (b.level ?? Infinity))
      const feature = first?.level !== next?.level ? exact(first) : undefined
      return feature ? [feature, ...getClericChannelDivinityOptions(feature, catalogs, source)] : []
    }
    const feature = matches.length === 1 ? exact(matches[0]) : undefined
    if (!feature) return []
    return [feature]
  })
  if (classic) {
    const earned = direct
      .filter(
        (ref) =>
          /^destroy undead \(cr \d+(?:\/\d+)?\)$/.test(norm(ref.name)) &&
          (ref.level ?? Infinity) <= entry.levels,
      )
      .sort((a, b) => (b.level ?? 0) - (a.level ?? 0))
    const current = earned[0]
    const upgrade = current?.level !== earned[1]?.level ? exact(current) : undefined
    if (upgrade) base.push(upgrade)
  }
  const domains = getDeclaredSubclassStaticFeatures(cls, entry, catalogs, {
    sourceDeclaredGains: true,
    expandNestedRules: true,
  })
  return [...base, ...domains].flatMap((feature) => {
    const subclass = 'subclassShortName' in feature
    const owner = subclass ? domainOwner : classOwner
    const target = subclass ? getSubclassFeatureIdentity(feature) : getClassFeatureIdentity(feature)
    const level = feature.level
    if (!target || !level || !activity.declared(owner, target, level)) return []
    return featureSummary(feature, activity.entries(owner, target, feature.entries ?? [])).map(
      (summary) => ({ ...summary, replaces: savedClassLabel(character, entry, feature) }),
    )
  })
}

function getClericChannelDivinityOptions(
  feature: ClassFeature,
  catalogs: ClassChoiceFeatureCatalogs,
  source: 'phb' | 'xphb',
) {
  const names =
    source === 'phb' ? ['channel divinity: turn undead'] : ['divine spark', 'turn undead']
  const allowed = new Set(
    names.map((name) => `class-feature|${name}|cleric|${source}|${feature.level}|${source}`),
  )
  const targets: string[] = []
  scanOptionalDeclarationReferences(feature.entries, (uid, kind, row) => {
    const target = decodeOptionalDeclaration(uid, kind)?.target
    if (
      target &&
      allowed.has(target) &&
      exactOptionalDeclarationReference(row, uid, 'classFeature')
    )
      targets.push(target)
  })
  return targets.flatMap((target) => {
    if (targets.indexOf(target) !== targets.lastIndexOf(target)) return []
    const candidates = catalogs.classFeatureCandidates
      ? catalogs.classFeatureCandidates.get(target)
      : catalogs.classFeatures.filter((row) => getClassFeatureIdentity(row) === target)
    const child = candidates?.[0]
    return candidates?.length === 1 &&
      child &&
      !child.sourceIdentityConflict &&
      !child.featureOptionSourceConflict &&
      !child.isClassFeatureVariant &&
      getClassFeatureIdentity(child) === target
      ? [child]
      : []
  })
}

function getArtificerPlanNames(
  character: Character,
  owner: CharacterClassEntry,
  cls: Class5e,
  catalogs: ClassChoiceFeatureCatalogs,
) {
  const activity = createOptionalClassFeatureActivity(character, catalogs)
  const choices = getCharacterClassChoices(cls, undefined, activity, catalogs).filter(
    (choice) =>
      (choice.kind === 'item' && choice.source.kind === 'class-table') ||
      (choice.kind === 'optional-feature' && choice.optionFilter?.featureTypes?.join() === 'AI'),
  )
  if (choices.length !== 1) return []
  const [choice] = choices
  const saved = character.classChoiceSelections?.filter(
    (row) =>
      !row.inactive &&
      row.choiceId === choice.id &&
      row.className === owner.name &&
      row.classSource === owner.source &&
      !row.subclassName &&
      row.classLevel === choice.level,
  )
  if (saved?.length !== 1) return []
  const selected = saved[0].selected.filter(
    (option) => option.slotLevel >= choice.level && option.slotLevel <= owner.levels,
  )
  const options = resolveClassChoiceOptions(
    choice,
    createClassChoiceCatalogs(catalogs),
    selected,
    owner.levels,
    character,
  )
  const available = new Map(
    options
      .filter(isClassChoiceOptionEligible)
      .map((option) => [
        getClassChoiceOptionKey(option.reference),
        option.displayLabel ?? option.reference.name,
      ]),
  )
  return selected.flatMap((option) => {
    const name = available.get(getClassChoiceOptionKey(option))
    return name ? [name] : []
  })
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
    const copiedRule = getCopiedSubclassSheetFeature(character, entry, catalogs)
    if (copiedRule)
      return featureSummary(copiedRule).map((summary) => ({
        ...summary,
        replaces: savedClassLabel(character, entry, copiedRule),
      }))
    const inheritedRules = (cls: Class5e) =>
      getInheritedSubclassStaticFeatures(character, cls, entry, catalogs)
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
          )
        : inheritedRules(cls)
      const originSummaries = declared.flatMap((feature) =>
        featureSummary(feature).map((summary) => ({
          ...summary,
          replaces: savedClassLabel(character, entry, feature),
        })),
      )
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
      if (!innate) return [...actionSummaries, ...companion, ...originSummaries]
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
        ...originSummaries,
      ]
    }
    const name = entry.name.trim().toLowerCase()
    const source = entry.source.trim().toLowerCase()
    if (name === 'artificer') {
      const current = getCurrentArtificerRules(character, catalogs)
      if (!current || current.owner !== entry) return []
      const { cls } = current
      const capacity = getArtificerItemCapacity(current)
      const plans = capacity ? getArtificerPlanNames(character, entry, cls, catalogs) : []
      const base = (cls.classFeatureRefs ?? []).flatMap((ref) => {
        if (
          !ref.level ||
          ref.level > entry.levels ||
          ref.gainSubclassFeature ||
          ['ability score improvement', 'epic boon'].includes(norm(ref.name))
        )
          return []
        const target = getClassFeatureIdentity(ref)
        const feature = target && getCurrentDirectClassFeature(cls, catalogs, target)
        if (!feature) return []
        return [
          {
            ...feature,
            entries:
              capacity?.target === target
                ? [
                    ...withoutArtificerPlanTables(feature.entries ?? []),
                    `Maximum active ${capacity.label.toLowerCase()}: ${capacity.amount}.`,
                    ...(plans.length ? [`Known ${capacity.known}: ${plans.join(', ')}.`] : []),
                  ]
                : feature.entries,
          },
        ]
      })
      const specialty = getDeclaredSubclassStaticFeatures(cls, entry, catalogs, {
        sourceDeclaredGains: true,
        expandNestedRules: true,
      })
      const model =
        entry.subclass === 'Armorer' && entry.subclassSource === cls.source
          ? getChosenArmorModel(cls.source, catalogs.classes, character.classChoiceSelections)
          : undefined
      const specialistRules = specialty.map((feature) => {
        if (!model || !feature.entries) return feature
        if (feature.name === 'Armor Model') {
          const options = model.name
            ? []
            : model.alternatives.map(({ name, entries }) => ({
                type: 'entries',
                name,
                entries,
              }))
          return {
            ...feature,
            entries: [...feature.entries.filter((row) => typeof row === 'string'), ...options],
          }
        }
        if (feature.name !== 'Perfected Armor' || !model.name) return feature
        return {
          ...feature,
          entries: feature.entries.filter((row) => {
            const section = record(row)
            const name = norm(typeof section.name === 'string' ? section.name : undefined)
            return (
              !model.alternatives.some((option) => norm(option.name) === name) ||
              name === norm(model.name)
            )
          }),
        }
      })
      return [...base, ...specialistRules].flatMap((feature) =>
        featureSummary(feature).map((summary) => ({
          ...summary,
          replaces: savedClassLabel(character, entry, feature),
        })),
      )
    }
    if (name === 'mystic') {
      const current = getCurrentMysticRules(character, entry, catalogs)
      if (!current) return []
      const limit = getMysticPsiLimit(current)
      const base = current.features.flatMap((feature) => {
        if (
          [
            'Ability Score Improvement',
            'Psionic Disciplines and Talents',
            'Using a Discipline',
          ].includes(feature.name)
        )
          return []
        if (feature.name === 'Psionics') {
          return limit ? [{ ...feature, entries: [`Current Psi Limit is ${limit}.`] }] : []
        }
        return [feature]
      })
      const order = getDeclaredSubclassStaticFeatures(current.cls, entry, catalogs, {
        sourceDeclaredGains: true,
        expandNestedRules: true,
      })
      return [...base, ...order].flatMap((feature) =>
        featureSummary(feature).map((summary) => ({
          ...summary,
          replaces: savedClassLabel(character, entry, feature),
        })),
      )
    }
    if (
      (name !== 'bard' &&
        name !== 'barbarian' &&
        name !== 'cleric' &&
        name !== 'druid' &&
        name !== 'fighter' &&
        name !== 'monk' &&
        name !== 'paladin' &&
        name !== 'ranger' &&
        name !== 'rogue' &&
        name !== 'wizard' &&
        name !== 'warlock') ||
      (source !== 'phb' && source !== 'xphb') ||
      progression.filter((owner) => findClassReference(entry, [owner])).length !== 1
    )
      return []
    const classes = catalogs.classes?.filter((cls) => findClassReference(entry, [cls]))
    if (classes?.length !== 1 || classes[0].sourceIdentityConflict) return []
    const cls = classes[0]
    if (name === 'cleric')
      return getSourceCompatibility(source, character.originSystem ?? '2014').compatible
        ? getClericStaticSummaries(character, cls, entry, catalogs, source)
        : []
    if (name === 'rogue') {
      if (!getSourceCompatibility(source, character.originSystem ?? '2014').compatible) return []
      const base = (cls.classFeatureRefs ?? []).flatMap((ref) => {
        if (
          !ref.level ||
          ref.level > entry.levels ||
          ref.gainSubclassFeature ||
          norm(ref.source) !== source ||
          [
            'ability score improvement',
            'epic boon',
            'expertise',
            "thieves' cant",
            'weapon mastery',
          ].includes(norm(ref.name))
        )
          return []
        const target = getClassFeatureIdentity(ref)
        const feature = target && getCurrentDirectClassFeature(cls, catalogs, target)
        return feature ? [{ ...feature, entries: getRogueStrikeEntries(feature, catalogs) }] : []
      })
      const archetype = getDeclaredSubclassStaticFeatures(cls, entry, catalogs, {
        sourceDeclaredGains: true,
        expandNestedRules: true,
        expandUncountedFixedGroups: true,
      })
      return [...base, ...archetype].flatMap((feature) =>
        featureSummary(feature).map((summary) => ({
          ...summary,
          replaces: savedClassLabel(character, entry, feature),
        })),
      )
    }
    if (name === 'monk') {
      if (!getSourceCompatibility(source, character.originSystem ?? '2014').compatible) return []
      const base = (cls.classFeatureRefs ?? []).flatMap((ref) => {
        if (
          !ref.level ||
          ref.level > entry.levels ||
          ref.gainSubclassFeature ||
          norm(ref.source) !== source ||
          ['ability score improvement', 'epic boon'].includes(norm(ref.name))
        )
          return []
        const target = getClassFeatureIdentity(ref)
        const feature = target && getCurrentDirectClassFeature(cls, catalogs, target)
        return feature ? [feature] : []
      })
      const tradition = getDeclaredSubclassStaticFeatures(cls, entry, catalogs, {
        sourceDeclaredGains: true,
        expandNestedRules: true,
      })
      const fixed = getCharacterClassChoices(
        cls,
        getSelectedSubclassData(cls, entry),
        createOptionalClassFeatureActivity(character, catalogs),
        catalogs,
      ).flatMap((choice) => getEarnedFixedClassChoiceOptions(choice, catalogs, entry.levels))
      return [
        ...[...base, ...tradition].flatMap((feature) =>
          featureSummary(feature).map((summary) => ({
            ...summary,
            replaces: savedClassLabel(character, entry, feature),
          })),
        ),
        ...fixed.flatMap((feature) => featureSummary(feature)),
      ]
    }
    if (name === 'ranger') {
      if (!getSourceCompatibility(source, character.originSystem ?? '2014').compatible) return []
      const sheetRules = new Set([
        'extra attack',
        "land's stride",
        'hide in plain sight',
        'vanish',
        'roving',
        'tireless',
        'relentless hunter',
        "nature's veil",
        'precise hunter',
        'feral senses',
        'foe slayer',
      ])
      const base = (cls.classFeatureRefs ?? []).flatMap((ref) => {
        if (!ref.level || ref.level > entry.levels || !sheetRules.has(norm(ref.name))) return []
        const target = getClassFeatureIdentity(ref)
        const current = target && getCurrentDirectClassFeature(cls, catalogs, target)
        return current ? [current] : []
      })
      const archetype = getDeclaredSubclassStaticFeatures(cls, entry, catalogs, {
        sourceDeclaredGains: true,
        expandNestedRules: true,
      })
      const classicHunter =
        norm(entry.subclass) === 'hunter' && norm(entry.subclassSource) === 'phb'
      const confirmed = classicHunter
        ? archetype.flatMap((feature) => getClassicHunterSelectedRules(character, entry, feature))
        : []
      const declared = [...base, ...archetype].flatMap((feature) => {
        const target = getSubclassFeatureIdentity(feature)
        const revisedChoice = revisedHunterRules.some((rule) => rule.target === target)
        const classicChoice = classicHunter && 'subclassShortName' in feature
        // The confirmed options are printed independently of the granting rules.
        const entries = feature.entries?.filter((entry) =>
          revisedChoice
            ? typeof entry === 'string'
            : !classicChoice || record(entry).type !== 'options',
        )
        return featureSummary(feature, entries).map((summary) => ({
          ...summary,
          replaces: savedClassLabel(character, entry, feature),
        }))
      })
      return [...confirmed, ...declared]
    }
    if (name === 'fighter') {
      if (!getSourceCompatibility(source, character.originSystem ?? '2014').compatible) return []
      const classic = source === 'phb'
      const earned = (cls.classFeatureRefs ?? []).filter(
        (ref) => ref.level && ref.level <= entry.levels,
      )
      const [extraAttack, previousAttack] = earned
        .filter((ref) =>
          /^(?:extra attack(?: \(\d+\))?|(?:two|three) extra attacks)$/i.test(ref.name),
        )
        .sort((left, right) => (right.level ?? 0) - (left.level ?? 0))
      const tactical = new Set([
        'tactical mind',
        'tactical shift',
        'tactical master',
        'studied attacks',
      ])
      const baseRules = [
        ...(extraAttack && extraAttack.level !== previousAttack?.level ? [extraAttack] : []),
        ...(classic ? [] : earned.filter((ref) => tactical.has(norm(ref.name)))),
      ]
      const base = baseRules.flatMap((ref) => {
        const target = getClassFeatureIdentity(ref)
        const current = target && getCurrentDirectClassFeature(cls, catalogs, target)
        return current ? [current] : []
      })
      const archetype = getDeclaredSubclassStaticFeatures(cls, entry, catalogs, {
        sourceDeclaredGains: true,
        expandNestedRules: true,
      })
      return [...base, ...archetype].flatMap((feature) =>
        featureSummary(feature).map((summary) => ({
          ...summary,
          replaces: savedClassLabel(character, entry, feature),
        })),
      )
    }
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
        : inheritedRules(cls)
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
      return getWarlockStaticFeatures(cls, entry, catalogs, () => inheritedRules(cls)).flatMap(
        (feature) => {
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
        },
      )
    }
    if (name === 'wizard') {
      if (!Number.isInteger(entry.levels) || entry.levels < 1) return []
      const tradition = (
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
            )
          : inheritedRules(cls)
      ).flatMap((feature) =>
        featureSummary(feature).map((summary) => ({
          ...summary,
          replaces: savedClassLabel(character, entry, feature),
        })),
      )
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
    const land =
      entry.subclass &&
      norm(entry.subclassSource) === source &&
      isCircleOfTheLand(entry.name, entry.source, entry.subclass, entry.subclassSource)
        ? getDeclaredSubclassStaticFeatures(cls, entry, catalogs, { sourceDeclaredGains: true })
        : []
    const landSummaries = land.flatMap((feature) => {
      if (isLandChoiceFeature(getSubclassFeatureIdentity(feature))) return []
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
      return featureSummary(feature, entries).map((summary) => ({
        ...summary,
        replaces: savedClassLabel(character, entry, feature),
      }))
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
