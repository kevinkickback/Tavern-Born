import type { Spell5e } from '@/types/5etools'
import type {
  ClassSpellRoute,
  ClassSpellRouteAudit,
  SpellClassAssociation,
  SpellRouteDiagnostic,
  SpellRouteInput,
  SpellRouteLookupCandidate,
  SpellRouteOccurrence,
} from '@/types/spellRoutes'
import { featureOptionRulesSignature } from './featureRulesSignature'
import { getFeatureSourceDigest, hasFeatureSourceShape } from './featureSourceAudit'

type ObjectValue = Record<string, unknown>
type Channel = ClassSpellRoute[5]
type Target = [string, string]
const channels: Channel[] = ['class', 'classVariant']
const object = (value: unknown): ObjectValue | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as ObjectValue)
    : undefined
const own = (value: object, key: string) =>
  Object.getOwnPropertyDescriptor(value, key) !== undefined
const identity = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() && !/[|{}<>]/u.test(value)
    ? value.trim().toLowerCase()
    : undefined
const signature = (value: unknown) => featureOptionRulesSignature([value], false)
const digest = (value: unknown) => getFeatureSourceDigest([value], false) ?? ''
const keyOf = (value: unknown) => JSON.stringify(value)
const targetOf = (spell: { name?: unknown; source?: unknown }): Target | undefined => {
  const name = identity(spell.name),
    source = identity(spell.source)
  return name && source ? [name, source] : undefined
}
const clone = <T>(value: T): T => structuredClone(value)
interface PreparedLookup {
  index: Map<string, SpellRouteLookupCandidate[]>
  malformedSources: Map<string, SpellRouteLookupCandidate[]>
}
/** Prepare current aliases once per parse, before a first-match lookup can discard evidence. */
export function prepareSpellRouteLookup(lookup?: object): PreparedLookup | undefined {
  if (!lookup) return undefined
  const index = new Map<string, SpellRouteLookupCandidate[]>(),
    malformedSources = new Map<string, SpellRouteLookupCandidate[]>()
  for (const [source, names] of Object.entries(lookup)) {
    const sourceKey = identity(source)
    if (!sourceKey) continue
    const byName = object(names)
    if (!byName) {
      const rows = malformedSources.get(sourceKey) ?? []
      rows.push({ path: [source], value: clone(names) })
      malformedSources.set(sourceKey, rows)
      continue
    }
    for (const [name, value] of Object.entries(byName)) {
      const nameKey = identity(name)
      if (!nameKey) continue
      const key = keyOf([nameKey, sourceKey])
      const rows = index.get(key) ?? []
      rows.push({ path: [source, name], value: clone(value) })
      index.set(key, rows)
    }
  }
  return { index, malformedSources }
}
function lookupCandidates(lookup: PreparedLookup, target: Target): SpellRouteLookupCandidate[] {
  const result = clone([
    ...(lookup.index.get(keyOf(target)) ?? []),
    ...(lookup.malformedSources.get(target[1]) ?? []),
  ])
  return result.sort((a, b) => keyOf(a.path).localeCompare(keyOf(b.path)))
}

interface Producer {
  alternatives: Array<string | null> | null
  path: string
}
interface Group {
  owner: Target
  channel: Channel
  producers: Producer[]
  labels: Map<string, SpellClassAssociation[]>
}
interface Decoded {
  routes: ClassSpellRoute[]
  diagnostics: SpellRouteDiagnostic[]
  labels: Map<string, SpellClassAssociation>
}

/** Adapted from 5etools _mutSpell_class; strict decoding precedes its OR expansion. */
function alternatives(value: unknown): Array<string | null> | null {
  if (value === true) return [null]
  const row = object(value)
  if (!row || Object.keys(row).length !== 1) return null
  if (own(row, 'definedInSource')) {
    const source = identity(row.definedInSource)
    return source ? [source] : null
  }
  if (
    !own(row, 'definedInSources') ||
    !Array.isArray(row.definedInSources) ||
    !row.definedInSources.length
  )
    return null
  const values = row.definedInSources.map((value) => (value === null ? null : identity(value)))
  if (values.some((value) => value === undefined)) return null
  return [...new Set(values as Array<string | null>)].sort((a, b) =>
    keyOf(a).localeCompare(keyOf(b)),
  )
}

