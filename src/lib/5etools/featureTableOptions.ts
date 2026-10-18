import type { ClassFeature } from '@/types/5etools'
import type {
  ClassChoiceDiagnostic,
  NormalizedCharacterChoice,
  NormalizedChoiceOptionReference,
} from '@/types/classRules'
import { decodeSubclassFeatureReference, getSubclassFeatureIdentity } from './classFeatureIdentity'
import { DAMAGE_TYPE_LABELS } from './constants'
import {
  canonicalFeatureOptionParent,
  decodeFeatureOptionReference,
  encodeFeatureOptionReference,
  getFeatureOptionChoiceId,
  normalizeFeatureOptionPart,
} from './featureOptionIdentity'
import { featureOptionRulesSignature } from './featureRulesSignature'
import { STORM_TARGETS } from './stormAuraIdentity'
import { isAuditedStormFeature } from './stormAuraSource'
import type { UnconditionalFeatureReference } from './unconditionalFeatureReferences'

export const DRAGON_ANCESTOR_REF = 'Dragon Ancestor|Sorcerer|PHB|Draconic|PHB|1|PHB'
export const ELEMENTAL_AFFINITY_REF = 'Elemental Affinity|Sorcerer|PHB|Draconic|PHB|6|PHB'
const AFFINITY_TARGET = getSubclassFeatureIdentity(
  decodeSubclassFeatureReference(ELEMENTAL_AFFINITY_REF),
)!
const DRAGON_TARGET = getSubclassFeatureIdentity(
  decodeSubclassFeatureReference(DRAGON_ANCESTOR_REF),
)!
const DAMAGE_TYPES = new Set(Object.values(DAMAGE_TYPE_LABELS).map(normalizeFeatureOptionPart))

export interface FeatureTableOption {
  name: string
  source: string
  ref: string
  damageType: string
  entries: unknown[]
}

