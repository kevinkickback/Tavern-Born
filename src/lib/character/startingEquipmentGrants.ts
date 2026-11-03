import { generateEquipmentId } from '@/lib/character/ids'
import type {
  Character,
  Currency,
  Equipment,
  StartingEquipmentGrant,
  StartingEquipmentReference,
  StartingEquipmentRole,
  StartingItemReference,
} from '@/types/character'

const CURRENCY_WEIGHTS = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 } as const
export const CURRENCY_KEYS = Object.keys(CURRENCY_WEIGHTS) as Array<keyof Currency>
export const emptyStartingCurrency = (): Currency => ({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 })

export function startingEquipmentLotKey(
  block: number,
  option: string,
  entry: number,
  ref: StartingEquipmentReference,
): string {
  return JSON.stringify([
    block,
    option,
    entry,
    ref.kind,
    ref.kind === 'item' ? ref.name.trim().toLowerCase() : ref.name,
    ref.kind === 'item' ? ref.source.trim().toLowerCase() : null,
  ])
}

export function currencyCopper(currency: Currency): number {
  let total = 0
  for (const key of CURRENCY_KEYS) {
    if (!Number.isSafeInteger(currency[key]) || currency[key] < 0)
      throw new RangeError('Coin amounts must be nonnegative safe integers.')
    total += currency[key] * CURRENCY_WEIGHTS[key]
    if (!Number.isSafeInteger(total)) throw new RangeError('Currency value is too large.')
  }
  return total
}

export function startingCurrencyFromCopper(value: number): Currency {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError('Starting currency must be a nonnegative safe integer.')
  return {
    cp: value % 10,
    sp: Math.floor((value % 100) / 10),
    ep: 0,
    gp: Math.floor(value / 100),
    pp: 0,
  }
}

export function sameStartingReference(
  left: StartingItemReference | undefined,
  right: StartingItemReference | undefined,
): boolean {
  return (
    !!left &&
    !!right &&
    left.name.trim().toLowerCase() === right.name.trim().toLowerCase() &&
    left.source.trim().toLowerCase() === right.source.trim().toLowerCase()
  )
}

function matchesPhysical(item: Equipment, ref: StartingEquipmentReference): boolean {
  return ref.kind === 'special'
    ? item.name === ref.name && !item.source
    : sameStartingReference(item.source ? { name: item.name, source: item.source } : undefined, ref)
}

export interface StartingEquipmentResolvedLot {
  key: string
  reference: StartingEquipmentReference
  /** Unavailable source/choice retains an existing physical lot without issuing a new one. */
  item?: Omit<Equipment, 'id' | 'equipped' | 'attuned'>
}

/** Source restoration can make previously unavailable grants issuable; consumption is never missing. */
export function needsStartingEquipmentApplication(
  character: Character,
  role: StartingEquipmentRole,
  pkg: { lots?: readonly StartingEquipmentResolvedLot[]; currency: Currency },
): boolean {
  const grant = character.startingEquipmentGrants?.[role]
  return (
    (pkg.lots ?? []).some(
      (lot) =>
        lot.item &&
        !grant?.items.some(
          (owned) => owned.key === lot.key && owned.issuedQuantity === lot.item?.quantity,
        ),
    ) || CURRENCY_KEYS.some((coin) => (grant?.declaredCurrency[coin] ?? 0) !== pkg.currency[coin])
  )
}

function emptyStartingGrant(): StartingEquipmentGrant {
  return {
    items: [],
    declaredCurrency: emptyStartingCurrency(),
    remainingCurrency: emptyStartingCurrency(),
    spentCopper: 0,
  }
}

