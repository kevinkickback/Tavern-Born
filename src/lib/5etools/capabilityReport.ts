import { normalizeRaceMovement } from '@/lib/calculations/movement'
import type { Class5e, GameData, Race5e } from '@/types/5etools'
import type { NormalizedChoiceOptionReference } from '@/types/classRules'

const FIELD_COLLECTIONS = [
  'races',
  'classes',
  'backgrounds',
  'feats',
  'items',
  'itemsBase',
  'creatures',
  'optionalfeatures',
] as const

type CapabilityCollection = (typeof FIELD_COLLECTIONS)[number]
type FieldShape = 'array' | 'boolean' | 'null' | 'number' | 'object' | 'string' | 'undefined'

interface CapabilityIssue {
  code:
    | 'choice-diagnostic'
    | 'missing-normalized-rules'
    | 'unqualified-entity'
    | 'unqualified-reference'
    | 'unresolved-inherited-movement'
    | 'unresolved-reference'
    | 'unsupported-movement-shape'
  collection: string
  entity: string
  path: string
  message: string
}

export interface CorpusCapabilityReport {
  entities: Record<CapabilityCollection, number>
  classChoices: {
    total: number
    byKind: Record<string, number>
    diagnostics: number
    inventory: Array<{
      owner: string
      id: string
      label: string
      kind: string
      level: number
      maximumSelections: number
      sourceField: string
    }>
  }
  movement: {
    absent: number
    numeric: number
    structured: number
    unsupported: number
    modes: Record<string, number>
    customModes: Record<string, number>
    unresolvedInherited: number
  }
  fields: Array<{
    collection: CapabilityCollection
    field: string
    shapes: Record<string, number>
  }>
  issues: CapabilityIssue[]
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function fieldShape(value: unknown): FieldShape {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value as FieldShape
}

function entityKey(value: unknown): string | undefined {
  const record = asRecord(value)
  const name = typeof record?.name === 'string' ? record.name.trim() : ''
  const source = typeof record?.source === 'string' ? record.source.trim() : ''
  return name && source ? `${name}|${source}` : undefined
}

function displayEntity(value: unknown, fallback: string): string {
  const record = asRecord(value)
  const name = typeof record?.name === 'string' ? record.name.trim() : ''
  const source = typeof record?.source === 'string' ? record.source.trim() : ''
  if (name && source) return `${name}|${source}`
  return name || source || fallback
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1
}

function optionCatalogs(
  gameData: GameData,
): Record<NormalizedChoiceOptionReference['entityType'], Set<string>> {
  const embeddedClassFeatures = gameData.classes.flatMap((classData) =>
    (classData.classFeatureRefs ?? []).flatMap((reference) =>
      reference.feature ? [reference.feature] : [],
    ),
  )
  const embeddedSubclassFeatures: unknown[] = []
  const visitSubclassEntries = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visitSubclassEntries)
      return
    }
    const record = asRecord(value)
    if (!record) return
    if (record.type === 'refSubclassFeature' && asRecord(record.feature)) {
      embeddedSubclassFeatures.push(record.feature)
    }
    Object.values(record).forEach(visitSubclassEntries)
  }
  for (const classData of gameData.classes) {
    for (const subclass of classData.subclasses ?? []) {
      for (const reference of subclass.subclassFeatureRefs ?? []) {
        if (!reference.feature) continue
        embeddedSubclassFeatures.push(reference.feature)
        visitSubclassEntries(reference.feature.entries)
      }
    }
  }
  return {
    classFeature: new Set(
      [...gameData.classFeatures, ...embeddedClassFeatures].flatMap(
        (value) => entityKey(value) ?? [],
      ),
    ),
    creature: new Set((gameData.creatures ?? []).flatMap((value) => entityKey(value) ?? [])),
    feat: new Set(gameData.feats.flatMap((value) => entityKey(value) ?? [])),
    item: new Set(
      [...gameData.items, ...gameData.itemsBase].flatMap((value) => entityKey(value) ?? []),
    ),
    optionalFeature: new Set(gameData.optionalfeatures.flatMap((value) => entityKey(value) ?? [])),
    subclassFeature: new Set(embeddedSubclassFeatures.flatMap((value) => entityKey(value) ?? [])),
  }
}

