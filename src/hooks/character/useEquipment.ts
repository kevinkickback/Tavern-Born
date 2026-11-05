import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { getEffectiveCarryCapacity } from '@/lib/calculations/carryingCapacity'
import { MAX_ATTUNEMENT_SLOTS } from '@/lib/calculations/gameRules'
import { getArmorEquipRestriction } from '@/lib/calculations/itemEquippable'
import {
  addManualEquipmentBatchCommand,
  removeManualEquipmentCommand,
  setEquipmentRestrictionsIgnoredCommand,
  updateEquipmentQuantityCommand,
} from '@/lib/character/commands/equipmentCommands'
import { setStartingCurrencyCommand } from '@/lib/character/startingEquipmentGrants'
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
  addManyFromGameData: (items: readonly Item5e[]) => void
  removeItem: (id: string) => void
  updateItem: (id: string, patch: Partial<Equipment>) => void
  toggleEquip: (id: string) => void
  setRestrictionsIgnored: (ignored: boolean) => void
  toggleAttune: (id: string) => void
  updateCurrency: (denomination: keyof Currency, amount: number) => void
}

export function useEquipment(): EquipmentState {
  const character = useCharacterStore((s) => s.activeCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const calculationContext = useCharacterCalculationContext(character)
  const armorTraining = calculationContext?.character.proficiencies.armor

  const equipment = character?.equipment ?? []
  const currency = character?.currency ?? DEFAULT_CURRENCY

  const totalWeight = useMemo(
    () => equipment.reduce((sum, e) => sum + (e.weight ?? 0) * e.quantity, 0),
    [equipment],
  )

  const carryCapacity = useMemo(
    () =>
      calculationContext
        ? getEffectiveCarryCapacity(
            calculationContext.abilityScores.total.strength,
            calculationContext.effects.declarations,
            calculationContext.effects.resolutionContext,
          )
        : 0,
    [calculationContext],
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

  const addManyFromGameData = useCallback(
    (items: readonly Item5e[]) => {
      if (!character || items.length === 0) return
      const result = addManualEquipmentBatchCommand(
        character,
        character.provenance ?? emptyProvenance(),
        items,
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
      const latest = useCharacterStore.getState().activeCharacter
      if (!latest || latest.id !== character?.id) return
      if (patch.quantity !== undefined) {
        const result = updateEquipmentQuantityCommand(latest, latest.provenance, id, patch.quantity)
        updateCharacter(latest.id, {
          ...result.characterPatch,
          provenance: result.provenanceUpdate,
        })
        return
      }
      patchEquipment(equipment.map((e) => (e.id === id ? { ...e, ...patch } : e)))
    },
    [character, equipment, patchEquipment, updateCharacter],
  )

  const toggleEquip = useCallback(
    (id: string) => {
      if (!character) return
      const item = equipment.find((e) => e.id === id)
      if (!item) return

      if (!item.equipped && !(character.variantRules?.ignoreEquipRestrictions ?? false)) {
        const restriction = getArmorEquipRestriction(
          item,
          equipment,
          armorTraining ?? character.proficiencies.armor,
        )
        if (restriction?.kind === 'slot-conflict') {
          toast.warning(
            `${restriction.conflictingItem.name} is already equipped. Unequip it first.`,
          )
          return
        }
        if (restriction?.kind === 'missing-proficiency') {
          const label =
            restriction.armorType === 'shield' ? 'shields' : `${restriction.armorType} armor`
          toast.warning(`${character.name} is not proficient with ${label}.`)
          return
        }
      }

      patchEquipment(equipment.map((e) => (e.id === id ? { ...e, equipped: !e.equipped } : e)))
    },
    [character, equipment, patchEquipment, armorTraining],
  )

  const setRestrictionsIgnored = useCallback(
    (ignored: boolean) => {
      if (!character) return
      updateCharacter(
        character.id,
        setEquipmentRestrictionsIgnoredCommand(character, ignored, armorTraining),
      )
    },
    [character, updateCharacter, armorTraining],
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
      const latest = useCharacterStore.getState().activeCharacter
      if (!latest || latest.id !== character?.id) return
      const safeAmount = Math.max(0, Math.trunc(amount))
      updateCharacter(latest.id, setStartingCurrencyCommand(latest, denomination, safeAmount))
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
    addManyFromGameData,
    removeItem,
    updateItem,
    toggleEquip,
    setRestrictionsIgnored,
    toggleAttune,
    updateCurrency,
  }
}
