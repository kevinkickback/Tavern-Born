import type {
  Class5e,
  ClassFeatureReference,
  OptFeatureProg,
  Subclass5e,
  SubclassFeatureReference,
} from '@/types/5etools'
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

type ChoiceFeatureReference = ClassFeatureReference | SubclassFeatureReference
type ChoiceOwner = NormalizedCharacterChoice['owner']

function classChoiceOwner(classData: Pick<Class5e, 'name' | 'source'>): ChoiceOwner {
  return { type: 'class', name: classData.name, source: classData.source }
}

function subclassChoiceOwner(
  classData: Pick<Class5e, 'name' | 'source'>,
  subclass: Pick<Subclass5e, 'name' | 'source'>,
): ChoiceOwner {
  return {
    type: 'subclass',
    name: classData.name,
    source: classData.source,
    subclassName: subclass.name,
    subclassSource: subclass.source,
  }
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

function buildChoiceId(owner: ChoiceOwner, label: string, level: number) {
  const subclassPart = owner.subclassName
    ? `|subclass:${normalizedIdPart(owner.subclassName)}|${normalizedIdPart(owner.subclassSource ?? '')}`
    : ''
  return `class:${normalizedIdPart(owner.name)}|${normalizedIdPart(owner.source)}${subclassPart}|choice:${normalizedIdPart(label)}|${level}`
}

function getReferenceLevel(ref: ChoiceFeatureReference): number | undefined {
  if (ref.level !== undefined) return ref.level
  if (ref.feature?.level !== undefined) return ref.feature.level
  const parts = typeof ref.ref === 'string' ? ref.ref.split('|') : []
  for (const index of [5, 3]) {
    const encodedLevel = Number.parseInt(parts[index] ?? '', 10)
    if (!Number.isNaN(encodedLevel)) return encodedLevel
  }
  return undefined
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

function parseSubclassFeatureReference(
  value: string,
  fallbackSource: string,
): NormalizedChoiceOptionReference | undefined {
  const parts = value.split('|')
  const name = parts[0]?.trim()
  if (!name) return undefined
  return {
    entityType: 'subclassFeature',
    name,
    source: parts[6]?.trim() || parts[4]?.trim() || fallbackSource,
  }
}

function parseNamedEntityReference(
  value: string,
  entityType: Exclude<ChoiceOptionEntityType, 'classFeature' | 'subclassFeature'>,
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
  if (typeof entry.subclassFeature === 'string') {
    return parseSubclassFeatureReference(entry.subclassFeature, fallbackSource)
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
  if (typeof entry.creature === 'string') {
    return parseNamedEntityReference(entry.creature, 'creature', fallbackSource)
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
    return JSON.stringify(ref.feature?.entries ?? '', (key, value) =>
      key === 'feature' ? undefined : value,
    )
  } catch {
    return ''
  }
}

function visitFeatureRecords(
  value: unknown,
  visitor: (record: Record<string, unknown>) => void,
): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      visitFeatureRecords(entry, visitor)
    })
    return
  }
  const record = asRecord(value)
  if (!record) return
  visitor(record)
  if (Array.isArray(record.entries)) visitFeatureRecords(record.entries, visitor)
}

function getTableMinimumClassLevel(table: Record<string, unknown>, fallbackLevel: number): number {
  const caption = typeof table.caption === 'string' ? table.caption : ''
  const parsed = /\bLevel\s+(\d+)\+/i.exec(caption)?.[1]
  return parsed ? Number.parseInt(parsed, 10) : fallbackLevel
}

