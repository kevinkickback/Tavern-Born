import type { Class5e, ClassFeatureReference, OptFeatureProg } from '@/types/5etools'

export type NormalizedCharacterChoiceKind =
  | 'class-feature'
  | 'fighting-style'
  | 'metamagic'
  | 'optional-feature'
  | 'weapon-mastery'

export type ChoiceOptionEntityType = 'classFeature' | 'feat' | 'item' | 'optionalFeature'

export interface NormalizedChoiceOptionReference {
  entityType: ChoiceOptionEntityType
  name: string
  source?: string
}

export interface NormalizedChoiceOptionFilter {
  entityType: ChoiceOptionEntityType
  categories?: string[]
  featureTypes?: string[]
  itemTypes?: string[]
  source?: string
}

export interface NormalizedCharacterChoice {
  id: string
  label: string
  kind: NormalizedCharacterChoiceKind
  owner: {
    type: 'class'
    name: string
    source: string
    featureName?: string
    featureSource?: string
  }
  /** First class level at which this choice exists. */
  level: number
  minimumSelections: number
  maximumSelections: number
  /** Required total at class levels 1–20. */
  selectionCountByLevel: readonly number[]
  options: NormalizedChoiceOptionReference[]
  optionFilter?: NormalizedChoiceOptionFilter
  repeatable: boolean
  replacement: {
    cadence: 'never' | 'class-level' | 'long-rest'
    maximumPerEvent?: number | 'all'
  }
  source: {
    kind: 'class-feature-options' | 'class-table' | 'optional-feature-progression'
    field: string
  }
}

export interface ClassChoiceDiagnostic {
  code: 'invalid-count' | 'unresolved-options'
  className: string
  classSource: string
  featureName: string
  level?: number
  message: string
}

interface ParsedFilterTag {
  label: string
  entityType: ChoiceOptionEntityType
  filter: NormalizedChoiceOptionFilter
}

interface ChoiceNormalizationResult {
  choices: NormalizedCharacterChoice[]
  diagnostics: ClassChoiceDiagnostic[]
}

const LEVEL_COUNT = 20

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

function normalizedIdPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function buildChoiceId(classData: Pick<Class5e, 'name' | 'source'>, label: string, level: number) {
  return `class:${normalizedIdPart(classData.name)}|${normalizedIdPart(classData.source)}|choice:${normalizedIdPart(label)}|${level}`
}

function getReferenceLevel(ref: ClassFeatureReference): number | undefined {
  const encodedLevel = Number.parseInt(
    typeof ref.ref === 'string' ? (ref.ref.split('|')[3] ?? '') : '',
    10,
  )
  return Number.isNaN(encodedLevel) ? (ref.level ?? ref.feature?.level) : encodedLevel
}

function countsFromLevel(level: number, count: number): number[] {
  return Array.from({ length: LEVEL_COUNT }, (_, index) => (index + 1 >= level ? count : 0))
}

function normalizeProgression(progression: OptFeatureProg['progression']): number[] {
  if (Array.isArray(progression)) {
    return Array.from({ length: LEVEL_COUNT }, (_, index) => {
      const value = progression[index]
      return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.trunc(value))
        : 0
    })
  }

  let current = 0
  return Array.from({ length: LEVEL_COUNT }, (_, index) => {
    const raw = progression[String(index + 1)]
    if (typeof raw === 'number' && Number.isFinite(raw)) current = Math.max(0, Math.trunc(raw))
    return current
  })
}

function parseClassFeatureReference(
  value: string,
  fallbackSource: string,
): NormalizedChoiceOptionReference | undefined {
  const parts = value.split('|')
  const name = parts[0]?.trim()
  if (!name) return undefined
  return {
    entityType: 'classFeature',
    name,
    source: parts[4]?.trim() || parts[2]?.trim() || fallbackSource,
  }
}

