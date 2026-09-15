import type { Class5e, ClassFeatureReference, OptFeatureProg } from '@/types/5etools'
import type {
  ChoiceOptionEntityType,
  ClassChoiceDiagnostic,
  NormalizedCharacterChoice,
  NormalizedCharacterChoiceKind,
  NormalizedChoiceOptionFilter,
  NormalizedChoiceOptionReference,
} from '@/types/classRules'

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
const COUNT_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
}

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

function parseNamedEntityReference(
  value: string,
  entityType: Exclude<ChoiceOptionEntityType, 'classFeature'>,
  fallbackSource: string,
): NormalizedChoiceOptionReference | undefined {
  const [rawName, rawSource] = value.split('|')
  const name = rawName?.trim()
  if (!name) return undefined
  return {
    entityType,
    name,
    source: rawSource?.trim() || fallbackSource,
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
  if (typeof entry.optionalfeature === 'string') {
    return parseNamedEntityReference(entry.optionalfeature, 'optionalFeature', fallbackSource)
  }
  if (typeof entry.feat === 'string') {
    return parseNamedEntityReference(entry.feat, 'feat', fallbackSource)
  }
  if (typeof entry.item === 'string') {
    return parseNamedEntityReference(entry.item, 'item', fallbackSource)
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

function choiceNameStem(value: string): string {
  return normalizedIdPart(value)
    .replace(/-options?$/, '')
    .replace(/s$/, '')
}

function isProgressionBackedOptionBlock(
  featureName: string,
  level: number,
  options: readonly NormalizedChoiceOptionReference[],
  progressions: readonly OptFeatureProg[],
): boolean {
  if (options.length === 0 || options.some((option) => option.entityType !== 'optionalFeature')) {
    return false
  }
  const featureStem = choiceNameStem(featureName)
  const nameMatches = progressions.filter(
    (progression) => choiceNameStem(progression.name) === featureStem,
  )
  if (nameMatches.length === 1) return true
  const levelMatches = progressions.filter(
    (progression) =>
      normalizeProgression(progression.progression).findIndex((count) => count > 0) + 1 === level,
  )
  return levelMatches.length === 1
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

function parsePositiveCount(value: string): number | undefined {
  const numeric = Number.parseInt(value, 10)
  const count = Number.isNaN(numeric) ? COUNT_WORDS[value.toLowerCase()] : numeric
  return count && count > 0 ? count : undefined
}

function inferFilteredChoiceCount(text: string, label: string): number | undefined {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const searchableText = toSearchableText(text)
  if (
    new RegExp(
      `\\b(?:gain|choose|select|learn|pick)\\s+(?:a|an|one)\\s+${escapedLabel}\\b`,
      'i',
    ).test(searchableText)
  ) {
    return 1
  }
  const countWords = Object.keys(COUNT_WORDS).join('|')
  const match = new RegExp(
    `\\b(\\d+|${countWords})\\s+(?:kinds?\\s+of\\s+)?${escapedLabel}\\b[^.]{0,160}\\bof your choice\\b`,
    'i',
  ).exec(searchableText)
  return match?.[1] ? parsePositiveCount(match[1]) : undefined
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

function addChoiceContext(
  filter: NormalizedChoiceOptionFilter,
  text: string,
): NormalizedChoiceOptionFilter {
  if (
    filter.entityType === 'item' &&
    /\bwith which you (?:have|gain) proficiency\b/i.test(toSearchableText(text))
  ) {
    return { ...filter, requiresProficiency: true }
  }
  return filter
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
  classData: Pick<Class5e, 'name' | 'source' | 'optionalfeatureProgression'>,
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
      const options = Array.isArray(block.entries)
        ? block.entries.flatMap((entry) => {
            const option = getOptionReference(entry, feature.source || classData.source)
            return option ? [option] : []
          })
        : []
      if (
        isProgressionBackedOptionBlock(
          ref.name,
          level,
          options,
          classData.optionalfeatureProgression ?? [],
        )
      ) {
        return
      }
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
      const entityType = options[0]?.entityType
      if (!entityType || options.some((option) => option.entityType !== entityType)) {
        diagnostics.push({
          code: 'unresolved-options',
          className: classData.name,
          classSource: classData.source,
          featureName: ref.name,
          level,
          message: `Option block ${blockIndex + 1} mixes entity types and cannot form one choice.`,
        })
        return
      }

      const label = blocks.length > 1 ? `${ref.name} ${blockIndex + 1}` : ref.name
      choices.push({
        id: buildChoiceId(classData, label, level),
        label,
        kind: choiceKindForEntity(entityType),
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
    const mergedFilter = mergeFilters(tags)
    if (!mergedFilter) return []
    const filter = addChoiceContext(mergedFilter, text)

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
    const mergedFilter = mergeFilters(tags)
    if (!mergedFilter) continue
    const filter = addChoiceContext(mergedFilter, text)
    if (
      filter.entityType === 'optionalFeature' &&
      existing.some(
        (choice) =>
          choice.source.kind === 'optional-feature-progression' &&
          choiceNameStem(choice.label) === choiceNameStem(ref.name),
      )
    ) {
      continue
    }
    const labels = [...new Set(tags.map((tag) => tag.label))]
    const count = labels.reduce<number | undefined>(
      (found, label) => found ?? inferFilteredChoiceCount(text, label),
      undefined,
    )
    if (!count) {
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
      minimumSelections: count,
      maximumSelections: count,
      selectionCountByLevel: countsFromLevel(level, count),
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
