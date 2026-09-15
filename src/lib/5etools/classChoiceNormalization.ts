import type { Class5e, ClassFeatureReference, OptFeatureProg } from '@/types/5etools'

export type NormalizedCharacterChoiceKind = 'class-feature' | 'feat' | 'item' | 'optional-feature'

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

function toSearchableText(text: string): string {
  return text
    .replace(/\{@[^\s}]+\s+([^|}]+)(?:\|[^}]*)?}/g, '$1')
    .replace(/[{}"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferReplacement(text: string): NormalizedCharacterChoice['replacement'] {
  const searchableText = toSearchableText(text)
  if (
    /finish (?:a|the) long rest/i.test(searchableText) &&
    /\b(?:change|replace)\b/i.test(searchableText)
  ) {
    return {
      cadence: 'long-rest',
      maximumPerEvent: /\b(?:change|replace) (?:one|a|an)\b/i.test(searchableText) ? 1 : 'all',
    }
  }
  if (
    /whenever you gain (?:a|an|another) [^.]{0,120}\blevel\b/i.test(searchableText) &&
    /\b(?:change|replace)\b/i.test(searchableText)
  ) {
    return {
      cadence: 'class-level',
      maximumPerEvent: /\b(?:change|replace) (?:one|a|an)\b/i.test(searchableText) ? 1 : 'all',
    }
  }
  return { cadence: 'never' }
}

function choiceKindForEntity(entityType: ChoiceOptionEntityType): NormalizedCharacterChoiceKind {
  if (entityType === 'classFeature') return 'class-feature'
  if (entityType === 'optionalFeature') return 'optional-feature'
  return entityType
}

function inferSingleFilteredChoice(text: string, label: string): boolean {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const searchableText = toSearchableText(text)
  return new RegExp(
    `\\b(?:gain|choose|select|learn|pick)\\s+(?:a|an|one)\\s+${escapedLabel}\\b`,
    'i',
  ).test(searchableText)
}

function mergeFilters(tags: readonly ParsedFilterTag[]): NormalizedChoiceOptionFilter | undefined {
  const entityType = tags[0]?.entityType
  if (!entityType || tags.some((tag) => tag.entityType !== entityType)) return undefined
  const distinct = (values: (string | undefined)[]) => [
    ...new Set(values.filter(Boolean) as string[]),
  ]
  const categories = distinct(tags.flatMap((tag) => tag.filter.categories ?? []))
  const featureTypes = distinct(tags.flatMap((tag) => tag.filter.featureTypes ?? []))
  const itemTypes = distinct(tags.flatMap((tag) => tag.filter.itemTypes ?? []))
  const sources = distinct(tags.map((tag) => tag.filter.source))
  return {
    entityType,
    ...(categories.length > 0 ? { categories } : {}),
    ...(featureTypes.length > 0 ? { featureTypes } : {}),
    ...(itemTypes.length > 0 ? { itemTypes } : {}),
    ...(sources.length === 1 ? { source: sources[0] } : {}),
  }
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
      const count =
        typeof rawCount === 'number' && Number.isFinite(rawCount) && rawCount > 0
          ? Math.trunc(rawCount)
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
        kind: 'class-feature',
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
        replacement: inferReplacement(getFeatureText(ref)),
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
    const featureRef = refs.find(
      (ref) =>
        ref.name.trim().toLowerCase() === progression.name.trim().toLowerCase() ||
        progression.featureType.some((type) =>
          getFeatureText(ref).toLowerCase().includes(`feature type=${type.toLowerCase()}`),
        ),
    )
    return [
      {
        id: buildChoiceId(classData, progression.name, levelIndex + 1),
        label: progression.name,
        kind: 'optional-feature' as const,
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
        replacement: inferReplacement(featureRef ? getFeatureText(featureRef) : ''),
        source: {
          kind: 'optional-feature-progression' as const,
          field: `optionalfeatureProgression[${index}]`,
        },
      },
    ]
  })
}