function getOptionReference(
  value: unknown,
  fallbackSource: string,
): NormalizedChoiceOptionReference | undefined {
  const entry = asRecord(value)
  if (!entry) return undefined
  if (typeof entry.classFeature === 'string') {
    return parseClassFeatureReference(entry.classFeature, fallbackSource)
  }
  if (typeof entry.name === 'string' && entry.name.trim()) {
    return {
      entityType: 'classFeature',
      name: entry.name.trim(),
      source: typeof entry.source === 'string' ? entry.source : fallbackSource,
    }
  }
  return undefined
}

function collectOptionBlocks(value: unknown, blocks: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectOptionBlocks(entry, blocks)
    return
  }
  const object = asRecord(value)
  if (!object) return
  if (object.type === 'options') blocks.push(object)
  if (Array.isArray(object.entries)) collectOptionBlocks(object.entries, blocks)
}

function getFeatureText(ref: ClassFeatureReference): string {
  try {
    return JSON.stringify(ref.feature?.entries ?? '')
  } catch {
    return ''
  }
}

function inferChoiceKind(featureName: string): NormalizedCharacterChoiceKind {
  if (/fighting style/i.test(featureName)) return 'fighting-style'
  if (/metamagic/i.test(featureName)) return 'metamagic'
  return 'class-feature'
}

function inferReplacement(
  text: string,
  fallback: NormalizedCharacterChoice['replacement'],
): NormalizedCharacterChoice['replacement'] {
  if (/finish (?:a|the) long rest/i.test(text) && /change|replace/i.test(text)) {
    return {
      cadence: 'long-rest',
      maximumPerEvent: /change one|replace one/i.test(text) ? 1 : 'all',
    }
  }
  if (/gain (?:a|another) [^.]*(?:class|fighter|sorcerer|warlock) level/i.test(text)) {
    return {
      cadence: 'class-level',
      maximumPerEvent: /replace one|change one/i.test(text) ? 1 : 'all',
    }
  }
  return fallback
}

function parseFilterTags(text: string): ParsedFilterTag[] {
  const tags: ParsedFilterTag[] = []
  const regex = /\{@filter\s+([^|}]+)\|([^|}]+)\|([^}]+)}/gi
  for (const match of text.matchAll(regex)) {
    const label = match[1]?.trim() ?? ''
    const collection = match[2]?.trim().toLowerCase()
    const clauses = (match[3] ?? '').split('|')
    const entityType =
      collection === 'feats'
        ? 'feat'
        : collection === 'items'
          ? 'item'
          : collection === 'optionalfeatures'
            ? 'optionalFeature'
            : undefined
    if (!entityType) continue

    const filter: NormalizedChoiceOptionFilter = { entityType }
    for (const clause of clauses) {
      const separator = clause.indexOf('=')
      if (separator < 0) continue
      const key = clause.slice(0, separator).trim().toLowerCase()
      const values = clause
        .slice(separator + 1)
        .split(';')
        .map((value) => value.trim())
        .filter(Boolean)
      if (key === 'category') filter.categories = values
      else if (key === 'feature type') filter.featureTypes = values
      else if (key === 'type') filter.itemTypes = values
      else if (key === 'source') filter.source = values[0]
    }
    tags.push({ label, entityType, filter })
  }
  return tags
}

