import { resolveArmorType } from '@/lib/calculations/armorClass'
import { isSelectableEquipmentItem } from '@/lib/calculations/itemClassification'
import {
  currencyCopper,
  emptyStartingCurrency as emptyCurrency,
  type StartingEquipmentResolvedLot,
  startingEquipmentLotKey,
  startingCurrencyFromCopper as toCurrencyFromCopper,
} from '@/lib/character/startingEquipmentGrants'
import type { Item5e } from '@/types/5etools'
import type {
  Equipment,
  StartingEquipmentItemChoices,
  StartingEquipmentReference,
} from '@/types/character'
import {
  getStartingEquipmentCandidates,
  type StartingEquipmentPolicy,
  startingItemKey,
  startingItemUid,
} from './startingEquipmentPolicy'

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
  lots?: StartingEquipmentResolvedLot[]
  issues?: string[]
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
  diagnostic?: string
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
  options?: { quantity?: number; displayName?: string; itemOverride?: Item5e | null },
): EquipmentLike {
  const parsed = parseUid(itemRef)
  const source = normalizeSource(parsed.source)
  const item =
    options?.itemOverride === undefined
      ? itemLookup.get(buildItemKey(parsed.name, source))
      : (options.itemOverride ?? undefined)

  if (!item || !isSelectableEquipmentItem(item)) {
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
    name: item.name,
    description:
      options?.displayName && options.displayName !== item.name ? options.displayName : undefined,
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
  policy?: StartingEquipmentPolicy,
): EquipmentLike | null {
  if (typeof entry === 'string') {
    const ref = startingItemUid(entry)
    return resolveFromItemRef(entry, itemLookup, {
      itemOverride: policy ? (ref && policy.raw.get(startingItemKey(ref))) || null : undefined,
    })
  }

  if (!entry || typeof entry !== 'object') return null

  if (entry.item) {
    const ref = startingItemUid(entry.item)
    return resolveFromItemRef(entry.item, itemLookup, {
      quantity: entry.quantity,
      displayName: entry.displayName,
      itemOverride: policy ? (ref && policy.raw.get(startingItemKey(ref))) || null : undefined,
    })
  }

  if (entry.special) {
    return {
      name: entry.special,
      type: 'G',
      quantity: entry.quantity ?? 1,
    }
  }

  return null
}

function addCurrency(target: CurrencyTotals, amount: CurrencyTotals): void {
  target.cp += amount.cp
  target.sp += amount.sp
  target.ep += amount.ep
  target.gp += amount.gp
  target.pp += amount.pp
  currencyCopper(target)
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
    genericSelections?: Readonly<StartingEquipmentItemChoices>
    policy?: StartingEquipmentPolicy
  },
): BackgroundStartingPackage {
  const resolved: EquipmentLike[] = []
  const currency = emptyCurrency()
  const genericChoices: GenericEquipmentChoice[] = []
  const lots: StartingEquipmentResolvedLot[] = []
  const issues: string[] = []

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
    const itemRef = typeof entry === 'string' ? entry : entry?.item
    const target = itemRef ? startingItemUid(itemRef) : undefined
    const rawItem =
      target &&
      (context?.policy
        ? context.policy.raw.get(startingItemKey(target))
        : itemLookup.get(buildItemKey(target.name, target.source)))
    const isGroup =
      (!!rawItem && Array.isArray(rawItem.items)) ||
      (!rawItem &&
        !!target &&
        !!genericChoiceKey &&
        !!context?.genericSelections?.[genericChoiceKey]?.length)
    const token = typeof entry === 'object' ? entry?.equipmentType : undefined
    const quantity = typeof entry === 'object' ? (entry?.quantity ?? 1) : 1
    if ((token || isGroup) && genericChoiceKey && context) {
      const pool = context?.policy
        ? getStartingEquipmentCandidates(
            context.policy,
            context.blockIndex,
            token,
            isGroup ? target : undefined,
            {
              option: context.optionKey,
              entry: entryIndex,
              displayName: typeof entry === 'object' ? entry.displayName : undefined,
            },
          )
        : { candidates: [], diagnostic: 'Starting item rules are unavailable.' }
      const selected = context?.genericSelections?.[genericChoiceKey] ?? []
      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        issues.push(`Invalid quantity for ${genericChoiceKey}.`)
        return
      }
      genericChoices.push({
        key: genericChoiceKey,
        token: token ?? rawItem?.name ?? target?.name ?? 'Item group',
        quantity,
        candidates: pool.candidates.map((item) => ({ name: item.name, source: item.source })),
        diagnostic: pool.diagnostic,
      })
      if (pool.diagnostic) issues.push(pool.diagnostic)
      if (selected.length !== quantity)
        issues.push(
          `Choose exactly ${quantity} item${quantity === 1 ? '' : 's'} for ${genericChoiceKey}.`,
        )
      const counted = new Map<
        string,
        { reference: StartingEquipmentReference; quantity: number; item?: Item5e }
      >()
      for (const ref of selected.slice(0, quantity)) {
        const candidate = pool.candidates.find(
          (item) => startingItemKey(item) === startingItemKey(ref),
        )
        if (!candidate)
          issues.push(`The selected item for ${genericChoiceKey} is unavailable or ineligible.`)
        const reference: StartingEquipmentReference = {
          kind: 'item',
          name: candidate?.name ?? ref.name,
          source: candidate?.source ?? ref.source,
        }
        const key = startingEquipmentLotKey(
          context.blockIndex,
          context.optionKey.toLowerCase(),
          entryIndex,
          reference,
        )
        const old = counted.get(key)
        counted.set(key, { reference, quantity: (old?.quantity ?? 0) + 1, item: candidate })
      }
      for (const [key, pick] of counted) {
        const item = pick.item
          ? resolveFromItemRef(`${pick.item.name}|${pick.item.source}`, itemLookup, {
              quantity: pick.quantity,
              itemOverride: pick.item,
            })
          : undefined
        lots.push({ key, reference: pick.reference, item })
        if (item) resolved.push(item)
      }
      return
    }
    const item = resolveFromEntry(entry, itemLookup, context?.policy)
    if (item) {
      const reference: StartingEquipmentReference =
        typeof entry === 'object' && entry.special
          ? { kind: 'special', name: entry.special }
          : {
              kind: 'item',
              name: rawItem?.name ?? target?.name ?? item.name,
              source: rawItem?.source ?? target?.source ?? DEFAULT_ITEM_SOURCE,
            }
      lots.push({
        key: startingEquipmentLotKey(
          context?.blockIndex ?? 0,
          context?.optionKey.toLowerCase() ?? '_',
          entryIndex,
          reference,
        ),
        reference,
        item: item._unresolved ? undefined : item,
      })
      resolved.push(item)
      if (item._unresolved) issues.push(`Restore the exact item rules for ${item.name}.`)
    }
  })

  return {
    items: resolved,
    currency,
    genericChoices,
    lots,
    issues,
  }
}