function decode(target: Target, input: SpellRouteInput): Decoded {
  const groups = new Map<string, Group>()
  const diagnostics: SpellRouteDiagnostic[] = []
  const groupFor = (name: unknown, source: unknown, channel: Channel, path: string) => {
    const n = identity(name),
      s = identity(source)
    if (!n || !s) {
      diagnostics.push({ code: 'invalid-owner', path })
      return undefined
    }
    const id = keyOf([n, s, channel])
    let group = groups.get(id)
    if (!group) {
      group = { owner: [n, s], channel, producers: [], labels: new Map() }
      groups.set(id, group)
    }
    return group
  }
  const remember = (
    group: Group,
    name: string,
    source: string,
    values: Array<string | null>,
    raw: unknown,
  ) => {
    const predicate = object(raw)
    for (const value of values) {
      const labels = group.labels.get(keyOf(value)) ?? []
      const rawValues =
        predicate && Array.isArray(predicate.definedInSources)
          ? predicate.definedInSources
          : [predicate?.definedInSource]
      const display = rawValues
        .filter((entry): entry is string => typeof entry === 'string' && identity(entry) === value)
        .sort()[0]
      labels.push({
        name: name.trim(),
        source: source.trim(),
        ...(value !== null && display ? { definedInSource: display.trim() } : {}),
      })
      group.labels.set(keyOf(value), labels)
    }
  }
  if (input.lookup.kind === 'present')
    for (const candidate of input.lookup.candidates) {
      const rootPath = keyOf(candidate.path),
        root = object(candidate.value)
      if (candidate.path.length !== 2 || !root) {
        diagnostics.push({ code: 'invalid-lookup-container', path: rootPath })
        continue
      }
      for (const channel of channels) {
        if (!own(root, channel)) continue
        const sources = object(root[channel])
        if (!sources) {
          diagnostics.push({ code: 'invalid-channel', path: rootPath + '/' + channel })
          continue
        }
        for (const [source, names] of Object.entries(sources)) {
          const owners = object(names)
          if (!owners) {
            diagnostics.push({
              code: 'invalid-owner-map',
              path: rootPath + '/' + channel + '/' + source,
            })
            continue
          }
          for (const [name, predicate] of Object.entries(owners)) {
            const path = rootPath + '/' + channel + '/' + source + '/' + name
            const group = groupFor(name, source, channel, path)
            if (!group) continue
            const values = alternatives(predicate)
            group.producers.push({ alternatives: values, path })
            if (values) remember(group, name, source, values, predicate)
          }
        }
      }
    }
  if (input.embedded.kind === 'present') {
    const root = object(input.embedded.value)
    if (!root) diagnostics.push({ code: 'invalid-embedded-container', path: 'classes' })
    else
      for (const channel of channels) {
        const field = channel === 'class' ? 'fromClassList' : 'fromClassListVariant'
        if (!own(root, field)) continue
        const rows = root[field]
        if (!Array.isArray(rows)) {
          diagnostics.push({ code: 'invalid-channel', path: 'classes/' + field })
          continue
        }
        const embedded = new Map<
          Group,
          { values: Set<string | null>; invalid: boolean; path: string }
        >()
        rows.forEach((value, index) => {
          const path = 'classes/' + field + '/' + index,
            row = object(value)
          const group = groupFor(row?.name, row?.source, channel, path)
          if (!group || !row) return
          const producer = embedded.get(group) ?? {
            values: new Set<string | null>(),
            invalid: false,
            path,
          }
          const predicate = Object.fromEntries(
            Object.entries(row).filter(([key]) => key !== 'name' && key !== 'source'),
          )
          const values = Object.keys(predicate).length ? alternatives(predicate) : [null]
          if (!values) producer.invalid = true
          else {
            if (values.some((item) => producer.values.has(item))) {
              producer.invalid = true
              diagnostics.push({
                code: 'duplicate-embedded-alternative',
                path,
                group: [...group.owner, channel],
              })
            }
            values.forEach((item) => {
              producer.values.add(item)
            })
            remember(group, row.name as string, row.source as string, values, predicate)
          }
          embedded.set(group, producer)
        })
        for (const [group, producer] of embedded)
          group.producers.push({
            path: producer.path,
            alternatives: producer.invalid
              ? null
              : [...producer.values].sort((a, b) => keyOf(a).localeCompare(keyOf(b))),
          })
      }
  }
  const routes: ClassSpellRoute[] = [],
    labels = new Map<string, SpellClassAssociation>()
  for (const group of groups.values()) {
    const first = group.producers[0]?.alternatives
    const bad = group.producers.find((row) => row.alternatives === null)
    const conflict = group.producers.find((row) => keyOf(row.alternatives) !== keyOf(first))
    if (!first || bad || conflict) {
      diagnostics.push({
        code: bad ? 'invalid-predicate' : 'producer-conflict',
        path: (bad ?? conflict ?? group.producers[0]).path,
        group: [...group.owner, group.channel],
      })
      continue
    }
    for (const value of first) {
      const route: ClassSpellRoute = [
        'classSpellRoute',
        ...target,
        ...group.owner,
        group.channel,
        value,
      ]
      routes.push(route)
      const label = group.labels
        .get(keyOf(value))
        ?.sort((a, b) => keyOf(a).localeCompare(keyOf(b)))[0]
      if (label) labels.set(keyOf(route), label)
    }
  }
  if (input.targetOccurrences.length > 1) {
    routes.length = 0
    diagnostics.push({ code: 'ambiguous-target', path: keyOf(target) })
  }
  routes.sort((a, b) => keyOf(a).localeCompare(keyOf(b)))
  diagnostics.sort((a, b) => keyOf(a).localeCompare(keyOf(b)))
  return { routes, diagnostics, labels }
}

