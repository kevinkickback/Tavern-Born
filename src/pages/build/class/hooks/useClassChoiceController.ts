import { useMemo, useState } from 'react'
import { useClassProvenanceMutations } from '@/hooks/character/useClassProvenanceMutations'
import { useItemTypeLookup } from '@/hooks/data/useGameData'
import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import { hasFeatOptions } from '@/lib/5etools/parsers/featOptions'
import {
  type ClassChoiceCatalogs,
  type ClassChoiceOptionView,
  getClassChoiceOptionKey,
  getStandaloneClassChoices,
  isClassChoiceOptionEligible,
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
  onFeatOptionsRequired?: (feat: ClassChoiceCatalogs['feats'][number], choiceId: string) => void
}

const EMPTY_WEAPON_PROFICIENCIES: readonly string[] = []

export function useClassChoiceController({
  character,
  viewingClassData,
  viewingClassLevel,
  catalogs,
  onFeatOptionsRequired,
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
  const persistedSelectionByChoiceId = useMemo(
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
          const selected = persistedSelectionByChoiceId.get(choice.id)?.selected ?? []
          return [choice.id, resolveClassChoiceOptions(choice, resolvedCatalogs, selected)]
        }),
      ),
    [choices, persistedSelectionByChoiceId, resolvedCatalogs],
  )
  const selectionByChoiceId = persistedSelectionByChoiceId
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
  const activeEligibleOptionKeys = new Set(
    activeOptionViews
      .filter(isClassChoiceOptionEligible)
      .map((option) => getClassChoiceOptionKey(option.reference)),
  )
  const activeInitialSelectedIds = activeChoice
    ? (selectionByChoiceId.get(activeChoice.id)?.selected ?? [])
        .map(getClassChoiceOptionKey)
        .filter((key) => activeEligibleOptionKeys.has(key))
    : []
  const activeRequiredCount = activeChoice
    ? getRequiredChoiceSelectionCount(activeChoice, viewingClassLevel)
    : 0

  const confirm = (selected: ClassChoiceOptionView[]) => {
    if (!character || !activeChoice) return
    const previousKeys = new Set(
      (selectionByChoiceId.get(activeChoice.id)?.selected ?? []).map(getClassChoiceOptionKey),
    )
    applyClassChoiceSelection(
      activeChoice,
      selected.map((option) => option.reference),
    )
    if (activeChoice.kind === 'feat' && onFeatOptionsRequired) {
      const newlyAdded = selected.find(
        (option) => !previousKeys.has(getClassChoiceOptionKey(option.reference)),
      )
      const feat = newlyAdded
        ? catalogs.feats.find(
            (entry) =>
              entry.name === newlyAdded.reference.name &&
              (!newlyAdded.reference.source || entry.source === newlyAdded.reference.source),
          )
        : undefined
      if (feat && hasFeatOptions(feat)) onFeatOptionsRequired(feat, activeChoice.id)
    }
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