function inspectReference(
  option: NormalizedChoiceOptionReference,
  owner: string,
  path: string,
  catalogs: ReturnType<typeof optionCatalogs>,
  issues: CapabilityIssue[],
): void {
  if (!option.source?.trim()) {
    issues.push({
      code: 'unqualified-reference',
      collection: 'classes',
      entity: owner,
      path,
      message: `The ${option.entityType} option ${option.name} has no source and cannot be resolved safely.`,
    })
    return
  }
  const key = `${option.name}|${option.source}`
  if (catalogs[option.entityType].has(key)) return
  issues.push({
    code: 'unresolved-reference',
    collection: 'classes',
    entity: owner,
    path,
    message: `The ${option.entityType} option ${key} was not found in the parsed catalog.`,
  })
}

function inspectClassReferences(classData: Class5e, issues: CapabilityIssue[]): void {
  const owner = displayEntity(classData, 'class')
  for (const [index, reference] of (classData.classFeatureRefs ?? []).entries()) {
    if (reference.feature) continue
    issues.push({
      code: 'unresolved-reference',
      collection: 'classes',
      entity: owner,
      path: `classFeatureRefs[${index}]`,
      message: `Class feature reference ${reference.ref || reference.name} did not resolve.`,
    })
  }
  for (const [subclassIndex, subclass] of (classData.subclasses ?? []).entries()) {
    for (const [referenceIndex, reference] of (subclass.subclassFeatureRefs ?? []).entries()) {
      if (reference.feature) continue
      issues.push({
        code: 'unresolved-reference',
        collection: 'classes',
        entity: displayEntity(subclass, owner),
        path: `subclasses[${subclassIndex}].subclassFeatureRefs[${referenceIndex}]`,
        message: `Subclass feature reference ${reference.ref || reference.name} did not resolve.`,
      })
    }
  }
}

function inspectMovement(
  race: Race5e,
  movement: CorpusCapabilityReport['movement'],
  issues: CapabilityIssue[],
): void {
  const owner = displayEntity(race, 'race')
  if (race.speed === undefined) {
    movement.absent += 1
    return
  }
  if (typeof race.speed === 'number') {
    movement.numeric += 1
    increment(movement.modes, 'walk')
    return
  }
  const speed = asRecord(race.speed)
  if (!speed) {
    movement.unsupported += 1
    issues.push({
      code: 'unsupported-movement-shape',
      collection: 'races',
      entity: owner,
      path: 'speed',
      message: `Movement uses the unsupported ${fieldShape(race.speed)} shape.`,
    })
    return
  }
  movement.structured += 1
  for (const mode of Object.keys(speed)) increment(movement.modes, mode)
  const normalized = normalizeRaceMovement(race)
  for (const mode of Object.keys(normalized.other ?? {})) increment(movement.customModes, mode)
  for (const mode of normalized.unresolvedInheritedModes ?? []) {
    movement.unresolvedInherited += 1
    issues.push({
      code: 'unresolved-inherited-movement',
      collection: 'races',
      entity: owner,
      path: `speed.${mode}`,
      message: `Movement mode ${mode} inherits a walking speed that is not present.`,
    })
  }
}

