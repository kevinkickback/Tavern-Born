import type { GameData } from '@/types/5etools'

type ReprintableEntity = {
  name?: unknown
  source?: unknown
  reprintedAs?: unknown
}

type ReprintableGameData = Pick<
  GameData,
  | 'races'
  | 'classes'
  | 'backgrounds'
  | 'spells'
  | 'feats'
  | 'items'
  | 'itemsBase'
  | 'classFeatures'
  | 'creatures'
  | 'optionalfeatures'
>

const parseTargetKey = (value: string): string | null => {
  const parts = value.split('|').map((part) => part.trim())
  if (parts.length < 2) return null

  if (parts.length >= 4) {
    const targetName = parts[0]
    const targetSource = parts[2]
    if (!targetName || !targetSource) return null
    return `${targetName}|${targetSource}`
  }

  const targetName = parts[0]
  const targetSource = parts[1]
  if (!targetName || !targetSource) return null
  return `${targetName}|${targetSource}`
}

const toEntityKey = (entity: ReprintableEntity): string | null => {
  if (typeof entity.name !== 'string' || typeof entity.source !== 'string') {
    return null
  }
  const name = entity.name.trim()
  const source = entity.source.trim()
  if (!name || !source) return null
  return `${name}|${source}`
}

export function collectReprintableEntities(gameData: ReprintableGameData): ReprintableEntity[] {
  const classes = gameData.classes ?? []
  const nestedClassEntities = classes.flatMap((classEntity) => [
    ...(classEntity.classFeatures ?? []).filter((feature) => typeof feature !== 'string'),
    ...(classEntity.classFeatureRefs ?? []).flatMap((reference) =>
      reference.feature ? [reference.feature] : [],
    ),
    ...(classEntity.subclasses ?? []).flatMap((subclass) => [
      subclass,
      ...(subclass.subclassFeatures ?? []).filter((feature) => typeof feature !== 'string'),
      ...(subclass.subclassFeatureRefs ?? []).flatMap((reference) =>
        reference.feature ? [reference.feature] : [],
      ),
      ...(subclass.levelFeatures ?? []).flatMap((group) => group.features),
    ]),
  ])

  return [
    ...(gameData.races ?? []),
    ...classes,
    ...nestedClassEntities,
    ...(gameData.backgrounds ?? []),
    ...(gameData.spells ?? []),
    ...(gameData.feats ?? []),
    ...(gameData.items ?? []),
    ...(gameData.itemsBase ?? []),
    ...(gameData.classFeatures ?? []),
    ...(gameData.creatures ?? []),
    ...((gameData.optionalfeatures ?? []) as ReprintableEntity[]),
  ]
}

export function hasAvailableReprintPair(
  gameData: ReprintableGameData,
  effectiveSources: readonly string[],
): boolean {
  const allowedSources = new Set(effectiveSources.map((source) => source.toUpperCase()))
  const entities = collectReprintableEntities(gameData)
  const entityKeys = new Set(entities.flatMap((entity) => toEntityKey(entity) ?? []))
  const targetsByKey = new Map<string, string[]>()

  for (const entity of entities) {
    const key = toEntityKey(entity)
    if (!key) continue
    const targets = Array.isArray(entity.reprintedAs)
      ? entity.reprintedAs
          .filter((target): target is string => typeof target === 'string')
          .map(parseTargetKey)
          .filter((target): target is string => target !== null && entityKeys.has(target))
      : []
    if (targets.length > 0) targetsByKey.set(key, targets)
  }

  const reachesAllowedPrinting = (key: string, visited: Set<string>): boolean => {
    if (visited.has(key)) return false
    visited.add(key)

    for (const targetKey of targetsByKey.get(key) ?? []) {
      const targetSource = targetKey.split('|')[1]?.toUpperCase() ?? ''
      if (allowedSources.has(targetSource)) {
        visited.delete(key)
        return true
      }
      if (reachesAllowedPrinting(targetKey, visited)) {
        visited.delete(key)
        return true
      }
    }

    visited.delete(key)
    return false
  }

  return entities.some((entity) => {
    const key = toEntityKey(entity)
    if (!key || !allowedSources.has(key.split('|')[1]?.toUpperCase() ?? '')) return false
    return reachesAllowedPrinting(key, new Set<string>())
  })
}

/**
 * Build the set of entity keys that should be hidden because a newer reprint
 * exists within the currently allowed source list.
 */
export function buildSuppressedKeys(
  entities: ReprintableEntity[],
  allowedSources: Set<string>,
): Set<string> {
  const reprintGraph = new Map<string, string[]>()

  for (const entity of entities) {
    const key = toEntityKey(entity)
    if (!key) continue
    const rawTargets = Array.isArray(entity.reprintedAs) ? entity.reprintedAs : []
    if (rawTargets.length === 0) continue

    const parsedTargets = rawTargets
      .filter((target): target is string => typeof target === 'string')
      .map(parseTargetKey)
      .filter((target): target is string => !!target)

    if (parsedTargets.length > 0) {
      reprintGraph.set(key, parsedTargets)
    }
  }

  const shouldSuppress = (
    key: string,
    visited: Set<string>,
    memo: Map<string, boolean>,
  ): boolean => {
    if (memo.has(key)) return memo.get(key) ?? false
    if (visited.has(key)) return false

    const targets = reprintGraph.get(key) ?? []
    if (targets.length === 0) {
      memo.set(key, false)
      return false
    }

    visited.add(key)
    for (const targetKey of targets) {
      const targetSource = targetKey.split('|')[1] ?? ''
      if (allowedSources.has(targetSource)) {
        memo.set(key, true)
        visited.delete(key)
        return true
      }

      if (shouldSuppress(targetKey, visited, memo)) {
        memo.set(key, true)
        visited.delete(key)
        return true
      }
    }

    visited.delete(key)
    memo.set(key, false)
    return false
  }

  const suppressed = new Set<string>()
  const memo = new Map<string, boolean>()

  for (const key of reprintGraph.keys()) {
    if (shouldSuppress(key, new Set<string>(), memo)) {
      suppressed.add(key)
    }
  }

  return suppressed
}
