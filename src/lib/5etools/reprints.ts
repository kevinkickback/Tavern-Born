import type { GameData, Subclass5e } from '@/types/5etools'
import {
  decodeClassFeatureReference,
  decodeSubclassFeatureReference,
  getClassFeatureIdentity,
  getSubclassFeatureIdentity,
  getSubclassOwnerIdentity,
} from './classFeatureIdentity'
import { getFeatureSourceDigest } from './featureSourceAudit'

interface ReprintTarget {
  key: string
  source: string
}
const projection = Symbol('current reprint identity')
type ReprintableEntity = {
  name?: unknown
  source?: unknown
  reprintedAs?: unknown
  sourceIdentityConflict?: unknown
  [projection]?: ReprintTarget & {
    kind?: 'classFeature' | 'subclassFeature'
    targets?: ReprintTarget[]
    conflict?: boolean
  }
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
const upper = (value: string) => value.trim().toUpperCase()
const lower = (value: string) => value.trim().toLowerCase()

/** Subclass owners never share a suppression key with their same-labelled feature intro. */
export function getSubclassReprintKey(value: Record<string, unknown>): string | undefined {
  const owner = getSubclassOwnerIdentity(value)
  return owner ? 'subclass:' + JSON.stringify(owner) : undefined
}

const entityTarget = (entity: ReprintableEntity): ReprintTarget | undefined => {
  if (entity[projection]) return entity[projection]
  return typeof entity.name === 'string' &&
    entity.name.trim() &&
    typeof entity.source === 'string' &&
    entity.source.trim()
    ? { key: entity.name.trim() + '|' + entity.source.trim(), source: upper(entity.source) }
    : undefined
}

function parseTarget(
  value: string,
  kind?: 'classFeature' | 'subclassFeature',
): ReprintTarget | undefined {
  if (kind) {
    const decoded =
      kind === 'classFeature'
        ? decodeClassFeatureReference(value)
        : decodeSubclassFeatureReference(value)
    const key =
      kind === 'classFeature'
        ? getClassFeatureIdentity(decoded)
        : getSubclassFeatureIdentity(decoded)
    return key && decoded.source ? { key, source: upper(decoded.source) } : undefined
  }
  const parts = value.split('|').map((part) => part.trim())
  // Ordinary name/source/display references are not subclass or feature UIDs.
  return parts.length >= 2 && parts.length <= 3 && parts[0] && parts[1]
    ? { key: parts[0] + '|' + parts[1], source: upper(parts[1]) }
    : undefined
}

export function collectReprintableEntities(gameData: ReprintableGameData): ReprintableEntity[] {
  const classes = gameData.classes ?? []
  const featureCounts = new Map<string, number>()
  for (const feature of gameData.classFeatures ?? []) {
    const key = getClassFeatureIdentity(feature)
    if (key) featureCounts.set(key, (featureCounts.get(key) ?? 0) + 1)
  }
  const parents = new Map<string, number>()
  for (const cls of classes) {
    const key = JSON.stringify([cls.name, cls.source].map(lower))
    parents.set(key, (parents.get(key) ?? 0) + 1)
  }
  const classRows: ReprintableEntity[] = classes.map((cls) => {
    const target = entityTarget(cls)
    const conflict =
      cls.sourceIdentityConflict ||
      parents.get(JSON.stringify([cls.name, cls.source].map(lower))) !== 1
    return target && conflict ? { ...cls, [projection]: { ...target, conflict: true } } : cls
  })
  const subclasses: Array<Subclass5e & { classSource: string }> = classes.flatMap((cls) =>
    (cls.subclasses ?? []).map((subclass) => ({
      ...subclass,
      className: subclass.className || cls.name,
      classSource: subclass.classSource || cls.source,
      sourceIdentityConflict:
        cls.sourceIdentityConflict ||
        subclass.sourceIdentityConflict ||
        lower(subclass.className || cls.name) !== lower(cls.name) ||
        lower(subclass.classSource || cls.source) !== lower(cls.source) ||
        parents.get(JSON.stringify([cls.name, cls.source].map(lower))) !== 1
          ? true
          : undefined,
    })),
  )
  const byUid = new Map<string, typeof subclasses>()
  const byOwner = new Map<string, number>()
  for (const subclass of subclasses) {
    const key = getSubclassReprintKey(subclass)
    if (key) byOwner.set(key, (byOwner.get(key) ?? 0) + 1)
    if (typeof subclass.shortName !== 'string' || !subclass.shortName.trim()) continue
    const uid = JSON.stringify(
      [subclass.shortName, subclass.className, subclass.classSource, subclass.source].map(lower),
    )
    byUid.set(uid, [...(byUid.get(uid) ?? []), subclass])
  }
  const ownerRows: ReprintableEntity[] = subclasses.map((subclass) => {
    const key = getSubclassReprintKey(subclass)
    if (!key) return { name: subclass.name, source: subclass.source, reprintedAs: [] }
    const conflict = subclass.sourceIdentityConflict === true || byOwner.get(key) !== 1
    const targets: ReprintTarget[] = []
    for (const raw of Array.isArray(subclass.reprintedAs) ? subclass.reprintedAs : []) {
      if (typeof raw !== 'string') continue
      // DataUtil.class.unpackUidSubclass, pinned b906158: independent PHB defaults.
      const parts = raw.split('|').map((part) => part.trim())
      if (parts.length > 5 || !parts[0] || !parts[1]) continue
      const uid = JSON.stringify(
        [parts[0], parts[1], parts[2] || 'PHB', parts[3] || 'PHB'].map(lower),
      )
      const matches = byUid.get(uid) ?? []
      const target = matches.length === 1 ? matches[0] : undefined
      const targetKey = target && getSubclassReprintKey(target)
      if (targetKey && target && !target.sourceIdentityConflict && byOwner.get(targetKey) === 1)
        targets.push({ key: targetKey, source: upper(target.source) })
    }
    return { ...subclass, [projection]: { key, source: upper(subclass.source), targets, conflict } }
  })
  const features = [
    ...new Set([
      ...(gameData.classFeatures ?? []),
      ...classes.flatMap((cls) => [
        ...(cls.classFeatures ?? []).filter((feature) => typeof feature !== 'string'),
        ...(cls.classFeatureRefs ?? []).flatMap((ref) => (ref.feature ? [ref.feature] : [])),
        ...(cls.subclasses ?? []).flatMap((subclass) => [
          ...(subclass.subclassFeatures ?? []).filter((feature) => typeof feature !== 'string'),
          ...(subclass.subclassFeatureRefs ?? []).flatMap((ref) =>
            ref.feature ? [ref.feature] : [],
          ),
          ...(subclass.levelFeatures ?? []).flatMap((group) => group.features),
        ]),
      ]),
    ]),
  ].map((feature) => {
    const subclassKey = getSubclassFeatureIdentity(feature)
    const classKey = getClassFeatureIdentity(feature)
    const key = subclassKey ?? classKey
    return key
      ? {
          ...feature,
          [projection]: {
            key,
            source: upper(key.slice(key.lastIndexOf('|') + 1)),
            kind: subclassKey ? ('subclassFeature' as const) : ('classFeature' as const),
            conflict:
              feature.sourceIdentityConflict === true ||
              feature.featureOptionSourceConflict === true ||
              (!subclassKey && !!classKey && (featureCounts.get(classKey) ?? 0) > 1),
          },
        }
      : feature
  })
  return [
    ...(gameData.races ?? []),
    ...classRows,
    ...ownerRows,
    ...features,
    ...(gameData.backgrounds ?? []),
    ...(gameData.spells ?? []),
    ...(gameData.feats ?? []),
    ...(gameData.items ?? []),
    ...(gameData.itemsBase ?? []),
    ...(gameData.creatures ?? []),
    ...((gameData.optionalfeatures ?? []) as ReprintableEntity[]),
  ]
}

/** One current-target graph owns both preference availability and suppression. */
function resolveGraph(entities: ReprintableEntity[]) {
  const requests = new Map<ReprintableEntity, ReprintTarget[]>()
  const needed = new Set<string>()
  for (const entity of entities) {
    const metadata = entity[projection]
    const raw = entity.reprintedAs
    const targets =
      metadata?.targets ??
      (Array.isArray(raw) && raw.length
        ? raw
            .flatMap((value) =>
              typeof value === 'string' ? [parseTarget(value, metadata?.kind)] : [],
            )
            .filter((value): value is ReprintTarget => !!value)
        : [])
    if (!targets.length) continue
    const origin = entityTarget(entity)
    if (!origin) continue
    requests.set(entity, targets)
    needed.add(origin.key.toLowerCase())
    for (const target of targets) needed.add(target.key.toLowerCase())
  }
  const candidates = new Map<string, ReprintableEntity[]>()
  for (const entity of entities) {
    const target = entityTarget(entity)
    if (target) {
      const key = target.key.toLowerCase()
      if (!needed.has(key)) continue
      candidates.set(key, [...(candidates.get(key) ?? []), entity])
    }
  }
  const nodes = new Map<string, ReprintTarget>()
  const declarations = new Map<string, ReprintableEntity>()
  for (const [key, rows] of candidates) {
    if (rows.some((row) => row[projection]?.conflict || row.sourceIdentityConflict === true))
      continue
    // Parsed representation mirrors may repeat; different declarations remain ambiguous.
    if (
      rows.length > 1 &&
      !rows.every((row) => row === rows[0]) &&
      new Set(rows.map((row) => getFeatureSourceDigest([row], false))).size !== 1
    )
      continue
    nodes.set(key, entityTarget(rows[0])!)
    declarations.set(key, rows[0])
  }
  const edges = new Map<string, ReprintTarget[]>()
  const reverse = new Map<string, string[]>()
  for (const [key, entity] of declarations) {
    const targets = requests.get(entity) ?? []
    const resolved = targets
      .map((target) => ({ ...target, key: target.key.toLowerCase() }))
      .filter((target) => nodes.has(target.key) && target.key !== key)
    edges.set(key, resolved)
    for (const target of resolved)
      reverse.set(target.key, [...(reverse.get(target.key) ?? []), key])
  }
  return { nodes, edges, reverse }
}

function usableReprint(
  key: string,
  graph: ReturnType<typeof resolveGraph>,
  allowed: ReadonlySet<string>,
): boolean {
  const ancestors = new Set([key])
  const pendingAncestors = [key]
  for (let next = pendingAncestors.pop(); next !== undefined; next = pendingAncestors.pop())
    for (const parent of graph.reverse.get(next) ?? [])
      if (!ancestors.has(parent)) {
        ancestors.add(parent)
        pendingAncestors.push(parent)
      }
  const visited = new Set([key])
  const pending = [key]
  for (let next = pending.pop(); next !== undefined; next = pending.pop())
    for (const target of graph.edges.get(next) ?? []) {
      // A cycle alone cannot designate a distinct newer printing; a real exit can.
      if (!ancestors.has(target.key) && allowed.has(target.source)) return true
      if (!visited.has(target.key)) {
        visited.add(target.key)
        pending.push(target.key)
      }
    }
  return false
}

export function hasAvailableReprintPair(
  gameData: ReprintableGameData,
  effectiveSources: readonly string[],
): boolean {
  const allowed = new Set(effectiveSources.map(upper))
  const graph = resolveGraph(collectReprintableEntities(gameData))
  return [...graph.nodes].some(
    ([key, node]) => allowed.has(node.source) && usableReprint(key, graph, allowed),
  )
}

/** Suppress only when the exact current declaration reaches an available newer target. */
export function buildSuppressedKeys(
  entities: ReprintableEntity[],
  allowedSources: Set<string>,
): Set<string> {
  const allowed = new Set([...allowedSources].map(upper))
  const graph = resolveGraph(entities)
  return new Set(
    [...graph.nodes]
      .filter(([key]) => usableReprint(key, graph, allowed))
      .map(([, node]) => node.key),
  )
}
