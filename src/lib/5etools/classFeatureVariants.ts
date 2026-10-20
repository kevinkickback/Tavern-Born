import type { Class5e, Subclass5e } from '@/types/5etools'

/** Source metadata owns variants; the legacy unflagged firearm row retains its prefix fallback. */
export function isClassFeatureVariant(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const row = value as { isClassFeatureVariant?: unknown; name?: unknown }
  return (
    row.isClassFeatureVariant === true ||
    (typeof row.name === 'string' && row.name.startsWith('Optional Rule:'))
  )
}

export function isHiddenFeatureSelection(value: unknown, name: string, source?: string): boolean {
  const seen = new Set<object>()
  function visit(entry: unknown): boolean {
    if (!entry || typeof entry !== 'object' || seen.has(entry)) return false
    seen.add(entry)
    if (Array.isArray(entry)) return entry.some(visit)
    const row = entry as Record<string, unknown>
    if (row.name === name && row.source === source && isClassFeatureVariant(row)) return true
    return [
      'entries',
      'items',
      'feature',
      'features',
      'levelFeatures',
      'subclassFeatureRefs',
      'subclasses',
    ].some((key) => visit(row[key]))
  }
  return visit(value)
}

/** Character presentation only. Raw catalogs and persisted intent remain complete. */
export function visibleClassFeatureEntries(
  entries: unknown[],
  includeVariants: boolean,
): unknown[] {
  if (includeVariants) return entries
  const seen = new WeakMap<object, unknown>()
  function visit(value: unknown): unknown {
    if (!value || typeof value !== 'object') return value
    if (isClassFeatureVariant(value)) return undefined
    if (seen.has(value)) return seen.get(value)
    if (Array.isArray(value)) {
      const rows: unknown[] = []
      seen.set(value, rows)
      for (const entry of value) {
        const current = visit(entry)
        if (current !== undefined) rows.push(current)
      }
      return rows
    }
    const row = value as Record<string, unknown>
    if (
      (row.type === 'refClassFeature' || row.type === 'refSubclassFeature') &&
      isClassFeatureVariant(row.feature)
    )
      return undefined
    const result = { ...row }
    seen.set(value, result)
    for (const key of ['entries', 'items', 'feature'])
      if (result[key] && typeof result[key] === 'object') result[key] = visit(result[key])
    return result
  }
  return visit(entries) as unknown[]
}

export function visibleClassData(
  classData: Class5e | undefined,
  includeVariants: boolean,
): Class5e | undefined {
  if (!classData || includeVariants) return classData
  const subclass = (data: Subclass5e): Subclass5e => ({
    ...data,
    entries: visibleClassFeatureEntries(data.entries ?? [], false),
    subclassFeatureRefs: data.subclassFeatureRefs
      ?.filter((row) => !isClassFeatureVariant(row) && !isClassFeatureVariant(row.feature))
      .map((row) => ({
        ...row,
        feature: row.feature
          ? {
              ...row.feature,
              entries: visibleClassFeatureEntries(row.feature.entries ?? [], false),
            }
          : undefined,
      })),
    levelFeatures: data.levelFeatures?.map((group) => ({
      ...group,
      features: group.features
        .filter((row) => !isClassFeatureVariant(row))
        .map((row) => ({ ...row, entries: visibleClassFeatureEntries(row.entries ?? [], false) })),
    })),
  })
  return {
    ...classData,
    entries: visibleClassFeatureEntries(
      Array.isArray(classData.entries) ? classData.entries : [],
      false,
    ),
    subclasses: classData.subclasses?.map(subclass),
  }
}
