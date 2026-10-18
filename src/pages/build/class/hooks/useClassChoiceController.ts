import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useClassProvenanceMutations } from '@/hooks/character/useClassProvenanceMutations'
import { useItemPropertyLookup, useItemTypeLookup } from '@/hooks/data/useGameData'
import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import { hasFeatOptions } from '@/lib/5etools/parsers/featOptions'
import {
  type ClassChoiceCatalogs,
  type ClassChoiceOptionView,
  getCharacterClassChoiceDiagnostics,
  getCharacterClassChoices,
  getClassChoiceOptionKey,
  isClassChoiceOptionEligible,
  resolveClassChoiceOptions,
} from '@/lib/character/classChoiceOptions'
import {
  type FeatureOptionSelectionState,
  getFeatureOptionSelectionStates,
} from '@/lib/character/featureOptionSelections'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'

interface ClassChoiceControllerParams {
  character: Character | null
  viewingClassData?: Class5e
  viewingSubclassData?: Subclass5e
  viewingClassLevel: number
  includeClassFeatureVariants?: boolean
  catalogs: Omit<
    ClassChoiceCatalogs,
    'itemPropertyByAbbr' | 'itemTypeByAbbr' | 'weaponProficiencies'
  >
  onFeatOptionsRequired?: (feat: ClassChoiceCatalogs['feats'][number], choiceId: string) => void
}

const EMPTY_WEAPON_PROFICIENCIES: readonly string[] = []

