import { type CatalogDependencyFailure, describeCatalogReference } from './catalogCheckError'
import { normalizeFeatureSource } from './classFeatureIdentity'
import { asArray, asObject } from './parsers/shared'
import { isMissingCatalogResource, type JsonResourceReader } from './resourceReader'

function identity(...parts: unknown[]) {
  return parts.every((part) => typeof part === 'string' && part.trim())
    ? JSON.stringify(parts.map((part) => (part as string).trim().toLowerCase()))
    : undefined
}

type RawRecord = ReturnType<typeof asObject>

function parentOf(row: RawRecord) {
  return identity(row.className, row.classSource)
}

function subclassIdentity(row: RawRecord) {
  return identity(row.className, row.classSource, row.name, row.source)
}

function subclassFeatureOwner(row: RawRecord) {
  return identity(
    row.className,
    normalizeFeatureSource(row.classSource, 'phb'),
    row.subclassShortName,
    normalizeFeatureSource(row.subclassSource, 'phb'),
  )
}

function nameOf(row: RawRecord) {
  return describeCatalogReference(`${row.name}|${row.source}`)
}

/** Retry from the original read snapshot. All materialized rules are rebuilt by the strict loader. */
export function createPartialCatalogReader(source: JsonResourceReader) {
  const documents = new Map<string, RawRecord>()
  const skippedClasses = new Set<string>()
  const skippedSubclasses = new Set<string>()
  const skippedFeatureOwners = new Set<string>()
  const skippedRecords = new Map<string, string>()
  let uncertainRead = false

  const reader: JsonResourceReader = {
    type: source.type,
    async readJson(path, signal) {
      let value: unknown
      try {
        value = await source.readJson(path, signal)
      } catch (error) {
        if (!isMissingCatalogResource(source.type, error)) uncertainRead = true
        throw error
      }
      if (!path.startsWith('class/') || path === 'class/index.json') return value
      const document = asObject(value)
      const collections = ['class', 'subclass', 'classFeature', 'subclassFeature'] as const
      if (!collections.some((key) => Array.isArray(document[key]))) return value
      documents.set(path, document)
      if (!skippedRecords.size) return value

      const selected = { ...document }
      if (Array.isArray(document.class)) {
        selected.class = document.class.filter((value) => {
          const row = asObject(value)
          return !skippedClasses.has(identity(row.name, row.source) ?? '')
        })
      }
      if (Array.isArray(document.subclass)) {
        selected.subclass = document.subclass.filter((value) => {
          const row = asObject(value)
          return (
            !skippedClasses.has(parentOf(row) ?? '') &&
            !skippedSubclasses.has(subclassIdentity(row) ?? '')
          )
        })
      }
      const skippedParentFeature = (row: RawRecord) =>
        skippedClasses.has(
          identity(row.className, normalizeFeatureSource(row.classSource, 'phb')) ?? '',
        )
      if (Array.isArray(document.classFeature)) {
        selected.classFeature = document.classFeature.filter(
          (value) => !skippedParentFeature(asObject(value)),
        )
      }
      if (Array.isArray(document.subclassFeature)) {
        selected.subclassFeature = document.subclassFeature.filter((value) => {
          const row = asObject(value)
          return (
            !skippedParentFeature(row) && !skippedFeatureOwners.has(subclassFeatureOwner(row) ?? '')
          )
        })
      }
      return selected
    },
  }

  function skip(failures: readonly CatalogDependencyFailure[]) {
    if (uncertainRead) return false
    const classes = [...documents.values()].flatMap((row) => asArray(row.class).map(asObject))
    const subclasses = [...documents.values()].flatMap((row) => asArray(row.subclass).map(asObject))
    const reasons = new Map<RawRecord, { references: Set<string>; explanations: Set<string> }>()
    for (const { parent, subclass, reference, explanation } of failures) {
      const owner = identity(parent.name, parent.source)
      const target =
        subclass && identity(parent.name, parent.source, subclass.name, subclass.source)
      const matches = subclass
        ? subclasses.filter((row) => target && subclassIdentity(row) === target)
        : classes.filter((row) => owner && identity(row.name, row.source) === owner)
      if (matches.length !== 1) return false
      const row = matches[0]
      const detail = reasons.get(row) ?? {
        references: new Set<string>(),
        explanations: new Set<string>(),
      }
      if (explanation) detail.explanations.add(explanation)
      else detail.references.add(describeCatalogReference(reference))
      reasons.set(row, detail)
    }

    const previous = skippedClasses.size + skippedSubclasses.size
    for (const [row, { references, explanations }] of reasons) {
      const reason = [
        ...(references.size ? [`Requires ${[...references].join(', ')}.`] : []),
        ...explanations,
      ].join(' ')
      if (subclasses.includes(row)) {
        const key = subclassIdentity(row)
        const featureOwner = identity(row.className, row.classSource, row.shortName, row.source)
        // Distinct declarations can share a short name. Do not remove their shared feature owner.
        if (
          !key ||
          !featureOwner ||
          subclasses.filter(
            (entry) =>
              identity(entry.className, entry.classSource, entry.shortName, entry.source) ===
              featureOwner,
          ).length !== 1
        )
          return false
        skippedSubclasses.add(key)
        skippedFeatureOwners.add(featureOwner)
        skippedRecords.set(
          key,
          `${nameOf(row)} for ${describeCatalogReference(`${row.className}|${row.classSource}`)}. ${reason}`,
        )
      } else {
        const key = identity(row.name, row.source)
        if (!key) return false
        skippedClasses.add(key)
        skippedRecords.set(key, `${nameOf(row)}. ${reason}`)
      }
    }
    for (const row of subclasses) {
      const parent = parentOf(row)
      if (!parent || !skippedClasses.has(parent)) continue
      const key = subclassIdentity(row)
      if (!key) return false
      if (!skippedRecords.has(key)) {
        const parentLabel = describeCatalogReference(`${row.className}|${row.classSource}`)
        skippedRecords.set(key, `${nameOf(row)} for ${parentLabel}. Its parent class was skipped.`)
      }
    }
    return skippedClasses.size + skippedSubclasses.size > previous
  }

  return { reader, skip, skippedRecords, hasUncertainRead: () => uncertainRead }
}
