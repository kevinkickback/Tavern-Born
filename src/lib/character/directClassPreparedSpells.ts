import { parseAdditionalSpellBlocks } from '@/lib/5etools/additionalSpells'
import {
  hasCurrentBardWordsOfCreation,
  WORDS_OF_CREATION_TARGET,
} from '@/lib/5etools/bardSpellSources'
import { getClassFeatureIdentity } from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { getCurrentDirectClassFeature } from '@/lib/5etools/directClassFeatureSource'
import {
  getCurrentDirectFixedClassRules,
  getCurrentFixedClassFeatureRule,
} from '@/lib/5etools/directFixedProficiencySource'
import {
  getCurrentSelectedClass,
  getEarnedDirectClassFeature,
  permitsClassRuleSource,
} from '@/lib/5etools/earnedClassFeatureSource'
import { getFeatureSourceDigest, hasFeatureSourceShape } from '@/lib/5etools/featureSourceAudit'
import {
  ELDRITCH_HEX_REFERENCE,
  ELDRITCH_HEX_RULE_DIGEST,
  ELDRITCH_HEX_TARGET,
  getCurrentNativeWarlockPatronRules,
  getNativeEldritchHexOwner,
} from '@/lib/5etools/nativeWarlockPatronRules'
import {
  decodeOptionalDeclaration,
  optionalDeclarationObject as record,
} from '@/lib/5etools/optionalClassDeclarationStructure'
import { getCurrentRangerFeatures } from '@/lib/5etools/rangerFeatureSource'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm, stripItemTag } from '@/lib/provenance/normalization'
import { getSourceCompatibility } from '@/lib/sourceCompatibility'
import type { Class5e, ClassFeature } from '@/types/5etools'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import type { ClassFixedSpellGrant } from './optionalClassFixedSpells'

const paladin = { name: 'paladin', source: 'xphb' }
const ranger = { name: 'ranger', source: 'xphb' }
const warlock = { name: 'warlock', source: 'xphb' }
export const CONTACT_PATRON_TARGET = 'class-feature|contact patron|warlock|xphb|9|xphb'
const favoredEnemy = 'class-feature|favored enemy|ranger|xphb|1|xphb'
const huntersMark = "hunter's mark|xphb"
const druidic = 'class-feature|druidic|druid|xphb|1|xphb'
const preparedFeatureFields = new Set([
  'name',
  'source',
  'className',
  'classSource',
  'level',
  'entries',
  'srd52',
  'page',
  'basicRules2024',
])
// Both catalogs carry the same authored feature bodies and exact class schedule.
const paladinSpells = [
  [
    "Paladin's Smite",
    2,
    'Divine Smite|XPHB',
    1,
    '81381a0bae19c408e50006ae7e220b817c1521bb935963ca87e852469a8a7835',
  ],
  [
    'Faithful Steed',
    5,
    'Find Steed|XPHB',
    2,
    'cebc586af19b251903a1c7ac3d3af3cd80f59ac72e89f199413524ae4c4db1d3',
  ],
] as const

type ClassPreparedSpellGrant = ClassFixedSpellGrant & {
  spellLevel: number | 'leveled'
  castingNote?: string
  sourceReason?: string
}

function getPreparedSchedule(cls: Class5e) {
  const blocks = cls.additionalSpells as AdditionalSpellBlock[] | undefined
  const block = Array.isArray(blocks) && blocks.length === 1 ? blocks[0] : undefined
  const prepared = block?.prepared
  return block &&
    Object.keys(block).length === 1 &&
    prepared &&
    typeof prepared === 'object' &&
    !Array.isArray(prepared)
    ? prepared
    : undefined
}

const inlineSlotFree =
  /^You can cast it once without a spell slot, and you regain the ability to cast it in that way when you finish a \{@variantrule Long Rest\|XPHB(?:\|Long Rest)?\}\.$/i
