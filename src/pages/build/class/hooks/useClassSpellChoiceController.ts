import { useMemo, useState } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useSpellProvenanceMutations } from '@/hooks/character/useSpellProvenanceMutations'
import { getManagedClassSpellRule } from '@/lib/5etools/classCastingRules'
import { getClassCastingGainAuthority } from '@/lib/5etools/classCastingSource'
import { scopeClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import { getManagedClassSpellFeatureLabel } from '@/lib/character/managedClassSpellIdentity'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { useCharacterStore } from '@/store/characterStore'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { SpellGain } from '../model/levelsUtils'

export function useClassSpellChoiceController(
  viewingClassData?: Class5e,
  viewingSubclassData?: Subclass5e,
) {
  const [pickerLevel, setPickerLevel] = useState<number | null>(null)
  const character = useCharacterStore((state) => state.activeCharacter)
  const calculation = useCharacterCalculationContext(character)
  const { finishClassSpellChoices } = useSpellProvenanceMutations()
  const choicesByLevel = useMemo(() => {
    const choices = new Map<number, SpellGain>()
    if (!viewingClassData) return choices
    const entry = {
      name: viewingClassData.name,
      source: viewingClassData.source,
      levels: 20,
      subclass: viewingSubclassData?.name,
      subclassSource: viewingSubclassData?.source,
    }
    const currentCatalogs = calculation?.classChoices.catalogs
    const catalogs = currentCatalogs && { ...currentCatalogs }
    for (const slot of getManagedClassSpellSlots(
      entry,
      character ?? undefined,
      catalogs,
      calculation?.classChoices.prerequisites,
    )) {
      const gain = choices.get(slot[3]) ?? {
        cantrips: 0,
        spells: 0,
        maxSpellLevel: 0,
        canSwap: false,
      }
      choices.set(slot[3], gain)
      const domain = slot[1]
      if (domain === 'class-spellbook-specialty') {
        gain.spellbookSpecialty ??= {
          name: getManagedClassSpellFeatureLabel(slot) ?? 'Spellbook specialty',
          count: 0,
        }
        gain.spellbookSpecialty.count++
        continue
      }
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
        scoped && finite && domain !== 'feature-cantrip'
          ? getClassCastingGainAuthority(
              scoped,
              owner,
              slot[2],
              finite.rule.declaration.level,
              domain,
              slot[3],
            )
          : undefined
      gain.maxSpellLevel = Math.max(gain.maxSpellLevel, authority?.maxSpellLevel ?? 0)
      if (domain === 'class-cantrip' || domain === 'feature-cantrip') gain.cantrips++
      else gain.spells++
    }
    return choices
  }, [calculation, character, viewingClassData, viewingSubclassData])

  return {
    choicesByLevel,
    pickerLevel,
    setPickerLevel,
    finishClassSpellChoices,
  }
}
