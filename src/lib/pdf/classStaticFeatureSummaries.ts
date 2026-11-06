import { CLASSIC_WILD_SHAPE_RESOURCE_ID } from '@/lib/5etools/archdruidSource'
import { getLandStaticFeatures } from '@/lib/5etools/circleOfTheLand'
import { getClassResourceDefs } from '@/lib/5etools/classData'
import { findClassReference } from '@/lib/5etools/classReference'
import {
  formatClassResourceRecovery,
  getClassResourceRecoveryAtLevel,
} from '@/lib/5etools/classRuleNormalization'
import { getCurrentDirectClassFeature } from '@/lib/5etools/directClassFeatureSource'
import {
  getCurrentNativeSorcerer,
  getDragonCompanion,
  getInnateSorcery,
  getInnateSorceryUpgrades,
} from '@/lib/5etools/sorcererSource'
import type { ClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import { renderEntriesToText } from '@/lib/entryText'
import type { Class5e, ClassFeature } from '@/types/5etools'
import type { Character, CharacterClassEntry, Feature } from '@/types/character'

export interface ClassStaticFeatureSummary {
  text: string
  compactText: string
  replaces?: Feature
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

function savedClassLabel(character: Character, entry: CharacterClassEntry, feature: ClassFeature) {
  const source = entry.source.trim().toLowerCase()
  const tags = character.provenance?.features[feature.name.trim().toLowerCase()]
  const tag = tags?.[0]
  if (
    tags?.length !== 1 ||
    tag?.sourceType !== 'class' ||
    tag.grantType !== 'fixed' ||
    tag.grantVariant ||
    (tag.grantSource && tag.grantSource.trim().toLowerCase() !== source) ||
    !findClassReference(entry, [{ name: tag.sourceName, source: tag.sourceRef }])
  )
    return undefined
  const labels = character.features.filter(
    (row) => row.level === feature.level && findClassReference(feature, [row]),
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
      const companion = featureSummary(getDragonCompanion(sorcerer))
      const innate = getInnateSorcery(sorcerer)
      if (!innate) return companion
      const activation = renderEntriesToText(innate.entries?.slice(0, -1))
      return [
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
      ]
    }
    const name = entry.name.trim().toLowerCase()
    const source = entry.source.trim().toLowerCase()
    if (
      (name !== 'druid' && name !== 'wizard') ||
      (source !== 'phb' && source !== 'xphb') ||
      progression.filter((owner) => findClassReference(entry, [owner])).length !== 1
    )
      return []
    const classes = catalogs.classes?.filter((cls) => findClassReference(entry, [cls]))
    if (classes?.length !== 1 || classes[0].sourceIdentityConflict) return []
    const cls = classes[0]
    if (name === 'wizard') {
      if (!Number.isInteger(entry.levels) || entry.levels < 1) return []
      const feature = getCurrentDirectClassFeature(
        cls,
        catalogs,
        `class-feature|arcane recovery|wizard|${source}|1|${source}`,
      )
      if (!feature) return []
      const [summary] = featureSummary(feature)
      if (!summary) return []
      const replaces = savedClassLabel(character, entry, feature)
      return [replaces ? { ...summary, replaces } : summary]
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
    return [...(shape ? [shape] : []), ...landSummaries]
  })
}
