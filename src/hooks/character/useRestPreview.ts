import { useCallback, useMemo } from 'react'
import { useClassResources } from '@/hooks/character/useClassResources'
import { useHitPoints } from '@/hooks/character/useHitPoints'
import { useSpellSlots } from '@/hooks/character/useSpellSlots'
import { applyRest, type RestResult, type RestType } from '@/lib/character/commands/restCommands'
import type { SpellSlotMaxima } from '@/lib/character/commands/spellSlotCommands'
import { useCharacterStore } from '@/store/characterStore'

export interface RestPreviewOptions {
  restType: RestType
  restoreHitPoints: boolean
  hitDiceRecovered: number
}

export interface RestPreviewState {
  hitDiceUsed: number
  preview: (options: RestPreviewOptions) => RestResult | null
  commit: (result: RestResult) => void
}

export function useRestPreview(): RestPreviewState {
  const character = useCharacterStore((state) => state.activeCharacter)
  const updateCharacter = useCharacterStore((state) => state.updateCharacter)
  const { sharedSlots, pactSlots } = useSpellSlots()
  const { resources } = useClassResources()
  const { effectiveMaxHP } = useHitPoints()

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
    hitDiceUsed: Math.max(0, character?.hitDiceUsed ?? 0),
    preview,
    commit,
  }
}
