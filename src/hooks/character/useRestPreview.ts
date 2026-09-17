import { useCallback, useMemo } from 'react'
import { useClassResources } from '@/hooks/character/useClassResources'
import { useHitPoints } from '@/hooks/character/useHitPoints'
import { useSpellSlots } from '@/hooks/character/useSpellSlots'
import { applyRest, type RestResult, type RestType } from '@/lib/character/commands/restCommands'
import type { SpellSlotMaxima } from '@/lib/character/commands/spellSlotCommands'
import { useCharacterStore } from '@/store/characterStore'
import type { HitDiceUsed } from '@/types/character'

export interface RestPreviewOptions {
  restType: RestType
  restoreHitPoints: boolean
  hitDiceRecovered: HitDiceUsed
}

export interface RestPreviewState {
  hitDicePools: Array<{ id: string; label: string; die: number; max: number; used: number }>
  preview: (options: RestPreviewOptions) => RestResult | null
  commit: (result: RestResult) => void
}

export function useRestPreview(): RestPreviewState {
  const character = useCharacterStore((state) => state.activeCharacter)
  const updateCharacter = useCharacterStore((state) => state.updateCharacter)
  const { sharedSlots, pactSlots } = useSpellSlots()
  const { resources } = useClassResources()
  const { effectiveMaxHP, hitDicePools } = useHitPoints()

  const spellSlots = useMemo<SpellSlotMaxima>(
    () => ({
      shared: Object.fromEntries(sharedSlots.map((slot) => [slot.level, { max: slot.max }])),
      pact: Object.fromEntries(pactSlots.map((slot) => [slot.level, { max: slot.max }])),
    }),
    [pactSlots, sharedSlots],
  )

  const preview = useCallback(
    (options: RestPreviewOptions): RestResult | null => {
      if (!character) return null
      return applyRest(character, options.restType, {
        spellSlots,
        resources,
        maximumHitPoints: effectiveMaxHP,
        hitDiceRecovered: options.hitDiceRecovered,
        restoreHitPoints: options.restoreHitPoints,
      })
    },
    [character, effectiveMaxHP, resources, spellSlots],
  )

  const commit = useCallback(
    (result: RestResult) => {
      if (!character) return
      updateCharacter(character.id, result.patch)
    },
    [character, updateCharacter],
  )

  return {
    hitDicePools,
    preview,
    commit,
  }
}
