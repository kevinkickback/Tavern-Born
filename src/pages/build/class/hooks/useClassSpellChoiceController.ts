import { useMemo, useState } from 'react'
import { useSpellProvenanceMutations } from '@/hooks/character/useSpellProvenanceMutations'
import {
  getClassSpellGainAtLevel,
  getEffectiveSpellcastingClassData,
} from '@/lib/5etools/classData'
import type { Class5e, Subclass5e } from '@/types/5etools'

const EMPTY_CLASSES: readonly Class5e[] = []

export function useClassSpellChoiceController(
  viewingClassData?: Class5e,
  viewingSubclassData?: Subclass5e,
  standardProgressionClasses: Iterable<Class5e> = EMPTY_CLASSES,
) {
  const [pickerLevel, setPickerLevel] = useState<number | null>(null)
  const [swapLevel, setSwapLevel] = useState<number | null>(null)
  const [swapDrop, setSwapDrop] = useState<string | null>(null)
  const { setClassSpellSelectionsAtLevel, swapClassSpellAtLevel } = useSpellProvenanceMutations()
  const choicesByLevel = useMemo(() => {
    const choices = new Map<
      number,
      { cantrips: number; spells: number; maxSpellLevel: number; canSwap: boolean }
    >()
    const spellcastingData = getEffectiveSpellcastingClassData(
      viewingClassData,
      viewingSubclassData,
    )
    if (!spellcastingData) return choices
    for (let level = 1; level <= 20; level += 1) {
      const gain = getClassSpellGainAtLevel(spellcastingData, level, standardProgressionClasses)
      if (gain.cantrips > 0 || gain.spells > 0 || gain.canSwap) choices.set(level, gain)
    }
    return choices
  }, [standardProgressionClasses, viewingClassData, viewingSubclassData])

  return {
    choicesByLevel,
    pickerLevel,
    setPickerLevel,
    swapLevel,
    setSwapLevel,
    swapDrop,
    setSwapDrop,
    setClassSpellSelectionsAtLevel,
    swapClassSpellAtLevel,
  }
}