const routingDigest = (target: Target, input: Pick<SpellRouteInput, 'embedded' | 'lookup'>) =>
  digest({ target, embedded: input.embedded, lookup: input.lookup })
function build(target: Target, input: SpellRouteInput): ClassSpellRouteAudit {
  const { routes, diagnostics } = decode(target, input)
  return {
    version: 1,
    kind: 'class-spell-routes',
    target,
    input,
    sourceDigest: digest({ version: 1, kind: 'class-spell-routes', target, input }),
    sourceRoutes: routes,
    diagnostics,
  }
}
const auditFields = new Set([
  'version',
  'kind',
  'target',
  'input',
  'sourceDigest',
  'sourceRoutes',
  'diagnostics',
])
const inputFields = new Set(['origin', 'embedded', 'lookup', 'targetOccurrences'])
function validated(spell: Spell5e): ClassSpellRouteAudit | undefined {
  const target = targetOf(spell),
    value = object(spell.classSpellRouteSource)
  if (
    !target ||
    !value ||
    !hasFeatureSourceShape(value, auditFields) ||
    value.version !== 1 ||
    value.kind !== 'class-spell-routes' ||
    signature(value.target) !== signature(target)
  )
    return undefined
  const raw = object(value.input)
  if (
    !raw ||
    !hasFeatureSourceShape(raw, inputFields) ||
    typeof raw.origin !== 'string' ||
    !raw.origin ||
    !Array.isArray(raw.targetOccurrences) ||
    !raw.targetOccurrences.length
  )
    return undefined
  const embedded = object(raw.embedded),
    lookup = object(raw.lookup)
  if (!embedded || !lookup) return undefined
  if (
    embedded.kind === 'absent'
      ? Object.keys(embedded).length !== 1
      : embedded.kind !== 'present' || !own(embedded, 'value') || Object.keys(embedded).length !== 2
  )
    return undefined
  if (
    lookup.kind === 'absent'
      ? Object.keys(lookup).length !== 1
      : lookup.kind !== 'present' ||
        !Array.isArray(lookup.candidates) ||
        Object.keys(lookup).length !== 2
  )
    return undefined
  if (
    lookup.kind === 'present' &&
    (lookup.candidates as unknown[]).some((item) => {
      const row = object(item)
      return (
        !row ||
        Object.keys(row).length !== 2 ||
        !Array.isArray(row.path) ||
        !row.path.every((part) => typeof part === 'string') ||
        !own(row, 'value') ||
        row.path.length < 1 ||
        row.path.length > 2 ||
        identity(row.path[0]) !== target[1] ||
        (row.path.length === 2 && identity(row.path[1]) !== target[0])
      )
    })
  )
    return undefined
  const input = raw as unknown as SpellRouteInput
  if (
    input.targetOccurrences.some(
      (row) =>
        !object(row) ||
        Object.keys(row).length !== 3 ||
        typeof row.origin !== 'string' ||
        !row.origin ||
        typeof row.rowPath !== 'string' ||
        !row.rowPath ||
        typeof row.routingInputDigest !== 'string' ||
        !/^[0-9a-f]{64}$/u.test(row.routingInputDigest),
    )
  )
    return undefined
  if (
    !input.targetOccurrences.some(
      (row) =>
        row.origin === input.origin && row.routingInputDigest === routingDigest(target, input),
    )
  )
    return undefined
  const rebuilt = build(target, input)
  return signature(rebuilt) === signature(value) ? rebuilt : undefined
}