function getFeatureTableRules(ref: ClassFeatureReference): {
  options: NormalizedChoiceOptionReference[]
  tags: ParsedFilterTag[]
} {
  const options = new Map<string, NormalizedChoiceOptionReference>()
  const tags: ParsedFilterTag[] = []
  const fallbackLevel = getReferenceLevel(ref) ?? 1
  visitFeatureRecords(ref.feature?.entries, (table) => {
    if (table.type !== 'table' || !Array.isArray(table.rows)) return
    const minimumClassLevel = getTableMinimumClassLevel(table, fallbackLevel)
    const text = JSON.stringify(table.rows)
    tags.push(
      ...parseFilterTags(text).map((tag) => ({
        ...tag,
        filter: { ...tag.filter, minimumClassLevel },
      })),
    )
    for (const match of text.matchAll(/\{@item\s+([^|}]+)(?:\|([^|}]*))?(?:\|[^}]*)?}/gi)) {
      const name = match[1]?.trim()
      if (!name) continue
      const source = match[2]?.trim() || ref.source
      const option = { entityType: 'item' as const, name, source, minimumClassLevel }
      const key = `${normalizedIdPart(name)}|${normalizedIdPart(source ?? '')}`
      if (minimumClassLevel < (options.get(key)?.minimumClassLevel ?? Infinity))
        options.set(key, option)
    }
  })
  return { options: [...options.values()], tags }
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
    /whenever you reach a level in this class that grants the ability score improvement feature/i.test(
      searchableText,
    ) &&
    /\breplace\b/i.test(searchableText)
  ) {
    return {
      cadence: 'asi-level',
      maximumPerEvent: /\breplace (?:one|a|an)\b/i.test(searchableText) ? 1 : 'all',
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

function hasFilteredSelectionIntent(text: string, labels: readonly string[]): boolean {
  const searchableText = toSearchableText(text)
  const countWords = Object.keys(COUNT_WORDS).join('|')
  if (
    new RegExp(`\\b(?:choose|select|learn|pick)\\s+(?:a|an|\\d+|${countWords})\\s+[a-z]`, 'i').test(
      searchableText,
    )
  ) {
    return true
  }
  return labels.some((label) => {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(
      `\\b(?:gain|choose|select|learn|pick|replace)\\s+(?:(?:a|an|one|another|any|\\d+|${countWords})\\s+)?${escapedLabel}\\b`,
      'i',
    ).test(searchableText)
  })
}

function filtersSameProgressionFamily(
  progression: NormalizedCharacterChoice,
  filter: NormalizedChoiceOptionFilter,
): boolean {
  if (progression.source.kind !== 'optional-feature-progression') {
    return false
  }
  if (progression.optionFilter?.entityType !== filter.entityType) return false
  const overlaps = (left: readonly string[] | undefined, right: readonly string[]) => {
    const values = new Set((left ?? []).map((value) => value.toLowerCase()))
    return right.some((value) => values.has(value.toLowerCase()))
  }
  const candidateFilters = [filter, ...(filter.anyOf ?? [])]
  return candidateFilters.some(
    (candidate) =>
      overlaps(progression.optionFilter?.featureTypes, candidate.featureTypes ?? []) ||
      overlaps(progression.optionFilter?.categories, candidate.categories ?? []),
  )
}

function choiceKindForEntity(entityType: ChoiceOptionEntityType): NormalizedCharacterChoiceKind {
  if (entityType === 'classFeature') return 'class-feature'
  if (entityType === 'subclassFeature') return 'subclass-feature'
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
  if (match?.[1]) return parsePositiveCount(match[1])
  const leadingSelection = new RegExp(
    `\\b(?:choose|select|learn|pick)\\s+(a|an|\\d+|${countWords})\\s+(?:(?:types?|kinds?)\\s+of\\s+)?[a-z]`,
    'i',
  ).exec(searchableText)
  return leadingSelection?.[1] ? parsePositiveCount(leadingSelection[1]) : undefined
}

function inferSelectionCounts(text: string, level: number, initialCount: number): number[] {
  const gains = new Map<number, number>([[level, initialCount]])
  const searchableText = toSearchableText(text)
  for (const match of searchableText.matchAll(
    /\bwhen you reach ([^.]{0,80}?) level\b[^.]{0,180}\b(?:choose|select|learn|pick) another\b/gi,
  )) {
    for (const rawLevel of match[1]?.matchAll(/\d+/g) ?? []) {
      const parsedLevel = Number.parseInt(rawLevel[0], 10)
      if (parsedLevel > level && parsedLevel <= LEVEL_COUNT) {
        gains.set(parsedLevel, (gains.get(parsedLevel) ?? 0) + 1)
      }
    }
  }
  let count = 0
  return Array.from({ length: LEVEL_COUNT }, (_, index) => {
    count += gains.get(index + 1) ?? 0
    return count
  })
}

function mergeFilters(tags: readonly ParsedFilterTag[]): NormalizedChoiceOptionFilter | undefined {
  const entityType = tags[0]?.entityType
  if (!entityType || tags.some((tag) => tag.entityType !== entityType)) return undefined
  const filters = [...new Map(tags.map((tag) => [JSON.stringify(tag.filter), tag.filter])).values()]
  if (filters.length === 1) return filters[0]
  return { entityType, anyOf: filters }
}

function addChoiceContext(
  filter: NormalizedChoiceOptionFilter,
  text: string,
): NormalizedChoiceOptionFilter {
  if (filter.entityType !== 'item') return filter

  const searchableText = toSearchableText(text)
  const requiresProficiency = /\bwith which you (?:have|gain) proficiency\b/i.test(searchableText)
  const requiresMastery = /\bweapon mastery properties\b/i.test(searchableText)
  return {
    ...filter,
    ...(requiresProficiency ? { requiresProficiency: true } : {}),
    ...(requiresMastery ? { requiresMastery: true } : {}),
  }
}

function parseFraction(value: string): number | undefined {
  const cleaned = value.replace(/[[\]&]/g, '').trim()
  const fraction = /^(\d+)\/(\d+)$/.exec(cleaned)
  if (fraction) {
    const numerator = Number(fraction[1])
    const denominator = Number(fraction[2])
    return denominator > 0 ? numerator / denominator : undefined
  }
  const numeric = Number(cleaned)
  return Number.isFinite(numeric) ? numeric : undefined
}

function parseChallengeRatingMaximum(values: readonly string[]): number | undefined {
  const ratings = values.flatMap((value) =>
    value
      .split(/[;&]/)
      .map(parseFraction)
      .filter((rating): rating is number => rating !== undefined),
  )
  return ratings.length > 0 ? Math.max(...ratings) : undefined
}

function parseFilterTags(text: string): ParsedFilterTag[] {
  const tags: ParsedFilterTag[] = []
  const regex = /\{@filter\s+([^|}]+)\|([^|}]+)\|([^}]+)}/gi
  for (const match of text.matchAll(regex)) {
    const label = match[1]?.trim() ?? ''
    const collection = match[2]?.trim().toLowerCase()
    const clauses = (match[3] ?? '').split('|').flatMap((clause) => clause.split(/;(?=[^;=]+=)/))
    const entityType =
      collection === 'feats'
        ? 'feat'
        : collection === 'items'
          ? 'item'
          : collection === 'optionalfeatures'
            ? 'optionalFeature'
            : collection === 'bestiary'
              ? 'creature'
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
      else if (key === 'challenge rating') {
        filter.challengeRatingMaximum = parseChallengeRatingMaximum(values)
      } else if (filter.entityType === 'creature' && key === 'type') {
        filter.creatureTypes = values.filter((value) => !value.startsWith('!'))
      } else if (filter.entityType === 'creature' && key === 'size') {
        filter.sizes = values.filter((value) => !value.startsWith('!'))
      } else if (key === 'type') {
        const included = values.filter((value) => !value.startsWith('!'))
        const excluded = values
          .filter((value) => value.startsWith('!'))
          .map((value) => value.slice(1))
        if (included.length > 0) filter.itemTypes = included
        if (excluded.length > 0) filter.excludedItemTypes = excluded
      } else if (filter.entityType === 'item' && key === 'property') {
        filter.excludedItemProperties = values
          .filter((value) => value.startsWith('!'))
          .map((value) => value.slice(1))
      } else if (key === 'rarity') filter.rarities = values
      else if (key === 'miscellaneous' && values.includes('!cursed')) filter.excludeCursed = true
      else if (key === 'miscellaneous' && values.includes('!swarm')) filter.excludeSwarms = true
      else if (key === 'melee weapon') {
        filter.weaponRanges = [...new Set([...(filter.weaponRanges ?? []), 'melee' as const])]
      } else if (key === 'ranged weapon') {
        filter.weaponRanges = [...new Set([...(filter.weaponRanges ?? []), 'ranged' as const])]
      } else if (key === 'source') filter.source = values[0]
    }
    tags.push({ label, entityType, filter })
  }
  return tags
}

