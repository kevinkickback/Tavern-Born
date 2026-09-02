import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { getCarryCapacity, MAX_ATTUNEMENT_SLOTS } from '@/lib/calculations/gameRules'
import { hasArmorProficiency } from '@/lib/calculations/itemEquippable'
import {
  addManualEquipmentCommand,
  addManualEquipmentEntryCommand,
  removeManualEquipmentCommand,
} from '@/lib/character/commands/equipmentCommands'
import { generateEquipmentId } from '@/lib/character/ids'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
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
  totalWeight: number
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
      const result = addManualEquipmentEntryCommand(
        character,
        character.provenance ?? emptyProvenance(),
        newItem,
      )
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, updateCharacter],
  )

  const addFromGameData = useCallback(
    (item5e: Item5e) => {
      if (!character) return
      const result = addManualEquipmentCommand(
        character,
        character.provenance ?? emptyProvenance(),
        item5e,
      )
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, updateCharacter],
  )

  const removeItem = useCallback(
    (id: string) => {
      if (!character) return
      const result = removeManualEquipmentCommand(
        character,
        character.provenance ?? emptyProvenance(),
        id,
      )
      updateCharacter(character.id, {
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      })
    },
    [character, updateCharacter],
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
      const item = equipment.find((e) => e.id === id)
      if (!item) return

      if (!item.equipped && !(character.variantRules?.ignoreEquipRestrictions ?? false)) {
        const armorType = item.armorType
        if (armorType) {
          const isShield = armorType === 'shield'
          const conflict = equipment.find(
            (e) =>
              e.id !== id &&
              e.equipped &&
              e.armorType &&
              (isShield ? e.armorType === 'shield' : e.armorType !== 'shield'),
          )
          if (conflict) {
            toast.warning(`${conflict.name} is already equipped. Unequip it first.`)
            return
          }

          if (!hasArmorProficiency(character.proficiencies.armor, armorType)) {
            const label = armorType === 'shield' ? 'shields' : `${armorType} armor`
            toast.warning(`${character.name} is not proficient with ${label}.`)
            return
          }
        }
      }

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
