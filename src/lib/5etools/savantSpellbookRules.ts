import { normalizeOwnerIdentity as norm } from '@/lib/provenance/normalization'
import type { Class5e, SubclassFeature } from '@/types/5etools'
import type { CharacterClassEntry } from '@/types/character'
import type { ManagedClassSpellSlot } from '@/types/classCasting'
import {
  decodeClassFeatureReference,
  getClassFeatureIdentity,
  getClassFeatureReferenceLevel,
  getSubclassFeatureIdentity,
} from './classFeatureIdentity'
import { getParsedClassSpellSlotProgression } from './classSpellSlotTable'
import { getFeatureSourceDigest, hasFeatureSourceShape } from './featureSourceAudit'
import {
  decodeOptionalDeclaration,
  exactOptionalDeclarationReference,
} from './optionalClassDeclarationStructure'
import { collectSubclassProficiencyPaths } from './subclassProficiencyCertificates'

const owner = ['subclass', 'wizard', 'xphb', 'evoker', 'xphb'] as const
const featureName = 'Evocation Savant'
const target = 'subclass-feature|evocation savant|wizard|xphb|evoker|xphb|3|xphb'
const introduction = 'Evoker|Wizard|XPHB|Evoker|XPHB|3'
const featureBody = '1c607a61f4c1e4c58d28fcd0a7b1468056d0c513925b014991a3a52aaa39aaf3'
const featureFields = new Set([
  'name',
  'source',
  'className',
  'classSource',
  'subclassShortName',
  'subclassSource',
  'level',
  'entries',
  'page',
  'header',
  'srd52',
  'basicRules2024',
  'featureOptionSourceConflict',
])

// Finite addresses preserve source-free admission and rollback even for empty slots.
// Current entitlement still requires the authored schedule and class slot table below.
const earned = Array.from({ length: 8 }, (_, index) => ({
  level: index * 2 + 3,
  count: index === 0 ? 2 : 1,
  tier: index + 2,
}))

export function getSavantSpellbookGain(slot: ManagedClassSpellSlot) {
  if (
    !Array.isArray(slot) ||
    slot.length !== 5 ||
    !Array.isArray(slot[0]) ||
    slot[0].length !== owner.length ||
    !owner.every((part, index) => slot[0][index] === part) ||
    slot[1] !== 'class-spellbook' ||
    slot[2] !== target ||
    !Number.isInteger(slot[4]) ||
    slot[4] < 0
  )
    return undefined
  return earned.find((gain) => gain.level === slot[3] && slot[4] < gain.count)
}

export function getSavantSpellbookSlots(entry: CharacterClassEntry): ManagedClassSpellSlot[] {
  if (
    norm(entry.name) !== owner[1] ||
    norm(entry.source) !== owner[2] ||
    norm(entry.subclass) !== owner[3] ||
    norm(entry.subclassSource) !== owner[4]
  )
    return []
  return earned.flatMap((gain) =>
    gain.level <= entry.levels
      ? Array.from(
          { length: gain.count },
          (_, ordinal): ManagedClassSpellSlot => [
            [...owner],
            'class-spellbook',
            target,
            gain.level,
            ordinal,
          ],
        )
      : [],
  )
}

type SavantCatalog = {
  subclassFeatures: readonly SubclassFeature[]
  subclassFeatureCandidates?: ReadonlyMap<string, readonly SubclassFeature[]>
}

type RecordValue = Record<string, unknown>
const record = (value: unknown): RecordValue | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : undefined

function readFilter(value: unknown, tier: number) {
  const row = record(value)
  if (!row || Object.keys(row).length !== 1 || typeof row.choose !== 'string') return undefined
  const clauses = row.choose.split('|')
  const parts = new Map<string, string>()
  for (const clause of clauses) {
    const [field, content, extra] = clause.split('=')
    if (!content || extra !== undefined || parts.has(field)) return undefined
    parts.set(field, content)
  }
  const authored = parts.get('level')?.split(';')
  // Wizard spellbooks contain level 1+ spells. The upstream filter also contains 0.
  const levels = authored?.[0] === '0' ? authored.slice(1) : authored
  const className = parts.get('class')
  const school = parts.get('school')
  if (
    parts.size !== 3 ||
    !levels ||
    !className ||
    !school ||
    norm(className) !== 'wizard' ||
    levels.length !== tier ||
    levels.some((level, index) => level !== String(index + 1)) ||
    !/^[ACDEINVT]$/.test(school)
  )
    return undefined
  return { classes: [className], school, levels: levels.map(Number) }
}