const separateSlotFree =
  /^You can also cast the spell once without expending a spell slot, and you regain the ability to do so when you finish a \{@variantrule Long Rest\|XPHB(?:\|Long Rest)?\}\.$/i

function hasClassFeatureTagTarget(value: string) {
  const fields = value.split('|')
  return (
    fields.length <= 6 && !!decodeOptionalDeclaration(fields.slice(0, 5).join('|'), 'classFeature')
  )
}

function isIndependentMovementEffect(value: unknown) {
  const effect = record(value)
  const entries = effect.entries
  return (
    effect.type === 'entries' &&
    typeof effect.name === 'string' &&
    /^[\p{L} '’-]+ \([\p{L} '’-]+ Only; Recharges After a Long Rest\)$/u.test(effect.name) &&
    Object.keys(effect).every((key) => key === 'type' || key === 'name' || key === 'entries') &&
    Array.isArray(entries) &&
    entries.length === 1 &&
    typeof entries[0] === 'string' &&
    /^The ([\p{L} '’-]+) and its rider can move through other creatures and objects this turn as if they were \{@variantrule Difficult Terrain\|XPHB\}\. Both \1 and rider take [1-9]\d* \(\{@damage [1-9]\d*d[1-9]\d*\}\) [\p{L}]+ damage if they end their turn inside an object\.$/iu.test(
      entries[0],
    )
  )
}

function confirmsSlotFreePreparation(feature: ClassFeature, reference: string) {
  if (feature._copy || !Array.isArray(feature.entries)) return false
  const entries = [...feature.entries]
  const replacement =
    typeof entries[0] === 'string' &&
    /^This feature replaces the [\p{L} '’-]+ \{@classFeature ([^{}]+)\} feature of the [\p{L} '’-]+ class\.$/u.exec(
      entries[0],
    )
  if (replacement) {
    if (!hasClassFeatureTagTarget(replacement[1])) return false
    entries.shift()
  }
  const [preparation, recovery, ...tail] = entries
  if (typeof preparation !== 'string') return false
  const statement =
    /^(?:You can call on the aid of (?:a|an|the) [\p{L}'’-]+(?: [\p{L}'’-]+)?\. )?You always have the \{@spell ([^|#{}]+\|[^|#{}]+)\} spell prepared\.(?: (.+))?$/u.exec(
      preparation,
    )
  if (!statement || getSpellReferenceKey(statement[1]) !== getSpellReferenceKey(reference))
    return false
  if (statement[2]) return entries.length === 1 && inlineSlotFree.test(statement[2])
  if (typeof recovery !== 'string' || !separateSlotFree.test(recovery)) return false
  if (!tail.length) return true

  // An independent effect of the cast may follow. Conditional casting terms are unsupported.
  const [addition, effect] = tail
  const effectClause =
    typeof addition === 'string' &&
    /^In addition to the benefits of the [\p{L} '’-]+ \{@classFeature ([^{}]+)\} feature, when you cast \{@spell ([^|#{}]+\|[^|#{}]+)\}, the \{@b [\p{L} '’-]+\} can be ([\p{L}-]+)\. (?:A|An|The) \3 [\p{L}-]+ deals [\p{L}-]+ damage with its [A-Z][\p{L}'’-]+(?: [A-Z][\p{L}'’-]+)* action and has this \{@variantrule Bonus Action\|XPHB\}:$/u.exec(
      addition,
    )
  return (
    !!effectClause &&
    tail.length === 2 &&
    hasClassFeatureTagTarget(effectClause[1]) &&
    getSpellReferenceKey(effectClause[2]) === getSpellReferenceKey(reference) &&
    isIndependentMovementEffect(effect)
  )
}