/** Replace only this role's exact physical and unspent currency balances, in one store patch. */
export function reconcileStartingEquipmentGrant(
  character: Character,
  role: StartingEquipmentRole,
  owner: StartingItemReference | undefined,
  desired: readonly StartingEquipmentResolvedLot[],
  declaredCurrency: Currency,
): Partial<Character> {
  const previous = character.startingEquipmentGrants?.[role] ?? emptyStartingGrant()
  const sameOwner = sameStartingReference(previous.owner, owner)
  const wanted = new Map(desired.map((lot) => [lot.key, lot]))
  if (wanted.size !== desired.length)
    throw new RangeError('Starting equipment slots are ambiguous.')
  let equipment = [...character.equipment]
  const occupied = new Set([
    ...equipment.map((item) => item.id),
    ...Object.values(character.startingEquipmentGrants ?? {}).flatMap(
      (grant) => grant?.items.map((lot) => lot.equipmentId) ?? [],
    ),
  ])
  const retained = new Map<string, StartingEquipmentGrant['items'][number]>()
  const subtract = (id: string, quantity: number) => {
    equipment = equipment.flatMap((item) => {
      if (item.id !== id) return [item]
      const remaining = item.quantity - quantity
      if (remaining < 0) throw new RangeError('Starting equipment ownership is inconsistent.')
      return remaining > 0 ? [{ ...item, quantity: remaining }] : []
    })
  }
  for (const lot of previous.items) {
    const next = sameOwner ? wanted.get(lot.key) : undefined
    if (
      next &&
      next.reference.kind === lot.reference.kind &&
      (next.reference.kind === 'special'
        ? next.reference.name === lot.reference.name
        : lot.reference.kind === 'item' && sameStartingReference(next.reference, lot.reference))
    ) {
      retained.set(lot.key, lot)
    } else if (lot.remainingQuantity > 0) subtract(lot.equipmentId, lot.remainingQuantity)
  }
  const items: StartingEquipmentGrant['items'] = []
  for (const desiredLot of desired) {
    const old = retained.get(desiredLot.key)
    if (old && !desiredLot.item) {
      items.push(old)
      continue
    }
    if (!desiredLot.item) continue
    const issuedQuantity = desiredLot.item.quantity
    if (!Number.isSafeInteger(issuedQuantity) || issuedQuantity <= 0)
      throw new RangeError('Starting equipment quantity must be a positive safe integer.')
    const consumedQuantity = old ? old.consumedQuantity : 0
    if (!Number.isSafeInteger(consumedQuantity) || consumedQuantity < 0)
      throw new RangeError('Starting equipment consumption must be a nonnegative safe integer.')
    const remainingQuantity = Math.max(0, issuedQuantity - consumedQuantity)
    const equipmentId = old?.equipmentId ?? generateEquipmentId(occupied)
    occupied.add(equipmentId)
    const physical = equipment.find((item) => item.id === equipmentId)
    if (physical && !matchesPhysical(physical, desiredLot.reference))
      throw new RangeError('Starting equipment printing changed outside its command.')
    const difference = remainingQuantity - (old?.remainingQuantity ?? 0)
    if (difference < 0) subtract(equipmentId, -difference)
    else if (difference > 0) {
      if (physical)
        equipment = equipment.map((item) =>
          item.id === equipmentId ? { ...item, quantity: item.quantity + difference } : item,
        )
      else
        equipment.push({
          ...desiredLot.item,
          id: equipmentId,
          quantity: difference,
          equipped: false,
          attuned: false,
        })
    }
    items.push({
      key: desiredLot.key,
      reference: desiredLot.reference,
      equipmentId,
      issuedQuantity,
      consumedQuantity,
      remainingQuantity,
    })
  }
  const currency = { ...(character.currency ?? emptyStartingCurrency()) }
  currencyCopper(declaredCurrency)
  let remainingCurrency = previous.remainingCurrency
  if (CURRENCY_KEYS.some((coin) => previous.declaredCurrency[coin] !== declaredCurrency[coin])) {
    for (const coin of CURRENCY_KEYS) {
      currency[coin] -= previous.remainingCurrency[coin]
      if (currency[coin] < 0) throw new RangeError('Starting currency ownership is inconsistent.')
    }
    remainingCurrency = startingCurrencyFromCopper(
      Math.max(0, currencyCopper(declaredCurrency) - previous.spentCopper),
    )
    for (const coin of CURRENCY_KEYS) currency[coin] += remainingCurrency[coin]
  }
  currencyCopper(currency)
  return {
    equipment,
    currency,
    startingEquipmentGrants: {
      ...character.startingEquipmentGrants,
      [role]: {
        owner,
        items,
        declaredCurrency: { ...declaredCurrency },
        remainingCurrency: { ...remainingCurrency },
        spentCopper: previous.spentCopper,
      },
    },
  }
}

/** Wallet edits spend this denomination's starting coins first; deposits are independent funds. */
export function setStartingCurrencyCommand(
  character: Character,
  coin: keyof Currency,
  amount: number,
): Partial<Character> {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new RangeError('Coin amounts must be nonnegative safe integers.')
  const currency = { ...(character.currency ?? emptyStartingCurrency()), [coin]: amount }
  currencyCopper(currency)
  let decrease = Math.max(0, (character.currency?.[coin] ?? 0) - amount)
  const startingEquipmentGrants = { ...character.startingEquipmentGrants }
  for (const role of ['class', 'background'] as const) {
    const grant = startingEquipmentGrants[role]
    if (!grant || decrease === 0) continue
    const consumed = Math.min(decrease, grant.remainingCurrency[coin])
    const spentCopper = grant.spentCopper + consumed * CURRENCY_WEIGHTS[coin]
    if (!Number.isSafeInteger(spentCopper))
      throw new RangeError('Starting currency spending is too large.')
    startingEquipmentGrants[role] = {
      ...grant,
      spentCopper,
      remainingCurrency: {
        ...grant.remainingCurrency,
        [coin]: grant.remainingCurrency[coin] - consumed,
      },
    }
    decrease -= consumed
  }
  return { currency, startingEquipmentGrants }
}

/** Quantity reductions consume owned copies; increments remain independent surplus. */
export function updateStartingEquipmentQuantity(
  character: Character,
  id: string,
  quantity: number,
): Partial<Character> {
  if (!Number.isSafeInteger(quantity) || quantity < 0)
    throw new RangeError('Item quantity must be a nonnegative safe integer.')
  const item = character.equipment.find((entry) => entry.id === id)
  if (!item) return {}
  const consumed = Math.max(0, item.quantity - quantity)
  const startingEquipmentGrants = { ...character.startingEquipmentGrants }
  for (const role of ['class', 'background'] as const) {
    const grant = startingEquipmentGrants[role]
    if (!grant) continue
    startingEquipmentGrants[role] = {
      ...grant,
      items: grant.items.map((lot) => {
        if (lot.equipmentId !== id) return lot
        const ownedConsumed = Math.min(consumed, lot.remainingQuantity)
        const consumedQuantity = lot.consumedQuantity + ownedConsumed
        if (!Number.isSafeInteger(consumedQuantity))
          throw new RangeError('Starting equipment consumption is too large.')
        return {
          ...lot,
          consumedQuantity,
          remainingQuantity: lot.remainingQuantity - ownedConsumed,
        }
      }),
    }
  }
  return {
    equipment: character.equipment.flatMap((entry) =>
      entry.id !== id ? [entry] : quantity > 0 ? [{ ...entry, quantity }] : [],
    ),
    startingEquipmentGrants,
  }
}