export function buildItemLookup(items: Item5e[]): Map<string, Item5e> {
  const map = new Map<string, Item5e>()

  for (const item of items) {
    map.set(buildItemKey(item.name, item.source), item)
  }

  return map
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

/** Reuse the already-resolved view when deriving the selected UI package; do not rescan catalogs. */
export function getSelectedEquipmentPackage(
  blocks: readonly ResolvedEquipmentBlock[],
  choices: readonly string[],
): BackgroundStartingPackage {
  const packages = blocks.map(
    (block) =>
      block.options[
        block.isFixed ? '_' : (choices[block.index]?.toLowerCase() ?? block.choiceKeys[0])
      ] ?? block.options[block.choiceKeys[0]],
  )
  const currency = emptyCurrency()
  for (const pkg of packages) addCurrency(currency, pkg.currency)
  return {
    items: mergeEquipment(packages.flatMap((pkg) => pkg.items)),
    currency,
    genericChoices: packages.flatMap((pkg) => pkg.genericChoices ?? []),
    lots: packages.flatMap((pkg) => pkg.lots ?? []),
    issues: packages.flatMap((pkg) => pkg.issues ?? []),
  }
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
  genericSelections: Readonly<StartingEquipmentItemChoices> = {},
  policy?: StartingEquipmentPolicy,
): BackgroundStartingPackage {
  const allItems: EquipmentLike[] = []
  const currency = emptyCurrency()
  const genericChoices: GenericEquipmentChoice[] = []
  const lots: StartingEquipmentResolvedLot[] = []
  const issues: string[] = []

  blocks.forEach((rawBlock, i) => {
    const block = normalizeChoiceBlock(rawBlock)
    if (!block) return

    const choiceKeys = getBlockChoiceKeys(block)
    const wantedKey = (blockChoices[i] ?? choiceKeys[0] ?? 'a').toLowerCase()

    const actualKey = choiceKeys.length
      ? (Object.keys(block).find((k) => k !== '_' && k.toLowerCase() === wantedKey) ??
        Object.keys(block).find((k) => k !== '_'))
      : undefined

    const fixed = block._ ?? []
    const chosen = actualKey ? (block[actualKey] ?? []) : []
    if (choiceKeys.length && blockChoices[i] && !choiceKeys.includes(wantedKey))
      issues.push(`Equipment package ${i + 1} is invalid.`)
    for (const [key, entries] of [
      ['_', fixed],
      [actualKey ?? '_', chosen],
    ] as const) {
      if (key === '_' && entries === chosen && !actualKey) continue
      const resolved = resolveEntries(entries, itemLookup, {
        blockIndex: i,
        optionKey: key,
        genericSelections,
        policy,
      })
      allItems.push(...resolved.items)
      addCurrency(currency, resolved.currency)
      genericChoices.push(...(resolved.genericChoices ?? []))
      lots.push(...(resolved.lots ?? []))
      issues.push(...(resolved.issues ?? []))
    }
  })

  const mergedItems = mergeEquipment(allItems)
  warnIfUnresolved('equipment block choices', mergedItems)

  return {
    items: mergedItems,
    currency,
    genericChoices,
    lots,
    issues,
  }
}

function resolveBlocksToStructure(
  blocks: unknown[],
  displayTexts: (string | null)[],
  itemLookup: Map<string, Item5e>,
  genericSelections: Readonly<StartingEquipmentItemChoices> = {},
  policy?: StartingEquipmentPolicy,
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
        policy,
      })
    } else {
      for (const key of choiceKeys) {
        const actualKey = rawKeys.find((k) => k.toLowerCase() === key) ?? key
        const fixed = resolveEntries(block._ ?? [], itemLookup, {
          blockIndex: index,
          optionKey: '_',
          genericSelections,
          policy,
        })
        const selected = resolveEntries(block[actualKey] ?? [], itemLookup, {
          blockIndex: index,
          optionKey: key,
          genericSelections,
          policy,
        })
        const currency = { ...fixed.currency }
        addCurrency(currency, selected.currency)
        options[key] = {
          items: mergeEquipment([...fixed.items, ...selected.items]),
          currency,
          genericChoices: [...(fixed.genericChoices ?? []), ...(selected.genericChoices ?? [])],
          lots: [...(fixed.lots ?? []), ...(selected.lots ?? [])],
          issues: [...(fixed.issues ?? []), ...(selected.issues ?? [])],
        }
      }
    }

    return [{ index, displayText, isFixed, choiceKeys, options }]
  })
}