function project<T extends Spell5e>(
  spell: T,
  audit: ClassSpellRouteAudit | undefined,
  sources?: readonly string[],
  current?: ReadonlySet<string | undefined>,
): T {
  const classes = clone(object(spell.classes) ?? {}) as NonNullable<Spell5e['classes']>
  const allowed = sources?.length
    ? new Set(sources.map((value) => value.trim().toLowerCase()))
    : undefined
  const routes =
    audit?.sourceRoutes.filter(
      (row) =>
        (!current || current.has(signature(row))) &&
        (!allowed ||
          [row[2], row[4], ...(row[6] === null ? [] : [row[6]])].every((source) =>
            allowed.has(source),
          )),
    ) ?? []
  const decoded = audit ? decode(audit.target, audit.input) : undefined
  classes.fromClassList = []
  classes.fromClassListVariant = []
  for (const route of routes) {
    const label = decoded?.labels.get(keyOf(route))
    if (label)
      (route[5] === 'class' ? classes.fromClassList : classes.fromClassListVariant).push(
        clone(label),
      )
  }
  return {
    ...spell,
    classes,
    classSpellRoutes: routes,
    classSpellRouteDiagnostics: audit?.diagnostics ?? [
      { code: 'invalid-package', path: 'classSpellRouteSource' },
    ],
    ...(audit ? { classSpellRouteSource: audit } : {}),
  }
}

/** Lookup/layer reads preserve the current view; only explicit source filtering restores it. */
function preserveCurrentRoutes<T extends Spell5e>(spell: T): T {
  if (!own(spell, 'classSpellRouteSource')) return spell
  const audit = validated(spell)
  if (!audit || !own(spell, 'classSpellRoutes')) return project(spell, audit)
  const supported = new Set(audit.sourceRoutes.map(signature))
  const current = spell.classSpellRoutes
  const malformed =
    !Array.isArray(current) ||
    current.some(
      (row) =>
        !Array.isArray(row) ||
        (row[6] !== null && typeof row[6] !== 'string') ||
        !supported.has(signature(row)),
    )
  const result = project(spell, audit, undefined, new Set(malformed ? [] : current.map(signature)))
  if (
    malformed ||
    (Array.isArray(spell.classSpellRouteDiagnostics) &&
      spell.classSpellRouteDiagnostics.some(
        (row) => row?.code === 'invalid-current-view' && row.path === 'classSpellRoutes',
      ))
  )
    result.classSpellRouteDiagnostics = [
      ...audit.diagnostics,
      { code: 'invalid-current-view', path: 'classSpellRoutes' },
    ]
  return result
}

