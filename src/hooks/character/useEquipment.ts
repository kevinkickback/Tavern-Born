import { useCallback, useMemo } from 'react'
import { resolveArmorType } from '@/lib/calculations/armorClass'
import { getCarryCapacity, MAX_ATTUNEMENT_SLOTS } from '@/lib/calculations/gameRules'
import { generateEquipmentId } from '@/lib/character/ids'
import { useCharacterStore } from '@/store/characterStore'
import type { Item5e } from '@/types/5etools'
import type { Currency, Equipment } from '@/types/character'

const DEFAULT_CURRENCY: Currency = {
  cp: 0,
  sp: 0,
  ep: 0,
  gp: 0,
  pp: 0,
}

export interface EquipmentState {
  equipment: Equipment[]
  /** Total weight of all items in inventory (quantity × unit weight). */
  totalWeight: number
  /** Max carry capacity (STR × 15). */
  carryCapacity: number
  isEncumbered: boolean
  attunedCount: number
  currency: Currency
  totalCurrencyCopper: number
  addItem: (item: Partial<Equipment> & Pick<Equipment, 'name' | 'type'>) => void
  addFromGameData: (item5e: Item5e) => void
  removeItem: (id: string) => void
  updateItem: (id: string, patch: Partial<Equipment>) => void
  toggleEquip: (id: string) => void
  toggleAttune: (id: string) => void
  updateCurrency: (denomination: keyof Currency, amount: number) => void
}

export function useEquipment(): EquipmentState {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)

  const equipment = character?.equipment ?? []
  const currency = character?.currency ?? DEFAULT_CURRENCY

  const totalWeight = useMemo(
    () => equipment.reduce((sum, e) => sum + (e.weight ?? 0) * e.quantity, 0),
    [equipment],
  )

  const carryCapacity = useMemo(
    () => getCarryCapacity(character?.abilityScores.strength ?? 10),
    [character?.abilityScores.strength],
  )

  const attunedCount = useMemo(() => equipment.filter((e) => e.attuned).length, [equipment])

  const totalCurrencyCopper = useMemo(
    () =>
      currency.cp + currency.sp * 10 + currency.ep * 50 + currency.gp * 100 + currency.pp * 1000,
    [currency],
  )

  const patchEquipment = useCallback(
    (list: Equipment[]) => {
      if (!character) return
      updateCharacter(character.id, { equipment: list })
    },
    [character, updateCharacter],
  )

  const addItem = useCallback(
    (item: Partial<Equipment> & Pick<Equipment, 'name' | 'type'>) => {
      if (!character) return
      const newItem: Equipment = {
        id: generateEquipmentId(),
        quantity: 1,
        equipped: false,
        attuned: false,
        ...item,
      }
      patchEquipment([...equipment, newItem])
    },
    [character, equipment, patchEquipment],
  )

  const addFromGameData = useCallback(
    (item5e: Item5e) => {
      if (!character) return
      const armorType = resolveArmorType(item5e.type ?? '')
      const newItem: Equipment = {
        id: generateEquipmentId(),
        name: item5e.name,
        type: item5e.type ?? 'G',
        quantity: 1,
        equipped: false,
        attuned: false,
        description: '',
        weight: item5e.weight,
        rarity: item5e.rarity,
        reqAttune: Boolean(item5e.reqAttune),
        ac: item5e.ac,
        armorType: armorType === 'none' ? undefined : armorType,
        weaponCategory: item5e.weaponCategory,
        dmg1: item5e.dmg1,
        dmg2: item5e.dmg2,
        dmgType: item5e.dmgType,
        properties: item5e.property,
        range: item5e.range,
        source: item5e.source,
        wondrous: item5e.wondrous,
        tattoo: item5e.tattoo,
        focus: item5e.focus,
      }
      patchEquipment([...equipment, newItem])
    },
    [character, equipment, patchEquipment],
  )

  const removeItem = useCallback(
    (id: string) => {
      if (!character) return
      patchEquipment(equipment.filter((e) => e.id !== id))
    },
    [character, equipment, patchEquipment],
  )

  const updateItem = useCallback(
    (id: string, patch: Partial<Equipment>) => {
      if (!character) return
      patchEquipment(equipment.map((e) => (e.id === id ? { ...e, ...patch } : e)))
    },
    [character, equipment, patchEquipment],
  )

  const toggleEquip = useCallback(
    (id: string) => {
      if (!character) return
      patchEquipment(equipment.map((e) => (e.id === id ? { ...e, equipped: !e.equipped } : e)))
    },
    [character, equipment, patchEquipment],
  )

  const toggleAttune = useCallback(
    (id: string) => {
      if (!character) return
      const item = equipment.find((e) => e.id === id)
      if (!item) return
      if (!item.attuned && attunedCount >= MAX_ATTUNEMENT_SLOTS) return
      patchEquipment(equipment.map((e) => (e.id === id ? { ...e, attuned: !e.attuned } : e)))
    },
    [character, equipment, attunedCount, patchEquipment],
  )

  const updateCurrency = useCallback(
    (denomination: keyof Currency, amount: number) => {
      if (!character) return
      const safeAmount = Math.max(0, Math.trunc(amount))
      const currentCurrency =
        useCharacterStore.getState().activeCharacter?.currency ?? DEFAULT_CURRENCY
      updateCharacter(character.id, {
        currency: {
          ...currentCurrency,
          [denomination]: safeAmount,
        },
      })
    },
    [character, updateCharacter],
  )

  return {
    equipment,
    totalWeight,
    carryCapacity,
    isEncumbered: totalWeight > carryCapacity,
    attunedCount,
    currency,
    totalCurrencyCopper,
    addItem,
    addFromGameData,
    removeItem,
    updateItem,
    toggleEquip,
    toggleAttune,
    updateCurrency,
  }
}