function normalizeFeatureOptionChoices(
  classData: Pick<Class5e, 'name' | 'source'>,
  refs: readonly ClassFeatureReference[],
): ChoiceNormalizationResult {
  const choices: NormalizedCharacterChoice[] = []
  const diagnostics: ClassChoiceDiagnostic[] = []

  for (const ref of refs) {
    const level = getReferenceLevel(ref)
    const feature = ref.feature
    if (!level || !feature) continue
    const blocks: Record<string, unknown>[] = []
    collectOptionBlocks(feature.entries ?? [], blocks)

    blocks.forEach((block, blockIndex) => {
      const rawCount = block.count
      const knownImplicitSingleChoice = /fighting style/i.test(ref.name)
      const count =
        typeof rawCount === 'number' && Number.isFinite(rawCount) && rawCount > 0
          ? Math.trunc(rawCount)
          : knownImplicitSingleChoice
            ? 1
            : undefined
      if (!count) {
        diagnostics.push({
          code: 'invalid-count',
          className: classData.name,
          classSource: classData.source,
          featureName: ref.name,
          level,
          message: `Option block ${blockIndex + 1} has no safe positive selection count.`,
        })
        return
      }
      const options = Array.isArray(block.entries)
        ? block.entries.flatMap((entry) => {
            const option = getOptionReference(entry, feature.source || classData.source)
            return option ? [option] : []
          })
        : []
      if (options.length === 0) {
        diagnostics.push({
          code: 'unresolved-options',
          className: classData.name,
          classSource: classData.source,
          featureName: ref.name,
          level,
          message: `Option block ${blockIndex + 1} has no source-qualified option references.`,
        })
        return
      }

      const label = blocks.length > 1 ? `${ref.name} ${blockIndex + 1}` : ref.name
      choices.push({
        id: buildChoiceId(classData, label, level),
        label,
        kind: inferChoiceKind(ref.name),
        owner: {
          type: 'class',
          name: classData.name,
          source: classData.source,
          featureName: ref.name,
          featureSource: feature.source || ref.source || classData.source,
        },
        level,
        minimumSelections: count,
        maximumSelections: count,
        selectionCountByLevel: countsFromLevel(level, count),
        options,
        repeatable: false,
        replacement: inferReplacement(getFeatureText(ref), { cadence: 'never' }),
        source: {
          kind: 'class-feature-options',
          field: `classFeatureRefs:${ref.ref || ref.name}:entries`,
        },
      })
    })
  }
  return { choices, diagnostics }
}

function normalizeOptionalFeatureProgressions(
  classData: Pick<Class5e, 'name' | 'source' | 'optionalfeatureProgression'>,
  refs: readonly ClassFeatureReference[],
): NormalizedCharacterChoice[] {
  return (classData.optionalfeatureProgression ?? []).flatMap((progression, index) => {
    const counts = normalizeProgression(progression.progression)
    const levelIndex = counts.findIndex((count) => count > 0)
    if (levelIndex < 0) return []
    const maximumSelections = Math.max(...counts)
    const featureRef = refs.find((ref) =>
      progression.featureType.some((type) =>
        getFeatureText(ref).toLowerCase().includes(`feature type=${type.toLowerCase()}`),
      ),
    )
    const kind = progression.featureType.includes('MM') ? 'metamagic' : 'optional-feature'
    return [
      {
        id: buildChoiceId(classData, progression.name, levelIndex + 1),
        label: progression.name,
        kind,
        owner: {
          type: 'class' as const,
          name: classData.name,
          source: classData.source,
          featureName: featureRef?.name ?? progression.name,
          featureSource: featureRef?.source ?? classData.source,
        },
        level: levelIndex + 1,
        minimumSelections: maximumSelections,
        maximumSelections,
        selectionCountByLevel: counts,
        options: [],
        optionFilter: {
          entityType: 'optionalFeature' as const,
          featureTypes: [...progression.featureType],
        },
        repeatable: false,
        replacement: inferReplacement(featureRef ? getFeatureText(featureRef) : '', {
          cadence: 'class-level' as const,
          maximumPerEvent: 1,
        }),
        source: {
          kind: 'optional-feature-progression' as const,
          field: `optionalfeatureProgression[${index}]`,
        },
      },
    ]
  })
}

