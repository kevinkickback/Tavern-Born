import {
  itemFilterIncludesMagicItems,
  matchesClassChoiceFilter,
} from '@/lib/character/classChoiceFilters'
import { normalizeKey } from '@/lib/provenance/normalization'
import { computeGameDataFingerprint } from '@/lib/storage/dataCache'
import type { CatalogResourceProof, DataSourceConfig, GameData, Item5e } from '@/types/5etools'
import type { NormalizedChoiceOptionFilter } from '@/types/classRules'
import type { PreparedCatalog } from './catalogCandidate'
import { parseFilterTags } from './choiceFilterTags'
import { buildItemTypeLookup } from './lookups'
import { buildItemLookup } from './startingEquipment'

type External = Exclude<DataSourceConfig, { type: 'bundled' }>

const stampHash = (stamp: unknown) =>
  typeof stamp === 'string' ? stamp.match(/#([a-f\d]{64})$/)?.[1] : undefined

function sameLocalInputs(before?: CatalogResourceProof, after?: CatalogResourceProof) {
  if (
    before?.kind !== 'local' ||
    after?.kind !== 'local' ||
    !Array.isArray(before.entries) ||
    !before.entries.every((entry) => Array.isArray(entry) && entry.length === 2)
  )
    return false
  const stamps = new Map(before.entries)
  const present = after.entries.some(([, stamp]) => stamp !== null)
  return (
    present &&
    stamps.size === before.entries.length &&
    stamps.size === after.entries.length &&
    new Set(after.entries.map(([path]) => path)).size === stamps.size &&
    after.entries.every(([path, stamp]) => {
      const accepted = stamps.get(path)
      if (stamp === null) return accepted === null
      const hash = stampHash(stamp)
      return !!hash && hash === stampHash(accepted)
    })
  )
}

export function matchesAcceptedSource(
  before: External,
  after: PreparedCatalog['config'],
  revision?: string,
) {
  return (
    before.type === after.type &&
    before.path === after.path &&
    (before.type === 'remote'
      ? !!revision && /^[a-f\d]{40}$/i.test(revision) && revision === before.acceptedRevision
      : sameLocalInputs(before.resourceProof, after.resourceProof))
  )
}

const diagnosticFields = [
  'fixedShieldDiagnostics',
  'fixedWeaponDiagnostics',
  'fixedArmorDiagnostics',
  'fixedAmmunitionDiagnostics',
  'resistanceArmorDiagnostics',
] as const

function normalizeItemName(value: string) {
  return normalizeKey(value).replace(/\s+/g, ' ')
}

function projection(data: GameData, items: Item5e[]) {
  const { fixedWeaponBases, ...projected } = { ...data, items } as GameData & {
    fixedWeaponBases?: unknown[]
  }
  // Older catalogs used the previous field name. Its rows must still match exactly.
  if (fixedWeaponBases) {
    if (projected.fixedEquipmentBases) return data
    projected.fixedEquipmentBases = fixedWeaponBases
  }
  // An empty generation report adds no information and has no runtime consumers.
  for (const field of diagnosticFields) {
    if (projected[field]?.length === 0) delete projected[field]
  }
  return projected
}

function refersToNewItem(
  value: unknown,
  names: ReadonlySet<string>,
  expandsItemPool: (filter: NormalizedChoiceOptionFilter) => boolean,
): boolean {
  if (typeof value === 'string') {
    if (names.has(normalizeItemName(value)) || /data-hover-type\s*=/i.test(value)) return true
    for (const tag of value.matchAll(/\{@item\s+([^}]+)\}/gi)) {
      const name = tag[1].split('|')[0]
      // The preview resolves HTML character references after rendering the tag.
      if (names.has(normalizeItemName(name)) || /&(?:#\d|#x[\da-f]|[a-z])/i.test(name)) return true
    }
    return false
  }
  if (value && typeof value === 'object') {
    // Rarity-based choice filters can offer newly generated items without naming them.
    if ('entityType' in value && value.entityType === 'item') {
      const filter = value as NormalizedChoiceOptionFilter
      if (itemFilterIncludesMagicItems(filter) && (filter.anyOf?.length || expandsItemPool(filter)))
        return true
    }
    return Object.values(value).some((entry) => refersToNewItem(entry, names, expandsItemPool))
  }
  return false
}

function hasExpandingStartingEquipmentPool(
  value: unknown,
  expandsItemPool: (filter: NormalizedChoiceOptionFilter) => boolean,
): boolean {
  if (typeof value === 'string')
    return parseFilterTags(value).some(({ filter }) => expandsItemPool(filter))
  return (
    !!value &&
    typeof value === 'object' &&
    Object.values(value).some((entry) => hasExpandingStartingEquipmentPool(entry, expandsItemPool))
  )
}

/** Only new concrete generated equipment has a qualified, collision-free addition policy. */
export function isAdditiveCatalogRestore(
  prior: GameData,
  candidate: GameData,
  fingerprint: string,
  characters: unknown[],
) {
  if (!Array.isArray(prior?.items) || !Array.isArray(prior.itemsBase)) return false
  if (computeGameDataFingerprint(prior) !== fingerprint) return false
  const names = new Set(
    [...prior.items, ...prior.itemsBase].map(({ name }) => normalizeItemName(name)),
  )
  const existing: Item5e[] = []
  const additions: Item5e[] = []
  for (const item of candidate.items) {
    if (names.has(normalizeItemName(item.name))) existing.push(item)
    else if (
      item.magicVariantGenerated &&
      !item.magicVariantReference &&
      item.startingEquipmentCategory === 'Other' &&
      !/[|{}"\\]/.test(item.name) &&
      !/[|{}]/.test(item.source) &&
      item.source.trim()
    )
      additions.push(item)
    else return false
  }
  if (!additions.length) return false
  if (
    buildItemLookup([...candidate.items, ...candidate.itemsBase]).size !==
    buildItemLookup([...prior.items, ...prior.itemsBase]).size + additions.length
  )
    return false
  const addedNames = new Set(additions.map(({ name }) => normalizeItemName(name)))
  if (addedNames.has('')) return false
  const identities = new Set(
    additions.map(({ name, source }) =>
      JSON.stringify([normalizeItemName(name), normalizeItemName(source)]),
    ),
  )
  if (identities.size !== additions.length) return false
  if (
    computeGameDataFingerprint(projection(prior, prior.items)) !==
    computeGameDataFingerprint(projection(candidate, existing))
  )
    return false

  // Preserve existing references, including item pools evaluated from the combined catalog.
  const { lookups: _lookups, ...saved } = prior
  const itemTypes = buildItemTypeLookup(candidate.itemTypes)
  const expandsItemPool = (filter: NormalizedChoiceOptionFilter) =>
    filter.entityType === 'item' &&
    additions.some((item) =>
      matchesClassChoiceFilter(
        item,
        { ...filter, requiresProficiency: false, excludedItemProperties: undefined },
        {},
        itemTypes,
        [],
        Number.POSITIVE_INFINITY,
      ),
    )
  return (
    !refersToNewItem(saved, addedNames, expandsItemPool) &&
    !refersToNewItem(characters, addedNames, expandsItemPool) &&
    !prior.classes.some(({ startingEquipment }) =>
      hasExpandingStartingEquipmentPool(startingEquipment, expandsItemPool),
    ) &&
    !prior.backgrounds.some(({ startingEquipment, entries }) =>
      hasExpandingStartingEquipmentPool([startingEquipment, entries], expandsItemPool),
    ) &&
    !hasExpandingStartingEquipmentPool(
      prior.optionalfeatures,
      (filter) => (filter.rarities?.length ?? 0) > 0 && expandsItemPool(filter),
    )
  )
}
