import { resolveArmorType } from '@/lib/calculations/armorClass'
import type { Item5e } from '@/types/5etools'
import type { Equipment } from '@/types/character'

type EquipmentLike = Omit<Equipment, 'id' | 'equipped' | 'attuned'>

type EquipmentEntry =
  | string
  | {
      item?: string
      displayName?: string
      quantity?: number
      special?: string
      equipmentType?: string
      value?: number
      containsValue?: number
    }

type EquipmentChoiceBlock = {
  _?: EquipmentEntry[]
  a?: EquipmentEntry[]
  b?: EquipmentEntry[]
  A?: EquipmentEntry[]
  B?: EquipmentEntry[]
}

export interface CurrencyTotals {
  cp: number
  sp: number
  ep: number
  gp: number
  pp: number
}

export interface BackgroundStartingPackage {
  items: EquipmentLike[]
  currency: CurrencyTotals
}

const DEFAULT_ITEM_SOURCE = 'phb'

const EQUIPMENT_TYPE_LABELS: Record<string, string> = {
  toolArtisan: "Artisan's Tools",
  instrumentMusical: 'Musical Instrument',
  setGaming: 'Gaming Set',
  weaponSimple: 'Simple Weapon',
  weaponMartial: 'Martial Weapon',
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeSource(value: string | undefined): string {
  return (value ?? DEFAULT_ITEM_SOURCE).trim().toLowerCase()
}

function parseUid(uid: string): { name: string; source?: string } {
  const [namePart, sourcePart] = uid.split('|')
  return {
    name: (namePart ?? '').trim(),
    source: sourcePart?.trim(),
  }
}

function buildItemKey(name: string, source?: string): string {
  return `${normalizeName(name)}|${normalizeSource(source)}`
}

function normalizeChoiceBlock(block: unknown): EquipmentChoiceBlock | null {
  if (typeof block !== 'object' || block === null || Array.isArray(block)) {
    return null
  }

  return block as EquipmentChoiceBlock
}

function getClassDefaultEquipmentBlocks(startingEquipment: unknown): unknown[] {
  if (!startingEquipment || typeof startingEquipment !== 'object') return []
  return (startingEquipment as { defaultData?: unknown[] }).defaultData ?? []
}

export function hasClassStartingEquipmentChoice(startingEquipment: unknown): boolean {
  return getClassDefaultEquipmentBlocks(startingEquipment).some((block) => {
    const normalized = normalizeChoiceBlock(block)
    if (!normalized) return false
    const aLen = (normalized.A ?? normalized.a ?? []).length
    const bLen = (normalized.B ?? normalized.b ?? []).length
    return aLen > 0 && bLen > 0
  })
}

export function getClassStartingEquipmentChoiceOptions(
  startingEquipment: unknown,
): Array<'A' | 'B'> {
  return hasClassStartingEquipmentChoice(startingEquipment) ? ['A', 'B'] : ['A']
}

function resolveFromItemRef(
  itemRef: string,
  itemLookup: Map<string, Item5e>,
  options?: { quantity?: number; displayName?: string },
): EquipmentLike {
  const parsed = parseUid(itemRef)
  const source = normalizeSource(parsed.source)
  const item = itemLookup.get(buildItemKey(parsed.name, source))

  if (!item) {
    return {
      name: options?.displayName || parsed.name,
      source,
      type: 'G',
      quantity: options?.quantity ?? 1,
    }
  }

  const armorType = resolveArmorType(item.type ?? '')
  return {
    name: options?.displayName || item.name,
    source: item.source,
    type: item.type ?? 'G',
    quantity: options?.quantity ?? 1,
    weight: item.weight,
    value: item.value,
    rarity: item.rarity,
    reqAttune: Boolean(item.reqAttune),
    ac: item.ac,
    armorType: armorType === 'none' ? undefined : armorType,
    weaponCategory: item.weaponCategory,
    dmg1: item.dmg1,
    dmg2: item.dmg2,
    dmgType: item.dmgType,
    properties: item.property,
    range: item.range,
  }
}

function resolveFromEntry(
  entry: EquipmentEntry,
  itemLookup: Map<string, Item5e>,
): EquipmentLike | null {
  if (typeof entry === 'string') {
    return resolveFromItemRef(entry, itemLookup)
  }

  if (!entry || typeof entry !== 'object') return null

  if (entry.item) {
    return resolveFromItemRef(entry.item, itemLookup, {
      quantity: entry.quantity,
      displayName: entry.displayName,
    })
  }

  if (entry.special) {
    return {
      name: entry.special,
      source: DEFAULT_ITEM_SOURCE,
      type: 'G',
      quantity: entry.quantity ?? 1,
    }
  }

  if (entry.equipmentType) {
    return {
      name: EQUIPMENT_TYPE_LABELS[entry.equipmentType] ?? entry.equipmentType,
      source: DEFAULT_ITEM_SOURCE,
      type: 'G',
      quantity: entry.quantity ?? 1,
    }
  }

  return null
}

function toCurrencyFromCopper(value: number): CurrencyTotals {
  const gp = Math.floor(value / 100)
  const remainder = value % 100
  const sp = Math.floor(remainder / 10)
  const cp = remainder % 10

  return {
    cp,
    sp,
    ep: 0,
    gp,
    pp: 0,
  }
}

function addCurrency(target: CurrencyTotals, amount: CurrencyTotals): void {
  target.cp += amount.cp
  target.sp += amount.sp
  target.ep += amount.ep
  target.gp += amount.gp
  target.pp += amount.pp
}

function emptyCurrency(): CurrencyTotals {
  return {
    cp: 0,
    sp: 0,
    ep: 0,
    gp: 0,
    pp: 0,
  }
}

function mergeEquipment(items: EquipmentLike[]): EquipmentLike[] {
  const merged = new Map<string, EquipmentLike>()

  for (const item of items) {
    const key = buildItemKey(item.name, item.source)
    const existing = merged.get(key)

    if (!existing) {
      merged.set(key, { ...item })
      continue
    }

    merged.set(key, {
      ...existing,
      quantity: existing.quantity + item.quantity,
    })
  }

  return Array.from(merged.values())
}

function collectChosenEntries(
  block: EquipmentChoiceBlock,
  preferredOption: 'a' | 'b',
): EquipmentEntry[] {
  const chosen =
    preferredOption === 'b'
      ? (block.B ?? block.b ?? block.A ?? block.a)
      : (block.A ?? block.a ?? block.B ?? block.b)

  return [...(block._ ?? []), ...(chosen ?? [])]
}

function resolveEntries(
  entries: EquipmentEntry[],
  itemLookup: Map<string, Item5e>,
): BackgroundStartingPackage {
  const resolved: EquipmentLike[] = []
  const currency = emptyCurrency()

  for (const entry of entries) {
    if (typeof entry === 'object' && entry !== null) {
      if (typeof entry.value === 'number') {
        addCurrency(currency, toCurrencyFromCopper(entry.value))
      }
      if (typeof entry.containsValue === 'number') {
        addCurrency(currency, toCurrencyFromCopper(entry.containsValue))
      }
    }

    const item = resolveFromEntry(entry, itemLookup)
    if (item) resolved.push(item)
  }

  return {
    items: resolved,
    currency,
  }
}

export function buildItemLookup(items: Item5e[]): Map<string, Item5e> {
  const map = new Map<string, Item5e>()

  for (const item of items) {
    map.set(buildItemKey(item.name, item.source), item)
  }

  return map
}

export function resolveClassStartingEquipment(
  startingEquipment: unknown,
  itemLookup: Map<string, Item5e>,
): EquipmentLike[] {
  const defaultData = getClassDefaultEquipmentBlocks(startingEquipment)
  const items: EquipmentLike[] = []

  for (const block of defaultData) {
    const normalized = normalizeChoiceBlock(block)
    if (!normalized) continue
    const resolved = resolveEntries(collectChosenEntries(normalized, 'a'), itemLookup)
    items.push(...resolved.items)
  }

  return mergeEquipment(items)
}

/**
 * Resolve class starting equipment with optional choice preference.
 * If no choice is provided, defaults to 'a'.
 */
export function resolveClassStartingEquipmentWithChoice(
  startingEquipment: unknown,
  itemLookup: Map<string, Item5e>,
  choicePreference?: 'a' | 'b' | 'A' | 'B',
): EquipmentLike[] {
  const defaultData = getClassDefaultEquipmentBlocks(startingEquipment)
  const items: EquipmentLike[] = []
  const normalizedChoice = (choicePreference?.toLowerCase() as 'a' | 'b') || 'a'

  for (const block of defaultData) {
    const normalized = normalizeChoiceBlock(block)
    if (!normalized) continue
    const resolved = resolveEntries(collectChosenEntries(normalized, normalizedChoice), itemLookup)
    items.push(...resolved.items)
  }

  return mergeEquipment(items)
}
export function resolveBackgroundStartingEquipment(
  startingEquipment: unknown,
  itemLookup: Map<string, Item5e>,
  preferredOption: 'a' | 'b' = 'a',
): EquipmentLike[] {
  return resolveBackgroundStartingEquipmentPackage(startingEquipment, itemLookup, preferredOption)
    .items
}

export function resolveBackgroundStartingEquipmentPackage(
  startingEquipment: unknown,
  itemLookup: Map<string, Item5e>,
  preferredOption: 'a' | 'b' = 'a',
): BackgroundStartingPackage {
  const blocks: unknown[] = Array.isArray(startingEquipment)
    ? startingEquipment
    : [startingEquipment]

  const items: EquipmentLike[] = []
  const currency = emptyCurrency()

  for (const block of blocks) {
    const normalized = normalizeChoiceBlock(block)
    if (!normalized) continue
    const resolved = resolveEntries(collectChosenEntries(normalized, preferredOption), itemLookup)
    items.push(...resolved.items)
    addCurrency(currency, resolved.currency)
  }

  return {
    items: mergeEquipment(items),
    currency,
  }
}
