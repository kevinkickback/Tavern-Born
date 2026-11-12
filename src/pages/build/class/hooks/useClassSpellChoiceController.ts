import { useMemo, useState } from 'react'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useSpellProvenanceMutations } from '@/hooks/character/useSpellProvenanceMutations'
import { getManagedClassSpellRule } from '@/lib/5etools/classCastingRules'
import { getClassCastingGainAuthority } from '@/lib/5etools/classCastingSource'
import { getClericArcanaSpellRule } from '@/lib/5etools/clericArcanaSpells'
import { getArcaneDabbler, isArcaneDabblerSlot } from '@/lib/5etools/mysticArcaneDabbler'
import { getSavantSpellbookGain, getSavantSpellbookSlots } from '@/lib/5etools/savantSpellbookRules'
import { isSelectedInvocationRitualSlot } from '@/lib/5etools/selectedFeatureSpellIdentity'
import { scopeClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
import { getManagedClassSpellFeatureLabel } from '@/lib/character/managedClassSpellIdentity'
import { getManagedClassSpellSlots } from '@/lib/character/managedClassSpellSlots'
import { getSelectedFeatureCantripSetups } from '@/lib/character/selectedFeatureSpells'
import { normalizeOwnerIdentity } from '@/lib/provenance/normalization'
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
    const slots = getManagedClassSpellSlots(
      entry,
      character ?? undefined,
      catalogs,
      calculation?.classChoices.prerequisites,
    )
    if (!viewingSubclassData) {
      // The exact saved owner remains editable when the selected subclass data is unavailable.
      const saved = character?.classProgression.find(
        (row) =>
          normalizeOwnerIdentity(row.name) === normalizeOwnerIdentity(entry.name) &&
          normalizeOwnerIdentity(row.source) === normalizeOwnerIdentity(entry.source),
      )
      if (saved) {
        const savedEntry = { ...saved, levels: entry.levels }
        slots.push(
          ...getSavantSpellbookSlots(savedEntry),
          ...getManagedClassSpellSlots(savedEntry, character ?? undefined, catalogs).filter(
            (slot) =>
              getClericArcanaSpellRule(slot) ||
              isArcaneDabblerSlot(slot) ||
              slot[1] === 'subclass-spell-replacement',
          ),
        )
      }
    }
    const ritualRanks = new Map(
      character && slots.some(isSelectedInvocationRitualSlot)
        ? getSelectedFeatureCantripSetups(
            character,
            catalogs,
            calculation?.classChoices.prerequisites,
          )
            .filter((setup) => setup.domain === 'feature-prepared' && setup.offered)
            .map((setup) => [setup.producer, setup.choice?.filter?.level ?? 0] as const)
        : [],
    )
    const dabbler = character && getArcaneDabbler(character, entry, catalogs?.classes)
    for (const slot of slots) {
      if (
        dabbler &&
        isArcaneDabblerSlot(slot) &&
        slot[2] === dabbler.target &&
        slot[4] >= dabbler.count
      )
        continue
      const gain = choices.get(slot[3]) ?? {
        cantrips: 0,
        spells: 0,
        maxSpellLevel: 0,
        canSwap: false,
      }
      choices.set(slot[3], gain)
      const savant = getSavantSpellbookGain(slot)
      if (savant) {
        gain.savantSpellbook ??= {
          name: getManagedClassSpellFeatureLabel(slot) ?? 'Savant',
          count: 0,
          maxSpellLevel: savant.tier,
        }
        gain.savantSpellbook.count++
        continue
      }
      const domain = slot[1]
      if (domain === 'subclass-spell-replacement') {
        gain.canSwap = true
        continue
      }
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
        scoped && finite && domain !== 'feature-cantrip' && domain !== 'feature-prepared'
          ? getClassCastingGainAuthority(
              scoped,
              owner,
              slot[2],
              finite.rule.declaration.level,
              domain,
              slot[3],
            )
          : undefined
      gain.maxSpellLevel = Math.max(
        gain.maxSpellLevel,
        isSelectedInvocationRitualSlot(slot) ? (ritualRanks.get(slot[2]) ?? 0) : 0,
        getClericArcanaSpellRule(slot)?.rank ?? authority?.maxSpellLevel ?? 0,
        dabbler && isArcaneDabblerSlot(slot) && slot[2] === dabbler.target
          ? Math.max(...dabbler.ranks)
          : 0,
      )
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
