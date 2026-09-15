import { useMemo, useState } from 'react'
import { useClassProvenanceMutations } from '@/hooks/character/useClassProvenanceMutations'
import { useItemTypeLookup } from '@/hooks/data/useGameData'
import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import {
  type ClassChoiceCatalogs,
  type ClassChoiceOptionView,
  getClassChoiceOptionKey,
  getStandaloneClassChoices,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import type { Class5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'

interface ClassChoiceControllerParams {
  character: Character | null
  viewingClassData?: Class5e
  viewingClassLevel: number
  catalogs: Omit<ClassChoiceCatalogs, 'itemTypeByAbbr' | 'weaponProficiencies'>
}

const EMPTY_WEAPON_PROFICIENCIES: readonly string[] = []

export function useClassChoiceController({
  character,
  viewingClassData,
  viewingClassLevel,
  catalogs,
}: ClassChoiceControllerParams) {
  const { applyClassChoiceSelection } = useClassProvenanceMutations()
  const itemTypeByAbbr = useItemTypeLookup()
  const weaponProficiencies = character?.proficiencies.weapons ?? EMPTY_WEAPON_PROFICIENCIES
  const [activeChoice, setActiveChoice] = useState<NormalizedCharacterChoice | null>(null)
  const choices = useMemo(
    () =>
      viewingClassData
        ? getStandaloneClassChoices(viewingClassData).filter(
            (choice) => choice.level <= viewingClassLevel,
          )
        : [],
    [viewingClassData, viewingClassLevel],
  )
  const selectionByChoiceId = useMemo(
    () => new Map((character?.classChoiceSelections ?? []).map((entry) => [entry.choiceId, entry])),
    [character?.classChoiceSelections],
  )
  const resolvedCatalogs = useMemo<ClassChoiceCatalogs>(
    () => ({ ...catalogs, itemTypeByAbbr, weaponProficiencies }),
    [catalogs, itemTypeByAbbr, weaponProficiencies],
  )
  const optionViewsByChoiceId = useMemo(
    () =>
      new Map(
        choices.map((choice) => {
          const selected = selectionByChoiceId.get(choice.id)?.selected ?? []
          return [choice.id, resolveClassChoiceOptions(choice, resolvedCatalogs, selected)]
        }),
      ),
    [choices, resolvedCatalogs, selectionByChoiceId],
  )
  const selectedViewsByChoiceId = useMemo(
    () =>
      new Map(
        choices.map((choice) => {
          const selectedKeys = new Set(
            (selectionByChoiceId.get(choice.id)?.selected ?? []).map(getClassChoiceOptionKey),
          )
          return [
            choice.id,
            (optionViewsByChoiceId.get(choice.id) ?? []).filter((option) =>
              selectedKeys.has(getClassChoiceOptionKey(option.reference)),
            ),
          ]
        }),
      ),
    [choices, optionViewsByChoiceId, selectionByChoiceId],
  )
  const activeOptionViews = activeChoice ? (optionViewsByChoiceId.get(activeChoice.id) ?? []) : []
  const activeInitialSelectedIds = activeChoice
    ? (selectionByChoiceId.get(activeChoice.id)?.selected ?? []).map(getClassChoiceOptionKey)
    : []
  const activeRequiredCount = activeChoice
    ? getRequiredChoiceSelectionCount(activeChoice, viewingClassLevel)
    : 0

  const confirm = (selected: ClassChoiceOptionView[]) => {
    if (!character || !activeChoice) return
    applyClassChoiceSelection(
      activeChoice,
      selected.map((option) => option.reference),
    )
    setActiveChoice(null)
  }

  return {
    choices,
    diagnostics: (viewingClassData?.normalizedRules?.choiceDiagnostics ?? []).filter(
      (diagnostic) => diagnostic.level === undefined || diagnostic.level <= viewingClassLevel,
    ),
    selectionByChoiceId,
    selectedViewsByChoiceId,
    activeChoice,
    activeOptionViews,
    activeInitialSelectedIds,
    activeRequiredCount,
    open: setActiveChoice,
    close: () => setActiveChoice(null),
    confirm,
  }
}