export function resolveClassEquipmentBlocks(
  startingEquipment: unknown,
  itemLookup: Map<string, Item5e>,
  genericSelections: Readonly<StartingEquipmentItemChoices> = {},
  policy?: StartingEquipmentPolicy,
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

  return resolveBlocksToStructure(defaultData, displayTexts, itemLookup, genericSelections, policy)
}

export function resolveBackgroundEquipmentBlocks(
  startingEquipment: unknown,
  itemLookup: Map<string, Item5e>,
  genericSelections: Readonly<StartingEquipmentItemChoices> = {},
  policy?: StartingEquipmentPolicy,
): ResolvedEquipmentBlock[] {
  const blocks = getBackgroundEquipmentBlocks(startingEquipment)

  const displayTexts: (string | null)[] = blocks.map(() => null)
  return resolveBlocksToStructure(blocks, displayTexts, itemLookup, genericSelections, policy)
}

/** Validate explicit edits without requiring unrelated unfinished draft slots to be complete. */
export function assertStartingEquipmentSelections(
  pkg: BackgroundStartingPackage,
  selections: Readonly<StartingEquipmentItemChoices>,
  previous: Readonly<StartingEquipmentItemChoices> = {},
): void {
  for (const choice of pkg.genericChoices ?? []) {
    const selected = selections[choice.key] ?? []
    if (
      selected.length > choice.quantity ||
      (JSON.stringify(selected) !== JSON.stringify(previous[choice.key] ?? []) &&
        (selected.length !== choice.quantity ||
          selected.some(
            (ref) =>
              !choice.candidates.some(
                (item) =>
                  item.source &&
                  startingItemKey({ name: item.name, source: item.source }) ===
                    startingItemKey(ref),
              ),
          )))
    ) {
      throw new RangeError(
        'A selected starting item no longer fits this choice. Review its current rules.',
      )
    }
  }
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
