import type { Item5e } from '@/types/5etools'
import { canonicalProficiencyName } from './classProficiencyIdentity'
import {
  assessStructuredConcreteToolProficiency,
  type ConcreteToolAssessment,
} from './concreteToolClassification'
import { getFeatureSourceDigest } from './featureSourceAudit'
import generated from './toolProficiencyCopySemantics.generated.json' with { type: 'json' }

export interface ToolCopySemanticCertificate {
  identity: [string, string]
  disposition: 'not-a-proficiency-name'
  rawDigest: string
  dependencies: Array<{ identity: [string, string]; digest: string }>
  resolvedDigest: string
}
interface ToolSourceAudit {
  version: 1
  origin: 'direct' | 'copy'
  verified: boolean
  disposition: 'proficiency-name' | 'not-a-proficiency-name' | 'unsupported'
  raw: Item5e
  rawDigest: string
  dependencies: Array<{ identity: [string, string]; digest: string; raw: Item5e }>
  resolvedDigest: string
  projectionDigest: string
  certificate?: string
  reason?: string
}
const AUDIT = 'toolProficiencySourceAudit'
const CONFLICT = 'toolProficiencySourceConflict'
const certificates = generated as ToolCopySemanticCertificate[]
const digest = (value: unknown) => getFeatureSourceDigest([value], false)!
const identity = (item: Pick<Item5e, 'name' | 'source'>): [string, string] => [
  typeof item.name === 'string' ? item.name.trim().toLowerCase() : '',
  typeof item.source === 'string' ? item.source.trim().toLowerCase() : '',
]
const key = (item: Pick<Item5e, 'name' | 'source'>) => JSON.stringify(identity(item))
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
function copyDirective(item: Item5e): Record<string, unknown> | undefined {
  const value = item._copy
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
function withoutAudit(item: Item5e) {
  const { [AUDIT]: _audit, ...source } = item
  return source
}
function readAudit(item: Item5e): ToolSourceAudit | undefined {
  const value = item[AUDIT]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const audit = value as ToolSourceAudit
  if (
    audit.version !== 1 ||
    !['direct', 'copy'].includes(audit.origin) ||
    typeof audit.verified !== 'boolean' ||
    !['proficiency-name', 'not-a-proficiency-name', 'unsupported'].includes(audit.disposition) ||
    !audit.raw ||
    typeof audit.raw !== 'object' ||
    typeof audit.raw.name !== 'string' ||
    typeof audit.raw.source !== 'string' ||
    !Array.isArray(audit.dependencies) ||
    Object.keys(audit).some(
      (field) =>
        ![
          'version',
          'origin',
          'verified',
          'disposition',
          'raw',
          'rawDigest',
          'dependencies',
          'resolvedDigest',
          'projectionDigest',
          'certificate',
          'reason',
        ].includes(field),
    ) ||
    key(audit.raw) !== key(item) ||
    digest(audit.raw) !== audit.rawDigest ||
    digest(withoutAudit(item)) !== audit.projectionDigest ||
    audit.dependencies.some(
      (row) =>
        !row ||
        typeof row !== 'object' ||
        !row.raw ||
        typeof row.raw.name !== 'string' ||
        typeof row.raw.source !== 'string' ||
        !same(identity(row.raw), row.identity) ||
        digest(row.raw) !== row.digest,
    )
  )
    return undefined
  return audit
}

export function assessToolProficiencySource(
  item: Item5e,
  semanticCertificates: readonly ToolCopySemanticCertificate[] = certificates,
): ConcreteToolAssessment {
  const audit = readAudit(item)
  if (!audit || !audit.verified)
    return {
      kind: 'unsupported',
      reason: audit?.reason ?? 'Current raw tool source evidence is unavailable',
    }
  if (audit.origin === 'direct') {
    if (
      audit.raw._copy ||
      audit.certificate ||
      audit.dependencies.length ||
      audit.rawDigest !== audit.resolvedDigest ||
      audit.disposition !== 'proficiency-name'
    )
      return { kind: 'unsupported', reason: 'Invalid direct tool evidence' }
    const name = canonicalProficiencyName(item.name)
    return name ? { kind: 'eligible', name } : { kind: 'unsupported', reason: 'Invalid tool name' }
  }
  const certificate = semanticCertificates.find((row) => digest(row) === audit.certificate)
  return certificate && hasReviewedToolCopySemantics(item, certificate)
    ? { kind: 'ineligible' }
    : { kind: 'unsupported', reason: 'Unreviewed copied tool semantics' }
}

/** Parallel raw/resolved arrays are the actual production resolver's inputs and outputs. */
function hasReviewedToolCopySemantics(
  item: Item5e,
  certificate: ToolCopySemanticCertificate,
): boolean {
  const audit = readAudit(item)
  return (
    !!audit &&
    audit.verified &&
    audit.origin === 'copy' &&
    audit.disposition === 'not-a-proficiency-name' &&
    audit.certificate === digest(certificate) &&
    same(certificate.identity, identity(item)) &&
    certificate.rawDigest === audit.rawDigest &&
    certificate.resolvedDigest === audit.resolvedDigest &&
    same(
      certificate.dependencies,
      audit.dependencies.map(({ raw: _raw, ...row }) => row),
    )
  )
}

export function prepareToolProficiencySources(
  raw: readonly Item5e[],
  resolved: readonly Item5e[],
  semanticCertificates: readonly ToolCopySemanticCertificate[] = certificates,
): Item5e[] {
  if (raw.length !== resolved.length)
    throw new RangeError('Tool source preparation requires matching resolver inputs')
  const groups = new Map<string, Item5e[]>()
  for (const item of raw) groups.set(key(item), [...(groups.get(key(item)) ?? []), item])
  return resolved.map((item, index) => {
    const structured = assessStructuredConcreteToolProficiency(item)
    const reviewedIdentity = semanticCertificates.some((row) => same(row.identity, identity(item)))
    if (structured.kind !== 'eligible' && !reviewedIdentity) return item
    const source = raw[index],
      dependencies: ToolSourceAudit['dependencies'] = []
    let reason: string | undefined
    if (
      key(source) !== key(item) ||
      (groups.get(key(source)) ?? []).length !== 1 ||
      Object.getOwnPropertyDescriptor(source, AUDIT) ||
      source[CONFLICT]
    )
      reason = 'Ambiguous or untrusted raw tool source'
    let current = source
    const seen = new Set([key(source)])
    while (!reason && current._copy) {
      const copy = copyDirective(current)
      if (
        !copy ||
        typeof copy !== 'object' ||
        Array.isArray(copy) ||
        typeof copy.name !== 'string' ||
        (copy.source !== undefined && typeof copy.source !== 'string')
      ) {
        reason = 'Unsupported tool copy dependency'
        break
      }
      const parentKey = key({
        name: copy.name,
        source: typeof copy.source === 'string' ? copy.source : current.source,
      })
      const parents = groups.get(parentKey) ?? []
      if (
        parents.length !== 1 ||
        seen.has(parentKey) ||
        seen.size > 32 ||
        parents[0][CONFLICT] ||
        Object.getOwnPropertyDescriptor(parents[0], AUDIT)
      ) {
        reason = 'Missing, ambiguous or cyclic tool copy dependency'
        break
      }
      seen.add(parentKey)
      current = parents[0]
      dependencies.push({ identity: identity(current), digest: digest(current), raw: current })
    }
    const rawDigest = digest(source),
      resolvedDigest = digest(withoutAudit(item))
    let certificate: ToolCopySemanticCertificate | undefined
    if (!reason && source._copy) {
      certificate = semanticCertificates.find(
        (row) =>
          same(row.identity, identity(source)) &&
          row.rawDigest === rawDigest &&
          row.resolvedDigest === resolvedDigest &&
          same(
            row.dependencies,
            dependencies.map(({ raw: _raw, ...row }) => row),
          ),
      )
      if (!certificate) reason = 'Unreviewed copied tool semantics'
    } else if (!reason && rawDigest !== resolvedDigest)
      reason = 'Direct tool source changed during preparation'
    const audit: ToolSourceAudit = {
      version: 1,
      origin: source._copy ? 'copy' : 'direct',
      verified: !reason,
      disposition: reason
        ? 'unsupported'
        : certificate
          ? 'not-a-proficiency-name'
          : 'proficiency-name',
      raw: source,
      rawDigest,
      dependencies,
      resolvedDigest,
      projectionDigest: resolvedDigest,
      ...(certificate ? { certificate: digest(certificate) } : {}),
      ...(reason ? { reason } : {}),
    }
    return { ...item, [AUDIT]: audit }
  })
}

const presentationFields = new Set([
  'entries',
  'additionalEntries',
  'itemEntryDiagnostics',
  'primaryItemTypeText',
  'primaryItemTypeDiagnostics',
  'itemTypeText',
])
function mechanicalFields(item: Item5e) {
  return Object.fromEntries(
    Object.entries(withoutAudit(item)).filter(([field]) => !presentationFields.has(field)),
  )
}
/** Call only around the established item-text enrichment boundary, never on a source edit. */
export function preserveToolSourcePresentation(
  before: readonly Item5e[],
  after: readonly Item5e[],
): Item5e[] {
  const originals = new Map<string, Item5e[]>()
  for (const item of before) originals.set(key(item), [...(originals.get(key(item)) ?? []), item])
  return after.map((item) => {
    const rows = originals.get(key(item)) ?? [],
      old = rows.length === 1 ? rows[0] : undefined,
      audit = old && readAudit(old)
    if (!audit) return item
    if (digest(mechanicalFields(old!)) !== digest(mechanicalFields(item)))
      return {
        ...item,
        [AUDIT]: {
          ...audit,
          verified: false,
          reason: 'Tool classification changed during presentation',
          projectionDigest: digest(withoutAudit(item)),
        },
      }
    return { ...item, [AUDIT]: { ...audit, projectionDigest: digest(withoutAudit(item)) } }
  })
}

/** Parsed-cache fallbacks restore genuine raw context; absence cannot invent a direct origin. */
export function restoreToolSourceInput(item: Item5e): Item5e {
  const audit = readAudit(item)
  if (audit) return audit.raw
  const structured = assessStructuredConcreteToolProficiency(item)
  return structured.kind === 'eligible' ? { ...item, [CONFLICT]: true } : item
}

/** Mark relevant same-layer duplicates before the existing winning-record Map collapses them. */
export function auditToolLayerMultiplicity(raw: readonly Item5e[]): Item5e[] {
  const groups = new Map<string, Item5e[]>()
  for (const row of raw) groups.set(key(row), [...(groups.get(key(row)) ?? []), row])
  const relevant = (row: Item5e, seen = new Set<string>()): boolean => {
    if (seen.has(key(row))) return true
    seen.add(key(row))
    if (assessStructuredConcreteToolProficiency(row).kind !== 'ineligible') return true
    const copy = copyDirective(row)
    return (
      !!copy &&
      typeof copy === 'object' &&
      !Array.isArray(copy) &&
      typeof copy.name === 'string' &&
      (
        groups.get(
          key({
            name: copy.name,
            source: typeof copy.source === 'string' ? copy.source : row.source,
          }),
        ) ?? []
      ).some((parent) => relevant(parent, new Set(seen)))
    )
  }
  return raw.map((row) =>
    (groups.get(key(row)) ?? []).length > 1 && relevant(row) ? { ...row, [CONFLICT]: true } : row,
  )
}
