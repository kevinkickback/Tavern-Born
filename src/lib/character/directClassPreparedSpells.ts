import { getClassFeatureIdentity } from '@/lib/5etools/classFeatureIdentity'
import { findClassReference } from '@/lib/5etools/classReference'
import { getCurrentDirectClassFeature } from '@/lib/5etools/directClassFeatureSource'
import { getCurrentDirectFixedClassRules } from '@/lib/5etools/directFixedProficiencySource'
import { getFeatureSourceDigest, hasFeatureSourceShape } from '@/lib/5etools/featureSourceAudit'
import { decodeOptionalDeclaration } from '@/lib/5etools/optionalClassDeclarationStructure'
import { getSpellReferenceKey } from '@/lib/calculations/spellIdentity'
import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e } from '@/types/5etools'
import type { AdditionalSpellBlock } from '@/types/additionalSpells'
import type { Character } from '@/types/character'
import type { ClassChoiceFeatureCatalogs } from './classChoiceFeatureCatalogs'
import type { ClassFixedSpellGrant } from './optionalClassFixedSpells'

const paladin = { name: 'paladin', source: 'xphb' }
const ranger = { name: 'ranger', source: 'xphb' }
const favoredEnemy = 'class-feature|favored enemy|ranger|xphb|1|xphb'
const huntersMark = "hunter's mark|xphb"
const paladinFeatureFields = new Set([
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

type ClassPreparedSpellGrant = ClassFixedSpellGrant & { spellLevel: number }

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
      !Array.isArray(cls.classFeatures) ||
      !Array.isArray(cls.classFeatureRefs) ||
      character.classProgression.filter((row) => findClassReference(entry, [row])).length !== 1
    )
      return []
    const blocks = cls.additionalSpells as AdditionalSpellBlock[] | undefined
    const block = Array.isArray(blocks) && blocks.length === 1 ? blocks[0] : undefined
    const schedule = block?.prepared
    if (
      !block ||
      Object.keys(block).length !== 1 ||
      !schedule ||
      typeof schedule !== 'object' ||
      Array.isArray(schedule)
    )
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
            hasFeatureSourceShape(row, paladinFeatureFields) &&
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
    return grants.filter(({ level, reference }) => {
      const token = schedule[String(level)]
      return (
        Object.keys(schedule).filter((key) => Number(key) === level).length === 1 &&
        Array.isArray(token) &&
        token.length === 1 &&
        typeof token[0] === 'string' &&
        /^[^|#{}]+\|[^|#{}]+$/.test(token[0]) &&
        getSpellReferenceKey(token[0]) === getSpellReferenceKey(reference)
      )
    })
  })
}
