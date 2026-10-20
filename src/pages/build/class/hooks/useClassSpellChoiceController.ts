import { useMemo, useState } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useSpellProvenanceMutations } from '@/hooks/character/useSpellProvenanceMutations'
import { getManagedClassSpellRule } from '@/lib/5etools/classCastingRules'
import { getClassCastingGainAuthority } from '@/lib/5etools/classCastingSource'
import { scopeClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { useCharacterStore } from '@/store/characterStore'
import type { Class5e, Subclass5e } from '@/types/5etools'

export function useClassSpellChoiceController(
  viewingClassData?: Class5e,
  viewingSubclassData?: Subclass5e,
) {
  const [pickerLevel, setPickerLevel] = useState<number | null>(null)
  const character = useCharacterStore((state) => state.activeCharacter)
  const calculation = useCharacterCalculationContext(character)
  const { finishClassSpellChoices } = useSpellProvenanceMutations()
  const choicesByLevel = useMemo(() => {
    const choices = new Map<
      number,
      { cantrips: number; spells: number; maxSpellLevel: number; canSwap: boolean }
    >()
    if (!viewingClassData) return choices
    const entry = {
      name: viewingClassData.name,
      source: viewingClassData.source,
      levels: 20,
      subclass: viewingSubclassData?.name,
      subclassSource: viewingSubclassData?.source,
    }
    const catalogs = calculation?.classChoices.catalogs
    for (const slot of getManagedClassSpellSlots(entry)) {
      const owner = slot[0]
      const scoped =
        catalogs &&
        scopeClassChoiceFeatureCatalogs(
          catalogs,
          owner[0] === 'subclass'
            ? getFeatureOwnerKey(owner[1], owner[2], owner[3], owner[4])
            : undefined,
        )
      const finite = getManagedClassSpellRule(slot)
      const authority =
        scoped &&
        finite &&
        getClassCastingGainAuthority(
          scoped,
          owner,
          slot[2],
          finite.rule.declaration.level,
          slot[1],
          slot[3],
        )
      const gain = choices.get(slot[3]) ?? {
        cantrips: 0,
        spells: 0,
        maxSpellLevel: authority?.maxSpellLevel ?? 0,
        canSwap: false,
      }
      gain.maxSpellLevel = Math.max(gain.maxSpellLevel, authority?.maxSpellLevel ?? 0)
      if (slot[1] === 'class-cantrip') gain.cantrips++
      else gain.spells++
      choices.set(slot[3], gain)
    }
    return choices
  }, [calculation, viewingClassData, viewingSubclassData])

  return {
    choicesByLevel,
    pickerLevel,
    setPickerLevel,
    finishClassSpellChoices,
  }
}