function getFeatureVariant(
  ref: ChoiceFeatureReference,
): NormalizedCharacterChoice['featureVariant'] | undefined {
  if (ref.feature?.isClassFeatureVariant !== true) return undefined
  const text = toSearchableText(getFeatureText(ref))
  const replacesFeatureName = /replaces (?:the )?([^.,;]+?) feature\b/i.exec(text)?.[1]?.trim()
  return { ...(replacesFeatureName ? { replacesFeatureName } : {}) }
}

function ownedFeature(owner: ChoiceOwner, ref: ChoiceFeatureReference): ChoiceOwner {
  return {
    ...owner,
    featureName: ref.name,
    featureSource: ref.feature?.source || ref.source || owner.source,
  }
}

function choiceDiagnostic(
  owner: ChoiceOwner,
  ref: ChoiceFeatureReference,
  level: number,
  code: ClassChoiceDiagnostic['code'],
  message: string,
): ClassChoiceDiagnostic {
  return {
    code,
    className: owner.name,
    classSource: owner.source,
    ...(owner.subclassName ? { subclassName: owner.subclassName } : {}),
    ...(owner.subclassSource ? { subclassSource: owner.subclassSource } : {}),
    featureName: ref.name,
    level,
    message,
    ...(getFeatureVariant(ref) ? { featureVariant: getFeatureVariant(ref) } : {}),
  }
}