/** Parsed production rows always own a source package; prior derived output cannot self-certify. */
export function parseSpellRouteSource<T extends Spell5e>(
  spell: T,
  origin: string,
  rowPath: string,
  lookup?: PreparedLookup,
): T {
  const target = targetOf(spell)
  const existing = own(spell, 'classSpellRouteSource')
  const previous = existing ? validated(spell) : undefined
  if (!target || (existing && !previous)) return project(spell, undefined)
  if (previous && lookup === undefined) return project(spell, previous)
  const embedded =
    previous?.input.embedded ??
    (own(spell, 'classes')
      ? { kind: 'present' as const, value: clone(spell.classes) }
      : { kind: 'absent' as const })
  const input: SpellRouteInput = {
    origin: previous?.input.origin ?? origin,
    embedded,
    lookup:
      lookup === undefined
        ? { kind: 'absent' }
        : { kind: 'present', candidates: lookupCandidates(lookup, target) },
    targetOccurrences: [],
  }
  input.targetOccurrences = previous?.input.targetOccurrences.map((row) =>
    row.origin === previous.input.origin &&
    row.routingInputDigest === routingDigest(target, previous.input)
      ? { ...row, routingInputDigest: routingDigest(target, input) }
      : row,
  ) ?? [{ origin: input.origin, rowPath, routingInputDigest: routingDigest(target, input) }]
  const audit = build(target, input)
  return project(spell, audit)
}

/** One multiplicity boundary shared by document, cross-file, layer and direct lookup callers. */
export function auditSpellRouteMultiplicity<T extends Spell5e>(
  spells: T[],
  origin = 'spell-layer',
): T[] {
  spells = spells.map(preserveCurrentRoutes)
  const groups = new Map<string, Array<{ spell: T; index: number }>>()
  spells.forEach((spell, index) => {
    const target = targetOf(spell)
    if (!target) return
    const key = keyOf(target),
      rows = groups.get(key) ?? []
    rows.push({ spell, index })
    groups.set(key, rows)
  })
  const replacements = new Map<T, T>()
  for (const rows of groups.values()) {
    if (rows.length < 2) continue
    const witnesses = new Map<string, SpellRouteOccurrence>()
    const parsed = rows.map(({ spell, index }) =>
      own(spell, 'classSpellRouteSource')
        ? spell
        : parseSpellRouteSource(spell, origin + '#' + index, String(index)),
    )
    for (const spell of parsed)
      for (const witness of validated(spell)?.input.targetOccurrences ?? [])
        witnesses.set(keyOf(witness), witness)
    // Repeated views retain existing context; distinct physical duplicate positions still count.
    while (witnesses.size < rows.length) {
      const index = witnesses.size,
        witness = {
          origin: origin + '#duplicate',
          rowPath: String(index),
          routingInputDigest: digest([rows[index].spell.name, rows[index].spell.source, index]),
        }
      witnesses.set(keyOf(witness), witness)
    }
    const occurrences = [...witnesses.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b)))
    parsed.forEach((spell, index) => {
      const audit = validated(spell)
      replacements.set(
        rows[index].spell,
        audit
          ? project(spell, build(audit.target, { ...audit.input, targetOccurrences: occurrences }))
          : project(spell, undefined),
      )
    })
  }
  return spells.map((spell) => replacements.get(spell) ?? spell)
}

/** Restore from immutable winning evidence, never from a previously pruned compatibility list. */
export function filterSpellRouteSources<T extends Spell5e>(
  spell: T,
  sources?: readonly string[],
): T {
  if (!own(spell, 'classSpellRouteSource')) return spell
  return project(spell, validated(spell), sources)
}
