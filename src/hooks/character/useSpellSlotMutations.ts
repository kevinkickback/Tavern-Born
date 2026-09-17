import { useCallback } from 'react'
import {
  correctSpellSlotUsageCommand,
  restoreSpellSlotCommand,
  type SpellSlotPool,
  spendSpellSlotCommand,
} from '@/lib/character/commands/spellSlotCommands'
import { useCharacterStore } from '@/store/characterStore'

export interface SpellSlotMutations {
  correctUsage: (pool: SpellSlotPool, level: number, used: number, max: number) => void
  spend: (pool: SpellSlotPool, level: number, max: number) => void
  restoreOne: (pool: SpellSlotPool, level: number, max: number) => void
}

export function useSpellSlotMutations(): SpellSlotMutations {
  const character = useCharacterStore((state) => state.activeCharacter)
  const updateCharacter = useCharacterStore((state) => state.updateCharacter)

  const correctUsage = useCallback(
    (pool: SpellSlotPool, level: number, used: number, max: number) => {
      if (!character) return
      updateCharacter(character.id, correctSpellSlotUsageCommand(character, pool, level, used, max))
    },
    [character, updateCharacter],
  )

  const spend = useCallback(
    (pool: SpellSlotPool, level: number, max: number) => {
      if (!character) return
      updateCharacter(character.id, spendSpellSlotCommand(character, pool, level, max))
    },
    [character, updateCharacter],
  )

  const restoreOne = useCallback(
    (pool: SpellSlotPool, level: number, max: number) => {
      if (!character) return
      updateCharacter(character.id, restoreSpellSlotCommand(character, pool, level, max, 1))
    },
    [character, updateCharacter],
  )

  return { correctUsage, spend, restoreOne }
}