export interface FeatureTableDefinition {
  parentRef: string
  target: string
  table: string
  rows: FeatureTableOption[]
  signature: string
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

export { featureOptionRulesSignature } from './featureRulesSignature'

/** Audit materialized source records before first-match enrichment can hide a conflicting producer. */
export function auditFeatureOptionSources(
  records: Record<string, unknown>[],
): Record<string, unknown>[] {
  const signatures = new Map<string, Set<string | undefined>>()
  const audited = new Set([DRAGON_TARGET, AFFINITY_TARGET, ...STORM_TARGETS])
  const unverified = new Set<string>()
  const cleaned = records.map((source) => {
    const { featureOptionSourceConflict: _derived, ...feature } = source
    const target = getSubclassFeatureIdentity(feature)
    if (target && STORM_TARGETS.has(target) && !isAuditedStormFeature(feature))
      unverified.add(target)
    if (target && audited.has(target)) {
      const values = signatures.get(target) ?? new Set<string | undefined>()
      values.add(
        Array.isArray(feature.entries) ? featureOptionRulesSignature(feature.entries) : undefined,
      )
      signatures.set(target, values)
    }
    return feature
  })
  return cleaned.map((feature) => {
    const target = getSubclassFeatureIdentity(feature)
    const values = target ? signatures.get(target) : undefined
    return values &&
      (values.has(undefined) || values.size > 1 || (target !== undefined && unverified.has(target)))
      ? { ...feature, featureOptionSourceConflict: true }
      : feature
  })
}

function cellText(value: unknown): string | undefined {
  const cell = record(value)
  const entry = cell?.type === 'cell' ? cell.entry : value
  if (typeof entry !== 'string' || !entry.trim()) return undefined
  return entry.includes('{@') ? undefined : entry.trim()
}

function damageCell(value: unknown): string | undefined {
  const wrapper = record(value)
  const raw = wrapper?.type === 'cell' ? wrapper.entry : value
  if (typeof raw !== 'string') return undefined
  let label = raw.trim()
  if (label.startsWith('{@')) {
    const match = /^\{@filter ([^|{}]+)\|spells\|([^{}]+)\}$/i.exec(label)
    if (!match) return undefined
    const damage = match[2].split('|').filter((part) => /^damage type=/i.test(part))
    if (
      damage.length !== 1 ||
      normalizeFeatureOptionPart(damage[0].slice('damage type='.length)) !==
        normalizeFeatureOptionPart(match[1])
    )
      return undefined
    label = match[1].trim()
  }
  return DAMAGE_TYPES.has(normalizeFeatureOptionPart(label)) ? label : undefined
}

// Row/cell wrappers follow Renderer._renderTable in 5etools b9061583; choice semantics are app-specific.
/** This audited adapter supplies a count only for the exact source-backed choose-one declaration. */
export function getFeatureTableDefinition(
  feature: ClassFeature | undefined,
): FeatureTableDefinition | undefined {
  if (
    !feature ||
    feature.featureOptionSourceConflict ||
    getSubclassFeatureIdentity(feature) !== DRAGON_TARGET ||
    !Array.isArray(feature.entries)
  )
    return undefined
  const signature = featureOptionRulesSignature(feature.entries)
  if (!signature?.toLowerCase().includes('you choose one type of dragon as your ancestor'))
    return undefined
  const tables = feature.entries.filter((entry) => {
    const table = record(entry)
    return (
      table?.type === 'table' &&
      typeof table.caption === 'string' &&
      normalizeFeatureOptionPart(table.caption) === 'draconic ancestry'
    )
  })
  if (tables.length !== 1) return undefined
  const table = record(tables[0])!
  if (
    !Array.isArray(table.colLabels) ||
    table.colLabels.length !== 2 ||
    normalizeFeatureOptionPart(cellText(table.colLabels[0]) ?? '') !== 'dragon' ||
    normalizeFeatureOptionPart(cellText(table.colLabels[1]) ?? '') !== 'damage type' ||
    !Array.isArray(table.rows) ||
    table.rows.length === 0
  )
    return undefined
  const rows: FeatureTableOption[] = []
  const seen = new Set<string>()
  const parent = canonicalFeatureOptionParent(DRAGON_ANCESTOR_REF, 'subclassFeature')!
  for (const raw of table.rows) {
    const wrapper = record(raw)
    const row = wrapper?.type === 'row' ? wrapper.row : raw
    if (!Array.isArray(row) || row.length !== 2) return undefined
    const name = cellText(row[0])
    const damageType = damageCell(row[1])
    if (!name || !damageType || !DAMAGE_TYPES.has(normalizeFeatureOptionPart(damageType)))
      return undefined
    const key = normalizeFeatureOptionPart(name)
    if (seen.has(key)) return undefined
    seen.add(key)
    rows.push({
      name,
      source: parent.source,
      ref: encodeFeatureOptionReference(
        { kind: 'subclassFeature', ref: parent.ref },
        'Draconic Ancestry',
        key,
      ),
      damageType,
      entries: [`Damage type: ${damageType}`],
    })
  }
  return {
    parentRef: parent.ref,
    target: DRAGON_TARGET,
    table: 'draconic ancestry',
    rows,
    signature,
  }
}

/** Repeated references/equivalent copies agree; conflicting or incomplete producers do not. */
export function resolveFeatureTableDefinition(
  candidates: readonly (ClassFeature | undefined)[],
): FeatureTableDefinition | undefined {
  if (candidates.length === 0) return undefined
  let definition: FeatureTableDefinition | undefined
  for (const candidate of candidates) {
    const next = getFeatureTableDefinition(candidate)
    if (!next || (definition && next.signature !== definition.signature)) return undefined
    definition = next
  }
  return definition
}

export function resolveFeatureTableOption(
  option: NormalizedChoiceOptionReference,
  candidates: readonly (ClassFeature | undefined)[],
  cache?: Map<string, FeatureTableDefinition | undefined>,
): FeatureTableOption | undefined {
  const target = decodeFeatureOptionReference(option)
  if (
    !target ||
    target.format === 'source-group' ||
    target.kind !== 'subclassFeature' ||
    target.parentIdentity !== DRAGON_TARGET
  )
    return undefined
  const definition = cache?.has(target.parentIdentity)
    ? cache.get(target.parentIdentity)
    : resolveFeatureTableDefinition(candidates)
  cache?.set(target.parentIdentity, definition)
  return definition?.table === target.table
    ? definition.rows.find((row) => normalizeFeatureOptionPart(row.name) === target.row)
    : undefined
}

/** Shared diagnostics and literal choices consume the same unconditional earned declarations. */
export function normalizeFeatureTableChoices(
  owner: NormalizedCharacterChoice['owner'],
  declarations: readonly UnconditionalFeatureReference[],
): { choices: NormalizedCharacterChoice[]; diagnostics: ClassChoiceDiagnostic[] } {
  const matching = declarations.filter((entry) => entry.target === DRAGON_TARGET)
  if (matching.length === 0) return { choices: [], diagnostics: [] }
  const level = Math.min(...matching.map((entry) => entry.level))
  const definition = resolveFeatureTableDefinition(matching.map((entry) => entry.reference.feature))
  if (!definition) {
    return {
      choices: [],
      diagnostics: [
        {
          code: 'unverified-required-choice',
          className: owner.name,
          classSource: owner.source,
          ...(owner.subclassName
            ? { subclassName: owner.subclassName, subclassSource: owner.subclassSource }
            : {}),
          featureName: 'Dragon Ancestor',
          level,
          message:
            'Dragon Ancestor has known required setup, but its exact source declaration is unavailable, conflicting or changed. Restore or verify the source; this setup cannot be confirmed.',
          requiredChoice: {
            target: {
              entityType: 'subclassFeature',
              ref: DRAGON_ANCESTOR_REF,
              name: 'Dragon Ancestor',
              source: 'PHB',
            },
          },
        },
      ],
    }
  }
  return {
    choices: [
      {
        id: getFeatureOptionChoiceId(owner, definition.target, definition.table, level),
        label: 'Dragon Ancestor',
        kind: 'feature-option',
        owner: { ...owner, featureName: 'Dragon Ancestor', featureSource: 'PHB' },
        level,
        minimumSelections: 1,
        maximumSelections: 1,
        selectionCountByLevel: Array.from({ length: 20 }, (_, index) =>
          index + 1 >= level ? 1 : 0,
        ),
        options: definition.rows.map((row) => ({
          entityType: 'featureOption',
          name: row.name,
          source: row.source,
          ref: row.ref,
        })),
        repeatable: false,
        replacement: { cadence: 'never' },
        source: {
          kind: 'class-feature-options',
          field: `${definition.parentRef}:table:${definition.table}`,
        },
      },
    ],
    diagnostics: [],
  }
}
