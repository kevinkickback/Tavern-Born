import { getClassFeatureIdentity } from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { getCurrentDirectClassFeature } from '@/lib/5etools/directClassFeatureSource'
import { getCurrentDirectFixedClassRules } from '@/lib/5etools/directFixedProficiencySource'
import { getFeatureSourceDigest, hasFeatureSourceShape } from '@/lib/5etools/featureSourceAudit'
import { decodeOptionalDeclaration } from '@/lib/5etools/optionalClassDeclarationStructure'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm, stripItemTag } from '@/lib/provenance/normalization'
import type { Class5e } from '@/types/5etools'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import type { Character } from '@/types/character'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import type { ClassFixedSpellGrant } from './optionalClassFixedSpells'

const paladin = { name: 'paladin', source: 'xphb' }
const ranger = { name: 'ranger', source: 'xphb' }
const warlock = { name: 'warlock', source: 'xphb' }
export const CONTACT_PATRON_TARGET = 'class-feature|contact patron|warlock|xphb|9|xphb'
const favoredEnemy = 'class-feature|favored enemy|ranger|xphb|1|xphb'
const huntersMark = "hunter's mark|xphb"
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
  spellLevel: number
  castingNote?: string
  sourceReason?: string
}

function getRangerGrant(
  cls: Class5e,
  catalogs: ClassChoiceFeatureCatalogs,
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
  if (reference && getSpellReferenceKey(reference) === huntersMark)
    return {
      owner: ['class', 'ranger', 'xphb'],
      target: favoredEnemy,
      featureName: feature.name,
      level: 1,
      reference,
      spellLevel: 1,
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

/** A current certified feature must corroborate its own gain in the class spell schedule. */
export function getDirectClassPreparedSpellGrants(
  character: Character,
  classes: readonly Class5e[],
  catalogs?: ClassChoiceFeatureCatalogs,
): ClassPreparedSpellGrant[] {
  if (!catalogs) return []
  return character.classProgression.flatMap((entry) => {
    const cls = findClassReference(entry, classes)
    if (
      !cls ||
      character.classProgression.filter((row) => findClassReference(entry, [row])).length !== 1
    )
      return []
    const blocks = cls.additionalSpells as AdditionalSpellBlock[] | undefined
    const block = Array.isArray(blocks) && blocks.length === 1 ? blocks[0] : undefined
    const prepared = block?.prepared
    const schedule =
      block &&
      Object.keys(block).length === 1 &&
      prepared &&
      typeof prepared === 'object' &&
      !Array.isArray(prepared)
        ? prepared
        : undefined
    if (findClassReference(warlock, [cls]))
      return entry.levels >= 9 ? [getContactPatronGrant(cls, catalogs, schedule)] : []
    if (!schedule || !Array.isArray(cls.classFeatures) || !Array.isArray(cls.classFeatureRefs))
      return []

    let grants: ClassPreparedSpellGrant[]
    if (findClassReference(ranger, [cls])) {
      const grant =
        entry.levels >= 1 && Object.keys(schedule).length === 1 && getRangerGrant(cls, catalogs)
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
    return grants.filter(({ level, reference }) =>
      matchesPreparedSchedule(schedule, level, reference),
    )
  })
}