/** Confirm the exact current subclass and its linked Savant declaration before reading grants. */
export function getCurrentSavantSpellbookGrant(
  slot: ManagedClassSpellSlot,
  cls: Class5e,
  catalogs: SavantCatalog,
) {
  const gain = getSavantSpellbookGain(slot)
  if (
    !gain ||
    cls.sourceIdentityConflict ||
    cls._copy ||
    norm(cls.name) !== owner[1] ||
    norm(cls.source) !== owner[2]
  )
    return undefined
  const boundaries = (cls.classFeatureRefs ?? []).filter((row) => row.gainSubclassFeature)
  const levels = boundaries.map(getClassFeatureReferenceLevel)
  const first = boundaries[levels.indexOf(3)]
  const firstTarget = 'class-feature|wizard subclass|wizard|xphb|3|xphb'
  if (
    levels.some((level) => level === undefined || level < 3) ||
    levels.filter((level) => level === 3).length !== 1 ||
    !first?.feature ||
    first.feature.sourceIdentityConflict ||
    getClassFeatureIdentity(decodeClassFeatureReference(first.ref)) !== firstTarget ||
    getClassFeatureIdentity(first.feature) !== firstTarget ||
    !exactOptionalDeclarationReference(first as unknown as RecordValue, first.ref, 'classFeature')
  )
    return undefined
  const matches = cls.subclasses?.filter(
    (row) =>
      norm(row.name) === owner[3] &&
      norm(row.source) === owner[4] &&
      norm(row.className) === owner[1] &&
      norm(row.classSource) === owner[2],
  )
  const subclass = matches?.length === 1 ? matches[0] : undefined
  if (
    !subclass ||
    subclass.sourceIdentityConflict ||
    subclass._copy ||
    norm(subclass.shortName) !== owner[3] ||
    subclass.subclassFeatures?.filter((ref) => ref === introduction).length !== 1
  )
    return undefined

  const matchesFeature = (row: SubclassFeature, key: string, signature: string) =>
    !row.sourceIdentityConflict &&
    !row.featureOptionSourceConflict &&
    !row.isClassFeatureVariant &&
    !row._copy &&
    getSubclassFeatureIdentity(row) === key &&
    getFeatureSourceDigest([row]) === signature
  const resolve = (key: string) => {
    const candidates = catalogs.subclassFeatureCandidates
      ? (catalogs.subclassFeatureCandidates.get(key) ?? [])
      : catalogs.subclassFeatures.filter((row) => getSubclassFeatureIdentity(row) === key)
    const first = candidates[0]
    const signature = first && getFeatureSourceDigest([first])
    // Filtering creates equivalent reference and level views of the same raw producer.
    // Raw duplicate declarations are marked as conflicts before those views are built.
    return signature && candidates.every((row) => matchesFeature(row, key, signature))
      ? first
      : undefined
  }
  const paths = collectSubclassProficiencyPaths(
    subclass.subclassFeatureRefs ?? [],
    resolve,
    (key, attached) => {
      const current = resolve(key)
      const signature = current && getFeatureSourceDigest([current])
      return !!signature && matchesFeature(attached, key, signature)
    },
  )
  const declarations = paths.filter((path) => path.target === target)
  const declaration = declarations.length === 1 ? declarations[0] : undefined
  const feature = resolve(target)
  if (
    !declaration ||
    declaration.level !== 3 ||
    declaration.refs.length !== 2 ||
    declaration.refs[0] !== introduction ||
    decodeOptionalDeclaration(declaration.refs[1], 'subclassFeature')?.target !== target ||
    !feature ||
    !hasFeatureSourceShape(feature, featureFields) ||
    getFeatureSourceDigest(feature.entries ?? [], false) !== featureBody
  )
    return undefined

  const blocks = subclass.additionalSpells
  const block = Array.isArray(blocks) && blocks.length === 1 ? record(blocks[0]) : undefined
  const schedule = record(block?.known)
  const table = getParsedClassSpellSlotProgression(cls)
  if (
    !block ||
    Object.keys(block).length !== 1 ||
    !schedule ||
    !table ||
    Object.keys(schedule).length !== earned.length
  )
    return undefined

  // Corroborate every authored gain against the class's own spell tiers, not multiclass slots.
  const tierAt = (level: number) =>
    table[level - 1]?.reduce((tier, count, index) => (count > 0 ? index + 1 : tier), 0) ?? 0
  for (const row of earned) {
    const choices = schedule[String(row.level)]
    if (
      !Array.isArray(choices) ||
      choices.length !== row.count ||
      tierAt(row.level) !== row.tier ||
      tierAt(row.level - 1) !== row.tier - 1 ||
      choices.some((choice) => readFilter(choice, row.tier)?.school !== 'V')
    )
      return undefined
  }
  const choices = schedule[String(gain.level)]
  if (!Array.isArray(choices)) return undefined
  const filter = readFilter(choices[slot[4]], gain.tier)
  return filter && { ...filter, name: featureName }
}

export const getSavantSpellbookLabel = (slot: ManagedClassSpellSlot) =>
  getSavantSpellbookGain(slot) ? featureName : undefined
