import { useMemo, useState } from 'react'
import { useSpellProvenanceMutations } from '@/hooks/character/useSpellProvenanceMutations'
import { getClassSpellGainAtLevel } from '@/lib/5etools/classData'
import type { Class5e } from '@/types/5etools'

export function useClassSpellChoiceController(viewingClassData?: Class5e) {
  const [pickerLevel, setPickerLevel] = useState<number | null>(null)
  const [swapLevel, setSwapLevel] = useState<number | null>(null)
  const [swapDrop, setSwapDrop] = useState<string | null>(null)
  const { applyBatchSpellSelections, removeSpellProvenance, swapSpellProvenance } =
    useSpellProvenanceMutations()
  const choicesByLevel = useMemo(() => {
    const choices = new Map<
      number,
      { cantrips: number; spells: number; maxSpellLevel: number; canSwap: boolean }
    >()
    if (!viewingClassData) return choices
    for (let level = 1; level <= 20; level += 1) {
      const gain = getClassSpellGainAtLevel(viewingClassData, level)
      if (gain.cantrips > 0 || gain.spells > 0) choices.set(level, gain)
    }
    return choices
  }, [viewingClassData])

  return {
    choicesByLevel,
    pickerLevel,
    setPickerLevel,
    swapLevel,
    setSwapLevel,
    swapDrop,
    setSwapDrop,
    applyBatchSpellSelections,
    removeSpellProvenance,
    swapSpellProvenance,
  }
}