/** Inventories parsed corpus capabilities without interpreting source-specific rule names or values. */
export function createCorpusCapabilityReport(gameData: GameData): CorpusCapabilityReport {
  const issues: CapabilityIssue[] = []
  const catalogs = optionCatalogs(gameData)
  const report: CorpusCapabilityReport = {
    entities: Object.fromEntries(
      FIELD_COLLECTIONS.map((collection) => [collection, (gameData[collection] ?? []).length]),
    ) as Record<CapabilityCollection, number>,
    classChoices: { total: 0, byKind: {}, diagnostics: 0, inventory: [] },
    movement: {
      absent: 0,
      numeric: 0,
      structured: 0,
      unsupported: 0,
      modes: {},
      customModes: {},
      unresolvedInherited: 0,
    },
    fields: [],
    issues,
  }

  const fieldCounts = new Map<string, Record<string, number>>()
  for (const collection of FIELD_COLLECTIONS) {
    for (const [index, entity] of (gameData[collection] ?? []).entries()) {
      const owner = displayEntity(entity, `${collection}[${index}]`)
      if (!entityKey(entity)) {
        issues.push({
          code: 'unqualified-entity',
          collection,
          entity: owner,
          path: `${collection}[${index}]`,
          message: 'Entity is missing a source-qualified name.',
        })
      }
      const record = asRecord(entity)
      if (!record) continue
      for (const [field, value] of Object.entries(record)) {
        const key = `${collection}\u0000${field}`
        const shapes = fieldCounts.get(key) ?? {}
        increment(shapes, fieldShape(value))
        fieldCounts.set(key, shapes)
      }
    }
  }
  report.fields = Array.from(fieldCounts.entries())
    .map(([key, shapes]) => {
      const [collection, field] = key.split('\u0000') as [CapabilityCollection, string]
      return { collection, field, shapes }
    })
    .sort(
      (left, right) =>
        left.collection.localeCompare(right.collection) || left.field.localeCompare(right.field),
    )

  for (const race of gameData.races) inspectMovement(race, report.movement, issues)

  const inspectNormalizedRules = (
    rules: NonNullable<Class5e['normalizedRules']>,
    owner: string,
    pathPrefix: string,
  ) => {
    report.classChoices.total += rules.choices.length
    for (const [choiceIndex, choice] of rules.choices.entries()) {
      increment(report.classChoices.byKind, choice.kind)
      report.classChoices.inventory.push({
        owner,
        id: choice.id,
        label: choice.label,
        kind: choice.kind,
        level: choice.level,
        maximumSelections: choice.maximumSelections,
        sourceField: choice.source.field,
      })
      for (const [optionIndex, option] of choice.options.entries()) {
        inspectReference(
          option,
          owner,
          `${pathPrefix}.choices[${choiceIndex}].options[${optionIndex}]`,
          catalogs,
          issues,
        )
      }
    }
    report.classChoices.diagnostics += rules.choiceDiagnostics.length
    for (const [diagnosticIndex, diagnostic] of rules.choiceDiagnostics.entries()) {
      issues.push({
        code: 'choice-diagnostic',
        collection: 'classes',
        entity: owner,
        path: `${pathPrefix}.choiceDiagnostics[${diagnosticIndex}]`,
        message: `${diagnostic.featureName}: ${diagnostic.code}: ${diagnostic.message}`,
      })
    }
  }

  for (const classData of gameData.classes) {
    inspectClassReferences(classData, issues)
    const owner = displayEntity(classData, 'class')
    if (!classData.normalizedRules) {
      issues.push({
        code: 'missing-normalized-rules',
        collection: 'classes',
        entity: owner,
        path: 'normalizedRules',
        message: 'Parsed class has no normalized rule contract.',
      })
    } else {
      inspectNormalizedRules(classData.normalizedRules, owner, 'normalizedRules')
    }
    for (const [subclassIndex, subclass] of (classData.subclasses ?? []).entries()) {
      const subclassOwner = `${owner} / ${displayEntity(subclass, 'subclass')}`
      if (!subclass.normalizedRules) {
        issues.push({
          code: 'missing-normalized-rules',
          collection: 'classes',
          entity: subclassOwner,
          path: `subclasses[${subclassIndex}].normalizedRules`,
          message: 'Parsed subclass has no normalized rule contract.',
        })
        continue
      }
      inspectNormalizedRules(
        subclass.normalizedRules,
        subclassOwner,
        `subclasses[${subclassIndex}].normalizedRules`,
      )
    }
  }

  report.classChoices.inventory.sort(
    (left, right) =>
      left.owner.localeCompare(right.owner) ||
      left.level - right.level ||
      left.id.localeCompare(right.id),
  )

  report.issues.sort(
    (left, right) =>
      left.collection.localeCompare(right.collection) ||
      left.entity.localeCompare(right.entity) ||
      left.path.localeCompare(right.path) ||
      left.code.localeCompare(right.code),
  )
  return report
}