function normalizeFeatureOptionChoices(
  classData: Pick<Class5e, 'name' | 'source'>,
  refs: readonly ChoiceFeatureReference[],
  owner: ChoiceOwner,
  missingCountPolicy: 'diagnose' | 'presentation' = 'diagnose',
  progressions: readonly OptFeatureProg[] = [],
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
      if (isProgressionBackedOptionBlock(ref.name, level, options, progressions)) {
        return
      }
      const rawCount = block.count
      const count =
        typeof rawCount === 'number' && Number.isFinite(rawCount) && rawCount > 0
          ? Math.trunc(rawCount)
          : undefined
      if (!count) {
        // Upstream subclass data also uses count-less option blocks to group features which are
        // all granted together. Only an explicit positive count makes those blocks selectable.
        // An explicit but invalid count is still malformed and must remain diagnostic.
        if (rawCount === undefined && missingCountPolicy === 'presentation') return
        diagnostics.push(
          choiceDiagnostic(
            owner,
            ref,
            level,
            'invalid-count',
            `Option block ${blockIndex + 1} has no safe positive selection count.`,
          ),
        )
        return
      }
      if (options.length === 0) {
        diagnostics.push(
          choiceDiagnostic(
            owner,
            ref,
            level,
            'unresolved-options',
            `Option block ${blockIndex + 1} has no source-qualified option references.`,
          ),
        )
        return
      }
      const entityType = options[0]?.entityType
      if (!entityType || options.some((option) => option.entityType !== entityType)) {
        diagnostics.push(
          choiceDiagnostic(
            owner,
            ref,
            level,
            'unresolved-options',
            `Option block ${blockIndex + 1} mixes entity types and cannot form one choice.`,
          ),
        )
        return
      }

      const label = blocks.length > 1 ? `${ref.name} ${blockIndex + 1}` : ref.name
      choices.push({
        id: buildChoiceId(owner, label, level),
        label,
        kind: choiceKindForEntity(entityType),
        owner: ownedFeature(owner, ref),
        level,
        minimumSelections: count,
        maximumSelections: count,
        selectionCountByLevel: countsFromLevel(level, count),
        options,
        repeatable: false,
        replacement: inferReplacement(getFeatureText(ref)),
        ...(getFeatureVariant(ref) ? { featureVariant: getFeatureVariant(ref) } : {}),
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
  progressions: readonly OptFeatureProg[],
  refs: readonly ChoiceFeatureReference[],
  owner: ChoiceOwner,
  sourceField: 'optionalfeatureProgression' | 'featProgression' = 'optionalfeatureProgression',
): NormalizedCharacterChoice[] {
  return progressions.flatMap((progression, index) => {
    const featureTypes = progression.featureType ?? []
    const categories = progression.category ?? []
    if (featureTypes.length === 0 && categories.length === 0) return []
    const counts = normalizeProgression(progression.progression)
    const levelIndex = counts.findIndex((count) => count > 0)
    if (levelIndex < 0) return []
    const maximumSelections = Math.max(...counts)
    const featureRef = refs.find(
      (ref) =>
        ref.name.trim().toLowerCase() === progression.name.trim().toLowerCase() ||
        featureTypes.some((type) =>
          getFeatureText(ref).toLowerCase().includes(`feature type=${type.toLowerCase()}`),
        ) ||
        categories.some((category) =>
          getFeatureText(ref).toLowerCase().includes(`category=${category.toLowerCase()}`),
        ),
    )
    let replacement = inferReplacement(featureRef ? getFeatureText(featureRef) : '')
    if (replacement.cadence === 'never') {
      for (const ref of refs) {
        const candidate = inferReplacement(getFeatureText(ref))
        if (candidate.cadence === 'never') continue
        const tags = parseFilterTags(getFeatureText(ref))
        if (
          tags.some(
            (tag) =>
              tag.entityType === 'optionalFeature' &&
              (tag.filter.featureTypes ?? []).some((type) =>
                featureTypes.some(
                  (progressionType) => progressionType.toLowerCase() === type.toLowerCase(),
                ),
              ),
          )
        ) {
          replacement = candidate
          break
        }
      }
    }
    return [
      {
        id: buildChoiceId(owner, progression.name, levelIndex + 1),
        label: progression.name,
        kind: categories.length > 0 ? ('feat' as const) : ('optional-feature' as const),
        owner: {
          ...owner,
          featureName: featureRef?.name ?? progression.name,
          featureSource: featureRef?.source ?? owner.source,
        },
        level: levelIndex + 1,
        minimumSelections: maximumSelections,
        maximumSelections,
        selectionCountByLevel: counts,
        options: [],
        optionFilter:
          categories.length > 0
            ? { entityType: 'feat' as const, categories: [...categories] }
            : { entityType: 'optionalFeature' as const, featureTypes: [...featureTypes] },
        repeatable: false,
        replacement,
        source: {
          kind: 'optional-feature-progression' as const,
          field: `${sourceField}[${index}]`,
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
    const tableRules = getFeatureTableRules(featureRef)
    const tags = tableRules.tags.length > 0 ? tableRules.tags : parseFilterTags(text)
    const mergedFilter = mergeFilters(tags)
    if (!mergedFilter) return []
    if (mergedFilter.entityType === 'creature') return []
    const filter = addChoiceContext(mergedFilter, text)
    const sectionNames = new Set([featureRef.name.toLowerCase()])
    visitFeatureRecords(featureRef.feature?.entries, (entry) => {
      if (typeof entry.name === 'string')
        sectionNames.add(toSearchableText(entry.name).toLowerCase())
    })

    for (const [groupIndex, rawGroup] of (classData.classTableGroups ?? []).entries()) {
      const group = asRecord(rawGroup)
      const labels = Array.isArray(group?.colLabels) ? group.colLabels : []
      const columnIndex = labels.findIndex(
        (label) =>
          typeof label === 'string' && sectionNames.has(toSearchableText(label).toLowerCase()),
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
          id: buildChoiceId(classChoiceOwner(classData), featureRef.name, firstLevelIndex + 1),
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
          options: filter.entityType === 'item' ? tableRules.options : [],
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
  refs: readonly ChoiceFeatureReference[],
  existing: readonly NormalizedCharacterChoice[],
  owner: ChoiceOwner,
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
    if (mergedFilter.entityType === 'creature' && tags.length !== 1) continue
    const filter = addChoiceContext(mergedFilter, text)
    if (
      existing.some(
        (choice) =>
          filtersSameProgressionFamily(choice, filter) ||
          (filter.entityType === 'optionalFeature' &&
            choice.source.kind === 'optional-feature-progression' &&
            choiceNameStem(choice.label) === choiceNameStem(ref.name)),
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
      if (!hasFilteredSelectionIntent(text, labels)) continue
      diagnostics.push(
        choiceDiagnostic(
          owner,
          ref,
          level,
          'invalid-count',
          'Filtered choice has no safely parseable selection count or matching class table.',
        ),
      )
      continue
    }
    const selectionCountByLevel = inferSelectionCounts(text, level, count)
    const maximumSelections = Math.max(...selectionCountByLevel)
    choices.push({
      id: buildChoiceId(owner, ref.name, level),
      label: ref.name,
      kind: choiceKindForEntity(filter.entityType),
      owner: ownedFeature(owner, ref),
      level,
      minimumSelections: maximumSelections,
      maximumSelections,
      selectionCountByLevel,
      options: [],
      optionFilter: filter,
      repeatable: false,
      replacement: inferReplacement(text),
      ...(getFeatureVariant(ref) ? { featureVariant: getFeatureVariant(ref) } : {}),
      source: {
        kind: 'class-feature-options',
        field: `classFeatureRefs:${ref.ref || ref.name}:entries.filter`,
      },
    })
  }
  return { choices, diagnostics }
}

function parseCreatureTags(text: string): NormalizedChoiceOptionReference[] {
  const options = new Map<string, NormalizedChoiceOptionReference>()
  for (const match of text.matchAll(/\{@creature\s+([^|}]+)(?:\|([^|}]*))?(?:\|[^}]*)?}/gi)) {
    const name = match[1]?.trim()
    if (!name) continue
    const source = match[2]?.trim()
    const option: NormalizedChoiceOptionReference = {
      entityType: 'creature',
      name,
      ...(source ? { source } : {}),
    }
    options.set(`${normalizedIdPart(name)}|${normalizedIdPart(source ?? '')}`, option)
  }
  return [...options.values()]
}

function normalizeCreatureTagChoices(
  refs: readonly ChoiceFeatureReference[],
  existing: readonly NormalizedCharacterChoice[],
  owner: ChoiceOwner,
): NormalizedCharacterChoice[] {
  return refs.flatMap((ref) => {
    const level = getReferenceLevel(ref)
    if (!level || existing.some((choice) => choice.owner.featureName === ref.name)) return []
    const text = getFeatureText(ref)
    const searchableText = toSearchableText(text)
    if (!/\bchoose (?:its|a|the) stat block\b/i.test(searchableText)) return []
    const options = parseCreatureTags(text)
    if (options.length < 2) return []
    return [
      {
        id: buildChoiceId(owner, ref.name, level),
        label: ref.name,
        kind: 'creature' as const,
        owner: ownedFeature(owner, ref),
        level,
        minimumSelections: 1,
        maximumSelections: 1,
        selectionCountByLevel: countsFromLevel(level, 1),
        options,
        repeatable: false,
        replacement: inferReplacement(text),
        ...(getFeatureVariant(ref) ? { featureVariant: getFeatureVariant(ref) } : {}),
        source: {
          kind: 'class-feature-options' as const,
          field: `subclassFeatureRefs:${ref.ref || ref.name}:entries.creature`,
        },
      },
    ]
  })
}

function collectSubclassChoiceFeatureRefs(
  refs: readonly SubclassFeatureReference[],
): ChoiceFeatureReference[] {
  const collected: ChoiceFeatureReference[] = []
  const seen = new Set<string>()

  const add = (ref: ChoiceFeatureReference) => {
    const subclassRef = ref as SubclassFeatureReference
    const feature = ref.feature
    const identity = `${ref.ref}|${feature?.name ?? ref.name}|${feature?.source ?? ref.source ?? ''}|${getReferenceLevel(ref) ?? ''}`
    if (seen.has(identity)) return
    seen.add(identity)
    collected.push(ref)
    visitFeatureRecords(feature?.entries, (record) => {
      if (record.type !== 'refSubclassFeature' || typeof record.subclassFeature !== 'string') return
      const nestedFeature = asRecord(record.feature)
      if (!nestedFeature || typeof nestedFeature.name !== 'string') return
      const parts = record.subclassFeature.split('|')
      add({
        ref: record.subclassFeature,
        name: parts[0] ?? nestedFeature.name,
        className: parts[1] ?? ref.className,
        classSource: parts[2] || ref.classSource,
        subclassShortName: parts[3] || subclassRef.subclassShortName,
        subclassSource: parts[4] || subclassRef.subclassSource,
        source: parts[6] || (typeof nestedFeature.source === 'string' ? nestedFeature.source : ''),
        ...(() => {
          const parsedLevel = Number.parseInt(parts[5] ?? '', 10)
          const level =
            typeof nestedFeature.level === 'number'
              ? nestedFeature.level
              : Number.isNaN(parsedLevel)
                ? undefined
                : parsedLevel
          return level === undefined ? {} : { level }
        })(),
        feature: nestedFeature as unknown as NonNullable<SubclassFeatureReference['feature']>,
      })
    })
  }

  refs.forEach(add)
  return collected
}

/** Normalizes class-owned choice requirements with data-shape rules shared by every class. */
export function normalizeClassChoices(
  classData: Pick<Class5e, 'name' | 'source' | 'classTableGroups' | 'optionalfeatureProgression'>,
  refs: readonly ClassFeatureReference[],
): ChoiceNormalizationResult {
  const owner = classChoiceOwner(classData)
  const direct = normalizeFeatureOptionChoices(
    classData,
    refs,
    owner,
    'diagnose',
    classData.optionalfeatureProgression ?? [],
  )
  const progression = normalizeOptionalFeatureProgressions(
    classData.optionalfeatureProgression ?? [],
    refs,
    owner,
  )
  const tableBacked = normalizeTableBackedFilterChoices(classData, refs)
  const accumulated = [...direct.choices, ...progression, ...tableBacked]
  const singleFilters = normalizeSingleFilterChoices(refs, accumulated, owner)
  const choices = [...accumulated, ...singleFilters.choices].sort(
    (left, right) => left.level - right.level || left.id.localeCompare(right.id),
  )
  return { choices, diagnostics: [...direct.diagnostics, ...singleFilters.diagnostics] }
}

/** Normalizes selected-subclass feature choices, including nested referenced features. */
export function normalizeSubclassRules(
  classData: Pick<Class5e, 'name' | 'source'>,
  subclass: Pick<Subclass5e, 'name' | 'source' | 'optionalfeatureProgression' | 'featProgression'>,
  refs: readonly SubclassFeatureReference[],
): import('@/types/classRules').NormalizedClassRules {
  const owner = subclassChoiceOwner(classData, subclass)
  const expandedRefs = collectSubclassChoiceFeatureRefs(refs)
  const optionalFeatureProgressions = subclass.optionalfeatureProgression ?? []
  const featProgressions = subclass.featProgression ?? []
  const progressions = [...optionalFeatureProgressions, ...featProgressions]
  const progression = [
    ...normalizeOptionalFeatureProgressions(optionalFeatureProgressions, expandedRefs, owner),
    ...normalizeOptionalFeatureProgressions(
      featProgressions,
      expandedRefs,
      owner,
      'featProgression',
    ),
  ]
  const direct = normalizeFeatureOptionChoices(
    classData,
    expandedRefs,
    owner,
    'presentation',
    progressions,
  )
  const directChoices = direct.choices.filter(
    (choice) =>
      !progression.some(
        (candidate) =>
          normalizedIdPart(candidate.label) === normalizedIdPart(choice.label) &&
          candidate.kind === choice.kind,
      ),
  )
  const creatureTags = normalizeCreatureTagChoices(expandedRefs, directChoices, owner)
  const accumulated = [...progression, ...directChoices, ...creatureTags]
  const singleFilters = normalizeSingleFilterChoices(expandedRefs, accumulated, owner)
  return {
    resources: [],
    asiLevels: [],
    ritualCasting: false,
    choices: [...accumulated, ...singleFilters.choices].sort(
      (left, right) => left.level - right.level || left.id.localeCompare(right.id),
    ),
    choiceDiagnostics: [...direct.diagnostics, ...singleFilters.diagnostics],
  }
}

export function getRequiredChoiceSelectionCount(
  choice: NormalizedCharacterChoice,
  classLevel: number,
): number {
  if (classLevel <= 0) return 0
  return choice.selectionCountByLevel[Math.min(LEVEL_COUNT, classLevel) - 1] ?? 0
}