function normalizeTableBackedFilterChoices(
  classData: Pick<Class5e, 'name' | 'source' | 'classTableGroups'>,
  refs: readonly ClassFeatureReference[],
): NormalizedCharacterChoice[] {
  return refs.flatMap((featureRef) => {
    const text = getFeatureText(featureRef)
    const tags = parseFilterTags(text)
    const filter = mergeFilters(tags)
    if (!filter) return []

    for (const [groupIndex, rawGroup] of (classData.classTableGroups ?? []).entries()) {
      const group = asRecord(rawGroup)
      const labels = Array.isArray(group?.colLabels) ? group.colLabels : []
      const columnIndex = labels.findIndex(
        (label) =>
          typeof label === 'string' &&
          toSearchableText(label).toLowerCase() === featureRef.name.trim().toLowerCase(),
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
      const maximumSelections = Math.max(...counts)
      return [
        {
          id: buildChoiceId(classData, featureRef.name, firstLevelIndex + 1),
          label: featureRef.name,
          kind: choiceKindForEntity(filter.entityType),
          owner: {
            type: 'class' as const,
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
          optionFilter: filter,
          repeatable: false,
          replacement: inferReplacement(text),
          source: {
            kind: 'class-table' as const,
            field: `classTableGroups[${groupIndex}].rows[].[${columnIndex}]`,
          },
        },
      ]
    }
    return []
  })
}

function normalizeSingleFilterChoices(
  classData: Pick<Class5e, 'name' | 'source'>,
  refs: readonly ClassFeatureReference[],
  existing: readonly NormalizedCharacterChoice[],
): ChoiceNormalizationResult {
  const choices: NormalizedCharacterChoice[] = []
  const diagnostics: ClassChoiceDiagnostic[] = []
  for (const ref of refs) {
    const level = getReferenceLevel(ref)
    if (!level) continue
    if (
      existing.some((choice) => choice.owner.featureName === ref.name && choice.level === level)
    ) {
      continue
    }
    const text = getFeatureText(ref)
    const tags = parseFilterTags(text)
    const filter = mergeFilters(tags)
    if (!filter) continue
    const labels = [...new Set(tags.map((tag) => tag.label))]
    if (!labels.some((label) => inferSingleFilteredChoice(text, label))) {
      diagnostics.push({
        code: 'invalid-count',
        className: classData.name,
        classSource: classData.source,
        featureName: ref.name,
        level,
        message: 'Filtered choice has no safely parseable selection count or matching class table.',
      })
      continue
    }
    choices.push({
      id: buildChoiceId(classData, ref.name, level),
      label: ref.name,
      kind: choiceKindForEntity(filter.entityType),
      owner: {
        type: 'class',
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
      optionFilter: filter,
      repeatable: false,
      replacement: inferReplacement(text),
      source: {
        kind: 'class-feature-options',
        field: `classFeatureRefs:${ref.ref || ref.name}:entries.filter`,
      },
    })
  }
  return { choices, diagnostics }
}

/** Normalizes class-owned choice requirements with data-shape rules shared by every class. */
export function normalizeClassChoices(
  classData: Pick<Class5e, 'name' | 'source' | 'classTableGroups' | 'optionalfeatureProgression'>,
  refs: readonly ClassFeatureReference[],
): ChoiceNormalizationResult {
  const direct = normalizeFeatureOptionChoices(classData, refs)
  const progression = normalizeOptionalFeatureProgressions(classData, refs)
  const tableBacked = normalizeTableBackedFilterChoices(classData, refs)
  const accumulated = [...direct.choices, ...progression, ...tableBacked]
  const singleFilters = normalizeSingleFilterChoices(classData, refs, accumulated)
  const choices = [...accumulated, ...singleFilters.choices].sort(
    (left, right) => left.level - right.level || left.id.localeCompare(right.id),
  )
  return { choices, diagnostics: [...direct.diagnostics, ...singleFilters.diagnostics] }
}

export function getRequiredChoiceSelectionCount(
  choice: NormalizedCharacterChoice,
  classLevel: number,
): number {
  if (classLevel <= 0) return 0
  return choice.selectionCountByLevel[Math.min(LEVEL_COUNT, classLevel) - 1] ?? 0
}