/** Verify both the selected class schedule and its unique exact direct feature for a one-use grant. */
function getSlotFreePreparedGrants(
  character: Character,
  entry: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs,
): ClassPreparedSpellGrant[] {
  const cls = getCurrentSelectedClass(character, entry, catalogs)
  const schedule = cls && getPreparedSchedule(cls)
  if (!cls || !schedule || !permitsClassRuleSource(character, 'XPHB')) return []
  return Object.entries(schedule).flatMap(([rawLevel, row]) => {
    if (!/^(?:[1-9]|1[0-9]|20)$/.test(rawLevel)) return []
    const level = Number(rawLevel)
    if (
      level > entry.levels ||
      Object.keys(schedule).filter((key) => Number(key) === level).length !== 1
    )
      return []
    const use = record(row)
    const daily = record(use.daily)
    const items = daily['1']
    if (
      Object.keys(use).length !== 1 ||
      Object.keys(daily).length !== 1 ||
      !Array.isArray(items) ||
      items.length !== 1 ||
      typeof items[0] !== 'string' ||
      !/^[^|#{}]+\|[^|#{}]+$/.test(items[0]) ||
      !items[0].split('|').every((part) => part.trim())
    )
      return []
    const [reference] = items
    const features = (cls.classFeatureRefs ?? []).flatMap((ref) => {
      const declaration = decodeOptionalDeclaration(ref.ref, 'classFeature')
      if (declaration?.decoded.level !== level) return []
      const current = getEarnedDirectClassFeature(
        character,
        entry,
        catalogs,
        declaration.target,
        (feature) => confirmsSlotFreePreparation(feature, reference),
      )
      return current ? [current] : []
    })
    if (features.length !== 1) return []
    const [{ feature, target }] = features
    return [
      {
        owner: ['class', norm(entry.name), norm(entry.source)],
        target,
        featureName: feature.name,
        level,
        reference,
        spellLevel: 'leveled',
        castingNote: `${feature.name} (${entry.name} · ${entry.source}) — Cast this spell once without expending a spell slot. Regain this use when you finish a Long Rest.`,
      },
    ]
  })
}

function getRangerGrant(
  cls: Class5e,
  catalogs: ClassChoiceFeatureCatalogs,
  character: Character,
): ClassPreparedSpellGrant | undefined {
  const projected = catalogs.classFeatures.filter(
    (row) => getClassFeatureIdentity(row) === favoredEnemy,
  )
  if (
    !cls.classFeatures?.some(
      (row) =>
        typeof row === 'string' &&
        decodeOptionalDeclaration(row, 'classFeature')?.target === favoredEnemy,
    ) ||
    catalogs.ambiguousClassFeatureTargets?.has(favoredEnemy) ||
    projected.length !== 1 ||
    projected[0].sourceIdentityConflict ||
    !getCurrentDirectClassFeature(cls, catalogs, favoredEnemy)
  )
    return undefined
  const feature = projected[0]
  const firstLine = feature.entries?.[0]
  const reference =
    typeof firstLine === 'string'
      ? /^You always have the \{@spell ([^|#{}]+\|[^|#{}]+)\} spell prepared\./i.exec(
          firstLine,
        )?.[1]
      : undefined
  if (!reference || getSpellReferenceKey(reference) !== huntersMark) return undefined
  const capstone = getCurrentRangerFeatures(character, catalogs)?.base('Foe Slayer')
  const die = capstone?.entries[0]
  const change =
    typeof die === 'string' &&
    /^The damage die of your Hunter's Mark is a \{@damage (d[1-9]\d*)\} rather than a \{@damage d[1-9]\d*\}\.$/.exec(
      die,
    )
  return {
    owner: ['class', 'ranger', 'xphb'],
    target: favoredEnemy,
    featureName: feature.name,
    level: 1,
    reference,
    spellLevel: 1,
    ...(capstone?.entries.length === 1 &&
      change && { castingNote: `Foe Slayer: Use a ${change[1]} for Hunter's Mark damage.` }),
  }
}

function matchesPreparedSchedule(
  schedule: NonNullable<AdditionalSpellBlock['prepared']>,
  level: number,
  reference: string,
) {
  const token = schedule[String(level)]
  return (
    Array.isArray(token) &&
    token.length === 1 &&
    typeof token[0] === 'string' &&
    /^[^|#{}]+\|[^|#{}]+$/.test(token[0]) &&
    getSpellReferenceKey(token[0]) === getSpellReferenceKey(reference) &&
    Object.keys(schedule).filter((key) => Number(key) === level).length === 1
  )
}

function inheritedPreparedGrants(
  character: Character,
  entry: CharacterClassEntry,
  catalogs: ClassChoiceFeatureCatalogs,
  schedule: NonNullable<AdditionalSpellBlock['prepared']>,
): ClassPreparedSpellGrant[] {
  const owner = ['class', norm(entry.name), norm(entry.source)] as const
  const grants: ClassPreparedSpellGrant[] = []
  const add = (
    target: string,
    reference: string,
    level: number,
    spellLevel: number,
    digest?: string,
  ) => {
    if (!matchesPreparedSchedule(schedule, level, reference)) return
    const current = getEarnedDirectClassFeature(character, entry, catalogs, target, (row) => {
      if (digest)
        return (
          hasFeatureSourceShape(row, preparedFeatureFields) &&
          Array.isArray(row.entries) &&
          getFeatureSourceDigest(row.entries, false) === digest
        )
      return (
        row.entries?.some((line) => {
          const match =
            typeof line === 'string' &&
            /^You always have the \{@spell ([^|#{}]+\|[^|#{}]+)\} spell prepared\./i.exec(line)
          return !!match && getSpellReferenceKey(match[1]) === getSpellReferenceKey(reference)
        }) === true
      )
    })
    if (current)
      grants.push({
        owner: [...owner],
        target,
        featureName: current.feature.name,
        level,
        reference,
        spellLevel,
      })
  }
  add(favoredEnemy, huntersMark, 1, 1)
  for (const [name, level, reference, spellLevel, digest] of paladinSpells)
    add(
      `class-feature|${norm(name)}|paladin|xphb|${level}|xphb`,
      reference,
      level,
      spellLevel,
      digest,
    )
  const template = getCurrentFixedClassFeatureRule(druidic, catalogs)
  if (
    template?.alwaysPreparedSpell &&
    matchesPreparedSchedule(schedule, template.level, template.alwaysPreparedSpell)
  ) {
    const current = getEarnedDirectClassFeature(character, entry, catalogs, druidic)
    if (current)
      grants.push({
        owner: [...owner],
        target: druidic,
        featureName: current.feature.name,
        level: template.level,
        reference: template.alwaysPreparedSpell,
        spellLevel: 1,
      })
  }
  return grants
}

function getEldritchHexGrant(
  character: Character,
  entry: CharacterClassEntry,
  cls: Class5e | undefined,
  catalogs: ClassChoiceFeatureCatalogs,
): ClassPreparedSpellGrant | undefined {
  const level = 10
  const patron = getNativeEldritchHexOwner(entry)
  if (
    !patron ||
    !Number.isInteger(entry.levels) ||
    entry.levels < level ||
    entry.levels > 20 ||
    !getSourceCompatibility(warlock.source, character.originSystem ?? '2014').compatible
  )
    return undefined

  const grant: ClassPreparedSpellGrant = {
    owner: ['subclass', warlock.name, warlock.source, norm(patron.name), patron.source],
    target: ELDRITCH_HEX_TARGET,
    featureName: 'Eldritch Hex',
    level,
    reference: ELDRITCH_HEX_REFERENCE,
    spellLevel: 1,
  }
  const unavailable = {
    ...grant,
    sourceReason: 'Restore the exact Eldritch Hex feature and its patron spell schedule.',
  }
  const current = cls && getCurrentNativeWarlockPatronRules(cls, entry, catalogs)
  const feature = current?.getDirectFeature(ELDRITCH_HEX_TARGET, ELDRITCH_HEX_RULE_DIGEST)
  const blocks = current?.subclass.additionalSpells as AdditionalSpellBlock[] | undefined
  const block = Array.isArray(blocks) && blocks.length === 1 ? blocks[0] : undefined
  const innate = block?.innate
  if (
    !feature ||
    !block ||
    Object.keys(block).some((key) => key !== 'innate' && key !== 'prepared') ||
    !innate ||
    typeof innate !== 'object' ||
    Array.isArray(innate) ||
    Object.keys(innate).length !== 1 ||
    !matchesPreparedSchedule(innate, level, grant.reference)
  )
    return unavailable

  // The certified feature supplies preparation semantics for this direct innate schedule.
  const [spell] = parseAdditionalSpellBlocks([{ innate }])[0].grants
  return spell?.source === 'innate' &&
    spell.level === level &&
    !spell.isCantrip &&
    getSpellReferenceKey(spell.spellName) === getSpellReferenceKey(grant.reference)
    ? { ...grant, featureName: feature.name }
    : unavailable
}

function getContactPatronGrant(
  cls: Class5e,
  catalogs: ClassChoiceFeatureCatalogs,
  schedule: AdditionalSpellBlock['prepared'],
): ClassPreparedSpellGrant {
  const grant: ClassPreparedSpellGrant = {
    owner: ['class', warlock.name, warlock.source],
    target: CONTACT_PATRON_TARGET,
    featureName: 'Contact Patron',
    level: 9,
    reference: 'Contact Other Plane|XPHB',
    spellLevel: 5,
  }
  const unavailable = {
    ...grant,
    sourceReason: 'Restore the exact Contact Patron feature and its class spell schedule.',
  }
  if (
    '_copy' in cls ||
    !Array.isArray(cls.classFeatures) ||
    !Array.isArray(cls.classFeatureRefs) ||
    catalogs.ambiguousClassFeatureTargets?.has(CONTACT_PATRON_TARGET) ||
    !schedule ||
    Object.keys(schedule).length !== 1 ||
    !matchesPreparedSchedule(schedule, grant.level, grant.reference)
  )
    return unavailable
  const feature = getCurrentDirectClassFeature(
    cls,
    catalogs,
    CONTACT_PATRON_TARGET,
    (row) =>
      norm(row.classSource) === warlock.source &&
      norm(row.source) === warlock.source &&
      hasFeatureSourceShape(row, preparedFeatureFields) &&
      Array.isArray(row.entries) &&
      getFeatureSourceDigest(row.entries, false) ===
        '19a5a473be57a9c39ffc09954797030d2bff39b7b5629ef34db45897b782f29a',
  )
  const [preparation, recovery] = feature?.entries ?? []
  const [, reference, casting] =
    typeof preparation === 'string'
      ? (preparation.match(
          /\{@spell ([^|#{}]+\|[^|#{}]+)\} spell prepared\. (With this feature, .+)$/,
        ) ?? [])
      : []
  return feature &&
    reference &&
    getSpellReferenceKey(reference) === getSpellReferenceKey(grant.reference) &&
    casting &&
    typeof recovery === 'string'
    ? {
        ...grant,
        featureName: feature.name,
        reference,
        castingNote: `${feature.name}: ${casting} ${stripItemTag(recovery)}`,
      }
    : unavailable
}

/** A current certified feature must corroborate its own gain in the owner's spell schedule. */
export function getDirectClassPreparedSpellGrants(
  character: Character,
  classes: readonly Class5e[],
  catalogs?: ClassChoiceFeatureCatalogs,
): ClassPreparedSpellGrant[] {
  if (!catalogs) return []
  return character.classProgression.flatMap((entry) => {
    if (character.classProgression.filter((row) => findClassReference(entry, [row])).length !== 1)
      return []
    const cls = findClassReference(entry, classes)
    const hex = getEldritchHexGrant(character, entry, cls, catalogs)
    if (!cls) return hex ? [hex] : []
    const schedule = getPreparedSchedule(cls)
    const slotFree =
      schedule && Object.values(schedule).some((row) => record(row).daily !== undefined)
        ? getSlotFreePreparedGrants(character, entry, catalogs)
        : []
    if (norm(cls.name) === 'bard' && norm(cls.source) === 'xphb' && entry.levels === 20) {
      const current = hasCurrentBardWordsOfCreation(cls, catalogs)
      const words = ['Power Word Heal|XPHB', 'Power Word Kill|XPHB'].map(
        (reference): ClassPreparedSpellGrant => ({
          owner: ['class', 'bard', 'xphb'],
          target: WORDS_OF_CREATION_TARGET,
          featureName: 'Words of Creation',
          level: 20,
          spellLevel: 9,
          reference,
          ...(current
            ? {
                castingNote:
                  'Words of Creation: You can target a second creature within 10 feet of the first.',
              }
            : {
                sourceReason:
                  'Restore the exact Words of Creation feature and class spell schedule.',
              }),
        }),
      )
      return [...words, ...slotFree]
    }
    if (findClassReference(warlock, [cls]))
      return [
        ...(entry.levels >= 9 ? [getContactPatronGrant(cls, catalogs, schedule)] : []),
        ...(hex ? [hex] : []),
        ...slotFree,
      ]
    if (!schedule || !Array.isArray(cls.classFeatures) || !Array.isArray(cls.classFeatureRefs))
      return []

    let grants: ClassPreparedSpellGrant[]
    if (findClassReference(ranger, [cls])) {
      const grant =
        entry.levels >= 1 &&
        Object.keys(schedule).length === 1 &&
        getRangerGrant(cls, catalogs, character)
      grants = grant ? [grant] : []
    } else if (findClassReference(paladin, [cls])) {
      grants = paladinSpells.flatMap(([featureName, level, reference, spellLevel, digest]) => {
        if (entry.levels < level) return []
        const target = `class-feature|${featureName.toLowerCase()}|paladin|xphb|${level}|xphb`
        if (catalogs.ambiguousClassFeatureTargets?.has(target)) return []
        const feature = getCurrentDirectClassFeature(
          cls,
          catalogs,
          target,
          (row) =>
            norm(row.classSource) === paladin.source &&
            norm(row.source) === paladin.source &&
            hasFeatureSourceShape(row, preparedFeatureFields) &&
            Array.isArray(row.entries) &&
            getFeatureSourceDigest(row.entries, false) === digest,
        )
        return feature
          ? [
              {
                owner: ['class', 'paladin', 'xphb'],
                target,
                featureName,
                level,
                reference,
                spellLevel,
              },
            ]
          : []
      })
    } else {
      grants = getCurrentDirectFixedClassRules(cls, catalogs).flatMap((rule) => {
        if (!rule.alwaysPreparedSpell || entry.levels < rule.level) return []
        return [
          {
            owner: ['class', rule.className.toLowerCase(), rule.classSource.toLowerCase()],
            target: rule.target,
            featureName: rule.name,
            level: rule.level,
            reference: rule.alwaysPreparedSpell,
            spellLevel: 1,
          },
        ]
      })
    }

    // Other scheduled gains require their own corroborating feature.
    const current = grants.filter(({ level, reference }) =>
      matchesPreparedSchedule(schedule, level, reference),
    )
    if (
      findClassReference(ranger, [cls]) ||
      findClassReference(paladin, [cls]) ||
      (norm(cls.name) === 'druid' && norm(cls.source) === 'xphb')
    )
      return [...current, ...slotFree]
    return [
      ...current,
      ...inheritedPreparedGrants(character, entry, catalogs, schedule),
      ...slotFree,
    ]
  })
}