export function useClassChoiceController({
  character,
  viewingClassData,
  viewingSubclassData,
  viewingClassLevel,
  includeClassFeatureVariants = false,
  catalogs,
  onFeatOptionsRequired,
}: ClassChoiceControllerParams) {
  const { applyClassChoiceSelection, retainSavedFeatureOptions } = useClassProvenanceMutations()
  const itemTypeByAbbr = useItemTypeLookup()
  const itemPropertyByAbbr = useItemPropertyLookup()
  const weaponProficiencies = character?.proficiencies.weapons ?? EMPTY_WEAPON_PROFICIENCIES
  const [activeChoice, setActiveChoice] = useState<NormalizedCharacterChoice | null>(null)
  const [activeRecoveryId, setActiveRecoveryId] = useState<string | null>(null)
  const choices = useMemo(
    () =>
      viewingClassData
        ? getCharacterClassChoices(
            viewingClassData,
            viewingSubclassData,
            includeClassFeatureVariants,
          ).filter((choice) => choice.level <= viewingClassLevel)
        : [],
    [includeClassFeatureVariants, viewingClassData, viewingClassLevel, viewingSubclassData],
  )
  const persistedSelectionByChoiceId = useMemo(
    () =>
      new Map(
        (character?.classChoiceSelections ?? [])
          .filter((entry) => !entry.inactive)
          .map((entry) => [entry.choiceId, entry]),
      ),
    [character?.classChoiceSelections],
  )
  const resolvedCatalogs = useMemo<ClassChoiceCatalogs>(
    () => ({ ...catalogs, itemPropertyByAbbr, itemTypeByAbbr, weaponProficiencies }),
    [catalogs, itemPropertyByAbbr, itemTypeByAbbr, weaponProficiencies],
  )
  const featureOptionStates = useMemo(
    () =>
      character && viewingClassData
        ? getFeatureOptionSelectionStates(character, [viewingClassData], resolvedCatalogs)
        : [],
    [character, viewingClassData, resolvedCatalogs],
  )
  const recoveries = useMemo(
    () =>
      featureOptionStates.filter(
        (state) =>
          state.recovery && state.classData && (!state.selection.subclassName || state.subclass),
      ),
    [featureOptionStates],
  )
  const visibleChoices = useMemo(
    () =>
      choices.filter(
        (choice) => !recoveries.some((state) => state.selection.choiceId === choice.id),
      ),
    [choices, recoveries],
  )
  const optionViewsByChoiceId = useMemo(
    () =>
      new Map(
        choices.map((choice) => {
          const selected = persistedSelectionByChoiceId.get(choice.id)?.selected ?? []
          const state = featureOptionStates.find((entry) => entry.selection.choiceId === choice.id)
          const views =
            state?.options ??
            resolveClassChoiceOptions(choice, resolvedCatalogs, selected, viewingClassLevel)
          return [
            choice.id,
            state
              ? views.map((view) => {
                  const index = state.selection.selected.findIndex(
                    (row) =>
                      getClassChoiceOptionKey(row) === getClassChoiceOptionKey(view.reference),
                  )
                  return index < 0
                    ? view
                    : { ...view, entries: state.details[index]?.entries ?? view.entries }
                })
              : views,
          ]
        }),
      ),
    [
      choices,
      persistedSelectionByChoiceId,
      resolvedCatalogs,
      viewingClassLevel,
      featureOptionStates,
    ],
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
  const activeId = activeRecoveryId ?? activeChoice?.id
  const activeSaved = featureOptionStates.find((state) => state.selection.choiceId === activeId)
  const resolvedActiveChoice =
    activeChoice?.kind === 'feature-option'
      ? choices.find((choice) => choice.id === activeChoice.id)
      : (activeChoice ?? (activeRecoveryId ? activeSaved?.choice : undefined))
  const activeRemovalOnly = activeSaved?.recovery ?? false
  const activeDisplayChoice =
    activeRemovalOnly && activeSaved
      ? {
          id: activeSaved.selection.choiceId,
          label: activeSaved.selection.label,
          kind: 'feature-option' as const,
          optionFilter: undefined,
        }
      : resolvedActiveChoice
  const activeOptionViews =
    activeRemovalOnly && activeSaved
      ? activeSaved.selection.selected.map((reference, index) => ({
          reference,
          availability: 'retained' as const,
          entries: activeSaved.details[index]?.entries ?? [],
        }))
      : resolvedActiveChoice
        ? (optionViewsByChoiceId.get(resolvedActiveChoice.id) ?? [])
        : []
  const activeOptionKeys = new Set(
    activeOptionViews.map((option) => getClassChoiceOptionKey(option.reference)),
  )
  const activeInitialSelectedIds = activeDisplayChoice
    ? (selectionByChoiceId.get(activeDisplayChoice.id)?.selected ?? [])
        .map(getClassChoiceOptionKey)
        .filter((key) => activeOptionKeys.has(key))
    : []
  const activeRequiredCount =
    !activeRemovalOnly && resolvedActiveChoice
      ? getRequiredChoiceSelectionCount(resolvedActiveChoice, viewingClassLevel)
      : 0
  const close = () => {
    setActiveChoice(null)
    setActiveRecoveryId(null)
  }
  const confirm = (selected: ClassChoiceOptionView[]) => {
    if (!character || !activeDisplayChoice) return
    if (activeRemovalOnly && activeSaved) {
      const keys = selected.map((option) => getClassChoiceOptionKey(option.reference))
      const previous = new Set(activeSaved.selection.selected.map(getClassChoiceOptionKey))
      if (keys.some((key) => !previous.has(key))) {
        toast.error('Source rules changed. Review the saved choices before confirming.')
        return
      }
      retainSavedFeatureOptions(activeSaved.selection.choiceId, keys)
      close()
      return
    }
    const current = resolvedActiveChoice
    if (!current) return
    if (current.kind === 'feature-option') {
      const currentViews = new Map(
        activeOptionViews.map((view) => [getClassChoiceOptionKey(view.reference), view]),
      )
      if (selected.some((view) => !currentViews.has(getClassChoiceOptionKey(view.reference)))) {
        toast.error('Source rules changed. Review the available choices before confirming.')
        return
      }
      selected = selected.map((view) => currentViews.get(getClassChoiceOptionKey(view.reference))!)
    }
    const eligibleSelections = selected.filter(isClassChoiceOptionEligible)
    const retainedSelections = selected.filter((option) => !isClassChoiceOptionEligible(option))
    const confirmedSelections = [
      ...eligibleSelections,
      ...retainedSelections.slice(0, Math.max(0, activeRequiredCount - eligibleSelections.length)),
    ]
    const previousKeys = new Set(
      (selectionByChoiceId.get(current.id)?.selected ?? []).map(getClassChoiceOptionKey),
    )
    applyClassChoiceSelection(
      current,
      confirmedSelections.map((option) => option.reference),
    )
    if (current.kind === 'feat' && onFeatOptionsRequired) {
      const newlyAdded = confirmedSelections.find(
        (option) => !previousKeys.has(getClassChoiceOptionKey(option.reference)),
      )
      const feat = newlyAdded
        ? catalogs.feats.find(
            (entry) =>
              entry.name === newlyAdded.reference.name &&
              (!newlyAdded.reference.source || entry.source === newlyAdded.reference.source),
          )
        : undefined
      if (feat && hasFeatOptions(feat)) onFeatOptionsRequired(feat, current.id)
    }
    close()
  }

  return {
    choices: visibleChoices,
    recoveries,
    diagnostics: viewingClassData
      ? getCharacterClassChoiceDiagnostics(
          viewingClassData,
          viewingSubclassData,
          includeClassFeatureVariants,
          catalogs,
        ).filter(
          (diagnostic) => diagnostic.level === undefined || diagnostic.level <= viewingClassLevel,
        )
      : [],
    selectionByChoiceId,
    selectedViewsByChoiceId,
    activeChoice: activeDisplayChoice,
    activeRemovalOnly,
    activeOptionViews,
    activeInitialSelectedIds,
    activeRequiredCount,
    open: (choice: NormalizedCharacterChoice) => {
      setActiveRecoveryId(null)
      setActiveChoice(choice)
    },
    openRecovery: (state: FeatureOptionSelectionState) => {
      setActiveChoice(null)
      setActiveRecoveryId(state.selection.choiceId)
    },
    close,
    confirm,
  }
}