function normalizeWeaponMasteryChoice(
  classData: Pick<Class5e, 'name' | 'source' | 'classTableGroups'>,
  refs: readonly ClassFeatureReference[],
): NormalizedCharacterChoice[] {
  const featureRef = refs.find((ref) => /weapon mastery/i.test(ref.name))
  if (!featureRef) return []
  for (const [groupIndex, rawGroup] of (classData.classTableGroups ?? []).entries()) {
    const group = asRecord(rawGroup)
    const labels = Array.isArray(group?.colLabels) ? group.colLabels : []
    const columnIndex = labels.findIndex(
      (label) => typeof label === 'string' && label.trim().toLowerCase() === 'weapon mastery',
    )
    if (columnIndex < 0 || !Array.isArray(group?.rows)) continue
    const rows = group.rows
    const counts = Array.from({ length: LEVEL_COUNT }, (_, index) => {
      const row = rows[index]
      if (!Array.isArray(row)) return 0
      const parsed = Number(row[columnIndex])
      return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
    })
    const firstLevelIndex = counts.findIndex((count) => count > 0)
    if (firstLevelIndex < 0) return []
    const text = getFeatureText(featureRef)
    const itemFilter = parseFilterTags(text).find((tag) => tag.entityType === 'item')?.filter ?? {
      entityType: 'item' as const,
    }
    const maximumSelections = Math.max(...counts)
    return [
      {
        id: buildChoiceId(classData, 'Weapon Mastery', firstLevelIndex + 1),
        label: 'Weapon Mastery',
        kind: 'weapon-mastery',
        owner: {
          type: 'class',
          name: classData.name,
          source: classData.source,
          featureName: featureRef.name,
          featureSource: featureRef.source ?? classData.source,
        },
        level: firstLevelIndex + 1,
        minimumSelections: maximumSelections,
        maximumSelections,
        selectionCountByLevel: counts,
        options: [],
        optionFilter: itemFilter,
        repeatable: false,
        replacement: inferReplacement(text, {
          cadence: 'long-rest',
          maximumPerEvent: 'all',
        }),
        source: {
          kind: 'class-table',
          field: `classTableGroups[${groupIndex}].rows[].[${columnIndex}]`,
        },
      },
    ]
  }
  return []
}

function normalizeFightingStyleFilterChoices(
  classData: Pick<Class5e, 'name' | 'source'>,
  refs: readonly ClassFeatureReference[],
  existing: readonly NormalizedCharacterChoice[],
): NormalizedCharacterChoice[] {
  return refs.flatMap((ref) => {
    const level = getReferenceLevel(ref)
    if (!level || !/fighting style/i.test(ref.name)) return []
    if (
      existing.some((choice) => choice.owner.featureName === ref.name && choice.level === level)
    ) {
      return []
    }
    const filterTag = parseFilterTags(getFeatureText(ref)).find(
      (tag) => tag.entityType === 'feat' || tag.entityType === 'optionalFeature',
    )
    if (!filterTag) return []
    return [
      {
        id: buildChoiceId(classData, ref.name, level),
        label: ref.name,
        kind: 'fighting-style' as const,
        owner: {
          type: 'class' as const,
          name: classData.name,
          source: classData.source,
          featureName: ref.name,
          featureSource: ref.source ?? classData.source,
        },
        level,
        minimumSelections: 1,
        maximumSelections: 1,
        selectionCountByLevel: countsFromLevel(level, 1),
        options: [],
        optionFilter: filterTag.filter,
        repeatable: false,
        replacement: inferReplacement(getFeatureText(ref), {
          cadence: 'class-level' as const,
          maximumPerEvent: 1,
        }),
        source: {
          kind: 'class-feature-options' as const,
          field: `classFeatureRefs:${ref.ref || ref.name}:entries.filter`,
        },
      },
    ]
  })
}

/** Normalizes class-owned choice requirements without interpreting arbitrary prose. */
export function normalizeClassChoices(
  classData: Pick<Class5e, 'name' | 'source' | 'classTableGroups' | 'optionalfeatureProgression'>,
  refs: readonly ClassFeatureReference[],
): ChoiceNormalizationResult {
  const direct = normalizeFeatureOptionChoices(classData, refs)
  const progression = normalizeOptionalFeatureProgressions(classData, refs)
  const mastery = normalizeWeaponMasteryChoice(classData, refs)
  const accumulated = [...direct.choices, ...progression, ...mastery]
  const fightingStyles = normalizeFightingStyleFilterChoices(classData, refs, accumulated)
  const choices = [...accumulated, ...fightingStyles].sort(
    (left, right) => left.level - right.level || left.id.localeCompare(right.id),
  )
  return { choices, diagnostics: direct.diagnostics }
}

export function getRequiredChoiceSelectionCount(
  choice: NormalizedCharacterChoice,
  classLevel: number,
): number {
  if (classLevel <= 0) return 0
  return choice.selectionCountByLevel[Math.min(LEVEL_COUNT, classLevel) - 1] ?? 0
}
