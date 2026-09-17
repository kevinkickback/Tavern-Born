import { resolveArmorType } from '@/lib/calculations/armorClass'
import { getItemTypeCodes } from '@/lib/calculations/itemClassification'
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
  [key: string]: EquipmentEntry[] | undefined
}

interface CurrencyTotals {
  cp: number
  sp: number
  ep: number
  gp: number
  pp: number
}

export interface BackgroundStartingPackage {
  items: EquipmentLike[]
  currency: CurrencyTotals
  genericChoices?: GenericEquipmentChoice[]
}

const DEFAULT_ITEM_SOURCE = 'phb'

interface GenericEquipmentCandidate {
  name: string
  source?: string
}

export interface GenericEquipmentChoice {
  key: string
  token: string
  quantity: number
  candidates: GenericEquipmentCandidate[]
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

function buildGenericEquipmentChoiceKey(
  blockIndex: number,
  optionKey: string,
  entryIndex: number,
): string {
  return `${blockIndex}:${optionKey.toLowerCase()}:${entryIndex}`
}

function isEquipmentTypeCandidate(token: string, item: Item5e): boolean {
  const normalizedToken = token.toLowerCase()
  const typeCodes = getItemTypeCodes(item.type)
  const weaponCategory = item.weaponCategory?.toLowerCase()
  const isMelee = typeCodes.includes('M')

  if (normalizedToken === 'toolartisan') return typeCodes.includes('AT')
  if (normalizedToken === 'instrumentmusical') return typeCodes.includes('INS')
  if (normalizedToken === 'setgaming') return typeCodes.includes('GS')
  if (normalizedToken.startsWith('weaponsimple')) {
    return weaponCategory === 'simple' && (!normalizedToken.endsWith('melee') || isMelee)
  }
  if (normalizedToken.startsWith('weaponmartial')) {
    return weaponCategory === 'martial' && (!normalizedToken.endsWith('melee') || isMelee)
  }
  if (normalizedToken.startsWith('focusspellcasting')) {
    const focusType = normalizedToken.replace('focusspellcasting', '').replace('druidic', 'druid')
    return (
      String(item.scfType ?? '').toLowerCase() === focusType ||
      (Array.isArray(item.group) &&
        item.group.some((group) =>
          String(group)
            .toLowerCase()
            .includes(`${focusType === 'druid' ? 'druidic' : focusType} focus`),
        ))
    )
  }
  return false
}

function getGenericEquipmentCandidates(
  token: string,
  itemLookup: Map<string, Item5e>,
): GenericEquipmentCandidate[] {
  const candidates = new Map<string, GenericEquipmentCandidate>()
  for (const item of itemLookup.values()) {
    if (!isEquipmentTypeCandidate(token, item)) continue
    const key = buildItemKey(item.name, item.source)
    candidates.set(key, { name: item.name, source: item.source })
  }
  return [...candidates.values()].sort(
    (left, right) =>
      left.name.localeCompare(right.name) || (left.source ?? '').localeCompare(right.source ?? ''),
  )
}

function normalizeChoiceBlock(block: unknown): EquipmentChoiceBlock | null {
  if (typeof block !== 'object' || block === null || Array.isArray(block)) {
    return null
  }

  return block as EquipmentChoiceBlock
}

export function getClassDefaultEquipmentBlocks(startingEquipment: unknown): unknown[] {
  if (!startingEquipment || typeof startingEquipment !== 'object') return []
  return (startingEquipment as { defaultData?: unknown[] }).defaultData ?? []
}

export function getBackgroundEquipmentBlocks(startingEquipment: unknown): unknown[] {
  if (Array.isArray(startingEquipment)) return startingEquipment
  if (!startingEquipment || typeof startingEquipment !== 'object') return []

  const withDefaultData = startingEquipment as { defaultData?: unknown[] }
  if (Array.isArray(withDefaultData.defaultData)) {
    return withDefaultData.defaultData
  }

  return [startingEquipment]
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
    console.warn(
      `[startingEquipment] Item lookup failed for "${parsed.name}" (${source}); using generic placeholder.`,
    )
    return {
      name: options?.displayName || parsed.name,
      source,
      type: 'G',
      quantity: options?.quantity ?? 1,
      _unresolved: true,
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
  genericChoiceKey?: string,
  genericSelections: Readonly<Record<string, string>> = {},
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
    const selection = genericChoiceKey ? genericSelections[genericChoiceKey] : undefined
    return selection
      ? resolveFromItemRef(selection, itemLookup, { quantity: entry.quantity })
      : null
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

function countUnresolved(items: EquipmentLike[]): number {
  return items.filter((item) => item._unresolved).length
}

function warnIfUnresolved(context: string, items: EquipmentLike[]): void {
  const unresolvedCount = countUnresolved(items)
  if (unresolvedCount === 0) return

  console.warn(
    `[startingEquipment] ${unresolvedCount}/${items.length} items unresolved while resolving ${context}.`,
  )
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
  context?: {
    blockIndex: number
    optionKey: string
    genericSelections?: Readonly<Record<string, string>>
  },
): BackgroundStartingPackage {
  const resolved: EquipmentLike[] = []
  const currency = emptyCurrency()
  const genericChoices: GenericEquipmentChoice[] = []

  entries.forEach((entry, entryIndex) => {
    if (typeof entry === 'object' && entry !== null) {
      if (typeof entry.value === 'number') {
        addCurrency(currency, toCurrencyFromCopper(entry.value))
      }
      if (typeof entry.containsValue === 'number') {
        addCurrency(currency, toCurrencyFromCopper(entry.containsValue))
      }
    }

    const genericChoiceKey = context
      ? buildGenericEquipmentChoiceKey(context.blockIndex, context.optionKey, entryIndex)
      : undefined
    if (typeof entry === 'object' && entry?.equipmentType && genericChoiceKey) {
      genericChoices.push({
        key: genericChoiceKey,
        token: entry.equipmentType,
        quantity: entry.quantity ?? 1,
        candidates: getGenericEquipmentCandidates(entry.equipmentType, itemLookup),
      })
    }
    const item = resolveFromEntry(entry, itemLookup, genericChoiceKey, context?.genericSelections)
    if (item) resolved.push(item)
  })

  return {
    items: resolved,
    currency,
    genericChoices,
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

  const merged = mergeEquipment(items)
  warnIfUnresolved('class starting equipment', merged)
  return merged
}

export interface ClassStartingEquipmentOptions {
  A: BackgroundStartingPackage
  B: BackgroundStartingPackage
}

export function resolveClassStartingEquipmentOptions(
  startingEquipment: unknown,
  itemLookup: Map<string, Item5e>,
): ClassStartingEquipmentOptions {
  const defaultData = getClassDefaultEquipmentBlocks(startingEquipment)
  const optionAItems: EquipmentLike[] = []
  const optionBItems: EquipmentLike[] = []
  const optionACurrency = emptyCurrency()
  const optionBCurrency = emptyCurrency()
  const optionAGenericChoices: GenericEquipmentChoice[] = []
  const optionBGenericChoices: GenericEquipmentChoice[] = []

  for (const block of defaultData) {
    const normalized = normalizeChoiceBlock(block)
    if (!normalized) continue

    const resolvedA = resolveEntries(collectChosenEntries(normalized, 'a'), itemLookup)
    const resolvedB = resolveEntries(collectChosenEntries(normalized, 'b'), itemLookup)

    optionAItems.push(...resolvedA.items)
    optionBItems.push(...resolvedB.items)
    addCurrency(optionACurrency, resolvedA.currency)
    addCurrency(optionBCurrency, resolvedB.currency)
    optionAGenericChoices.push(...(resolvedA.genericChoices ?? []))
    optionBGenericChoices.push(...(resolvedB.genericChoices ?? []))
  }

  return {
    A: {
      items: mergeEquipment(optionAItems),
      currency: optionACurrency,
      genericChoices: optionAGenericChoices,
    },
    B: {
      items: mergeEquipment(optionBItems),
      currency: optionBCurrency,
      genericChoices: optionBGenericChoices,
    },
  }
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
  const blocks = getBackgroundEquipmentBlocks(startingEquipment)

  const items: EquipmentLike[] = []
  const currency = emptyCurrency()
  const genericChoices: GenericEquipmentChoice[] = []

  for (const block of blocks) {
    const normalized = normalizeChoiceBlock(block)
    if (!normalized) continue
    const resolved = resolveEntries(collectChosenEntries(normalized, preferredOption), itemLookup)
    items.push(...resolved.items)
    addCurrency(currency, resolved.currency)
    genericChoices.push(...(resolved.genericChoices ?? []))
  }

  const mergedItems = mergeEquipment(items)
  warnIfUnresolved('background starting equipment', mergedItems)

  return {
    items: mergedItems,
    currency,
    genericChoices,
  }
}

// ---------------------------------------------------------------------------
// Per-block equipment resolution
// ---------------------------------------------------------------------------

/**
 * A resolved equipment block, ready for UI rendering.
 * Fixed blocks (no choices) have isFixed=true and a single `_` option.
 * Choice blocks have choiceKeys=['a','b',...] and an option entry per key.
 * Each option's BackgroundStartingPackage already includes the fixed (_) items.
 */
export interface ResolvedEquipmentBlock {
  index: number
  displayText: string | null
  isFixed: boolean
  choiceKeys: string[]
  options: Record<string, BackgroundStartingPackage>
}

function getBlockChoiceKeys(block: EquipmentChoiceBlock): string[] {
  const seen = new Set<string>()
  const keys: string[] = []
  for (const k of Object.keys(block)) {
    if (k === '_') continue
    const lower = k.toLowerCase()
    if (!seen.has(lower)) {
      seen.add(lower)
      keys.push(lower)
    }
  }
  return keys.sort()
}

/**
 * Convert per-block choice indices to a resolved equipment package.
 * blockChoices[i] is the selected lowercase key for block i (defaults to first choice key or 'a').
 */
export function resolveEquipmentWithBlockChoices(
  blocks: unknown[],
  itemLookup: Map<string, Item5e>,
  blockChoices: string[],
  genericSelections: Readonly<Record<string, string>> = {},
): BackgroundStartingPackage {
  const allItems: EquipmentLike[] = []
  const currency = emptyCurrency()
  const genericChoices: GenericEquipmentChoice[] = []

  blocks.forEach((rawBlock, i) => {
    const block = normalizeChoiceBlock(rawBlock)
    if (!block) return

    const choiceKeys = getBlockChoiceKeys(block)
    const wantedKey = (blockChoices[i] ?? choiceKeys[0] ?? 'a').toLowerCase()

    const actualKey =
      Object.keys(block).find((k) => k.toLowerCase() === wantedKey) ??
      Object.keys(block).find((k) => k !== '_')

    const fixed = block._ ?? []
    const chosen = actualKey ? (block[actualKey] ?? []) : []
    const resolved = resolveEntries([...fixed, ...chosen], itemLookup, {
      blockIndex: i,
      optionKey: actualKey ?? '_',
      genericSelections,
    })

    allItems.push(...resolved.items)
    addCurrency(currency, resolved.currency)
    genericChoices.push(...(resolved.genericChoices ?? []))
  })

  const mergedItems = mergeEquipment(allItems)
  warnIfUnresolved('equipment block choices', mergedItems)

  return {
    items: mergedItems,
    currency,
    genericChoices,
  }
}

function resolveBlocksToStructure(
  blocks: unknown[],
  displayTexts: (string | null)[],
  itemLookup: Map<string, Item5e>,
  genericSelections: Readonly<Record<string, string>> = {},
): ResolvedEquipmentBlock[] {
  return blocks.flatMap((rawBlock, index) => {
    const block = normalizeChoiceBlock(rawBlock)
    if (!block) return []

    const rawKeys = Object.keys(block)
    const choiceKeys = getBlockChoiceKeys(block)
    const isFixed = choiceKeys.length === 0
    const displayText = displayTexts[index] ?? null

    const options: Record<string, BackgroundStartingPackage> = {}

    if (isFixed) {
      options._ = resolveEntries(block._ ?? [], itemLookup, {
        blockIndex: index,
        optionKey: '_',
        genericSelections,
      })
    } else {
      for (const key of choiceKeys) {
        const actualKey = rawKeys.find((k) => k.toLowerCase() === key) ?? key
        const combined = resolveEntries(
          [...(block._ ?? []), ...(block[actualKey] ?? [])],
          itemLookup,
          {
            blockIndex: index,
            optionKey: actualKey,
            genericSelections,
          },
        )
        options[key] = combined
      }
    }

    return [{ index, displayText, isFixed, choiceKeys, options }]
  })
}

export function resolveClassEquipmentBlocks(
  startingEquipment: unknown,
  itemLookup: Map<string, Item5e>,
  genericSelections: Readonly<Record<string, string>> = {},
): ResolvedEquipmentBlock[] {
  const defaultData = getClassDefaultEquipmentBlocks(startingEquipment)
  const se = startingEquipment as {
    default?: string[]
    entries?: string[]
  } | null

  const displayTexts: (string | null)[] = defaultData.map((_, i) => {
    if (se && Array.isArray(se.default) && se.default[i]) {
      return se.default[i]
    }
    if (se && Array.isArray(se.entries) && i === 0) {
      return se.entries[0] ?? null
    }
    return null
  })

  return resolveBlocksToStructure(defaultData, displayTexts, itemLookup, genericSelections)
}

export function resolveBackgroundEquipmentBlocks(
  startingEquipment: unknown,
  itemLookup: Map<string, Item5e>,
  genericSelections: Readonly<Record<string, string>> = {},
): ResolvedEquipmentBlock[] {
  const blocks = getBackgroundEquipmentBlocks(startingEquipment)

  const displayTexts: (string | null)[] = blocks.map(() => null)
  return resolveBlocksToStructure(blocks, displayTexts, itemLookup, genericSelections)
}

export function formatEquipmentOptionEntries(pkg: BackgroundStartingPackage): string[] {
  const entries: string[] = []

  for (const item of pkg.items) {
    entries.push(item.quantity > 1 ? `${item.quantity}× ${item.name}` : item.name)
  }

  for (const choice of pkg.genericChoices ?? []) {
    if (
      !pkg.items.some((item) => choice.candidates.some((candidate) => candidate.name === item.name))
    ) {
      entries.push(`Choose ${choice.quantity > 1 ? `${choice.quantity} × ` : ''}item`)
    }
  }

  const { cp, sp, ep, gp, pp } = pkg.currency
  if (pp > 0) entries.push(`${pp} pp`)
  if (gp > 0) entries.push(`${gp} gp`)
  if (ep > 0) entries.push(`${ep} ep`)
  if (sp > 0) entries.push(`${sp} sp`)
  if (cp > 0) entries.push(`${cp} cp`)

  return entries
}
