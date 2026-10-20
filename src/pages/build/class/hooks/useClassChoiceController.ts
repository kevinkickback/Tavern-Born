import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useClassProvenanceMutations } from '@/hooks/character/useClassProvenanceMutations'
import { useItemPropertyLookup, useItemTypeLookup } from '@/hooks/data/useGameData'
import { getRequiredChoiceSelectionCount } from '@/lib/5etools/classChoiceNormalization'
import { findClassReference } from '@/lib/5etools/classReference'
import { hasFeatOptions } from '@/lib/5etools/parsers/featOptions'
import { hasCurrentCharacterSourceContext } from '@/lib/character/characterSourceContext'
import { getEffectiveClassChoiceSelections } from '@/lib/character/classChoiceActivity'
import { getFeatureOwnerKey } from '@/lib/character/classChoiceIdentity'
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
  hasClassProficiencyRecovery,
  refreshClassProficiencyState,
} from '@/lib/character/classProficiencySelections'
import {
  type FeatureOptionSelectionState,
  getFeatureOptionSelectionStates,
} from '@/lib/character/featureOptionSelections'
import {
  getHistoricalProficiencyRule,
  resolveHistoricalProficiencyChoice,
} from '@/lib/character/historicalProficiencyChoices'
import {
  hasNaturalExplorerRecovery,
  scopeNaturalExplorerOptions,
} from '@/lib/character/naturalExplorerSelections'
import { getOptionalClassPoolSelectionSection } from '@/lib/character/optionalClassAdoptionRules'
import { createOptionalClassFeatureActivity } from '@/lib/character/optionalClassFeatureActivity'
import { getOptionalPoolSelectionHandle } from '@/lib/character/optionalClassPoolSelections'
import { getSubclassConfigurations } from '@/lib/character/subclassConfigurations'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e, Subclass5e } from '@/types/5etools'
import type { Character, CharacterClassEntry } from '@/types/character'
import type { NormalizedCharacterChoice } from '@/types/classRules'

interface ClassChoiceControllerParams {
  character: Character | null
  viewingClassData?: Class5e
  viewingClassEntry?: CharacterClassEntry
  viewingSubclassData?: Subclass5e
  viewingClassLevel: number
  includeClassFeatureVariants?: boolean
  catalogs: Omit<
    ClassChoiceCatalogs,
    'itemPropertyByAbbr' | 'itemTypeByAbbr' | 'weaponProficiencies'
  >
  configurationPaused?: boolean
  onFeatOptionsRequired?: (feat: ClassChoiceCatalogs['feats'][number], choiceId: string) => void
}

const EMPTY_WEAPON_PROFICIENCIES: readonly string[] = []

export function useClassChoiceController({
  character: savedCharacter,
  viewingClassData,
  viewingClassEntry,
  viewingSubclassData,
  viewingClassLevel,
  includeClassFeatureVariants = false,
  catalogs,
  onFeatOptionsRequired,
  configurationPaused = false,
}: ClassChoiceControllerParams) {
  const sourceData = useGameDataStore((state) => state.gameData)
  const character = useMemo(
    () =>
      savedCharacter &&
      refreshClassProficiencyState(savedCharacter, catalogs.classes ?? [], {
        ...catalogs,
        featExpertiseFeats: catalogs.feats,
      }),
    [savedCharacter, catalogs],
  )
  const { applyClassChoiceSelection, retainSavedFeatureOptions, setHistoricalProficiencySetup } =
    useClassProvenanceMutations()
  const activity = useMemo(
    () => character && createOptionalClassFeatureActivity(character, catalogs),
    [character, catalogs],
  )
  const itemTypeByAbbr = useItemTypeLookup()
  const itemPropertyByAbbr = useItemPropertyLookup()
  const weaponProficiencies = character?.proficiencies.weapons ?? EMPTY_WEAPON_PROFICIENCIES
  const ownerContext = (subclassName?: string, subclassSource?: string, actor = character) =>
    JSON.stringify([
      actor?.id,
      getFeatureOwnerKey(
        viewingClassEntry?.name ?? viewingClassData?.name ?? '',
        viewingClassEntry?.source ?? viewingClassData?.source,
        subclassName,
        subclassSource,
      ),
      viewingClassLevel,
      includeClassFeatureVariants,
      actor?.optionalClassFeatureAdoptions,
    ])
  const contextKey = ownerContext(
    viewingClassEntry?.subclass ?? viewingSubclassData?.name,
    viewingClassEntry?.subclassSource ?? viewingSubclassData?.source,
  )
  const [request, setRequest] = useState<{
    id: string
    contextKey: string
    savedHandle?: string
  } | null>(null)
  const [queue, setQueue] = useState<{
    ids: string[]
    contextKey: string
    catalogs: typeof catalogs
  } | null>(null)
  const choices = useMemo(
    () =>
      viewingClassData && activity
        ? getCharacterClassChoices(viewingClassData, viewingSubclassData, activity, catalogs)
            .filter((choice) => choice.level <= viewingClassLevel)
            .map((choice) =>
              character ? resolveHistoricalProficiencyChoice(character, choice) : choice,
            )
        : [],
    [
      activity,
      includeClassFeatureVariants,
      viewingClassData,
      viewingClassLevel,
      viewingSubclassData,
      catalogs,
      character,
    ],
  )
  const persistedSelectionByChoiceId = useMemo(
    () =>
      new Map(
        (character
          ? getEffectiveClassChoiceSelections(
              character,
              viewingClassData ? [viewingClassData] : [],
              catalogs,
            )
          : []
        )
          .filter((entry) => !entry.inactive)
          .map((entry) => [entry.choiceId, entry]),
      ),
    [character, viewingClassData, catalogs],
  )
  const resolvedCatalogs = useMemo<ClassChoiceCatalogs>(
    () => ({ ...catalogs, itemPropertyByAbbr, itemTypeByAbbr, weaponProficiencies }),
    [catalogs, itemPropertyByAbbr, itemTypeByAbbr, weaponProficiencies],
  )
  const featureOptionStates = useMemo(
    () =>
      character
        ? getFeatureOptionSelectionStates(
            character,
            viewingClassData ? [viewingClassData] : [],
            resolvedCatalogs,
          )
        : [],
    [character, viewingClassData, resolvedCatalogs],
  )
  const recoveries = useMemo(() => {
    const viewed = viewingClassEntry ?? viewingClassData
    return featureOptionStates.filter((state) => {
      if (!state.recovery) return false
      if (state.storm || state.literalGroup || state.proficiency || state.optionalPool)
        return (
          !!state.owner &&
          !!viewed &&
          getFeatureOwnerKey(state.selection.className, state.selection.classSource) ===
            getFeatureOwnerKey(viewed.name, viewed.source)
        )
      return !!state.classData && (!state.selection.subclassName || !!state.subclass)
    })
  }, [featureOptionStates, viewingClassEntry, viewingClassData])
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
            scopeNaturalExplorerOptions(
              choice,
              resolveClassChoiceOptions(
                choice,
                resolvedCatalogs,
                selected,
                viewingClassLevel,
                character ?? undefined,
              ),
              character?.classChoiceSelections ?? [],
            )
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
      character,
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
  const configurations = useMemo(
    () => getSubclassConfigurations(visibleChoices, viewingClassData, viewingSubclassData),
    [visibleChoices, viewingClassData, viewingSubclassData],
  )
  const queuedChoice =
    queue?.contextKey === contextKey && queue.catalogs === catalogs
      ? queue.ids
          .map((id) => configurations.find((choice) => choice.id === id))
          .find(
            (choice) =>
              choice &&
              (selectedViewsByChoiceId.get(choice.id) ?? []).filter(isClassChoiceOptionEligible)
                .length < getRequiredChoiceSelectionCount(choice, viewingClassLevel),
          )
      : undefined
  useEffect(() => {
    if (queue && !queuedChoice) setQueue(null)
    if (request && request.contextKey !== contextKey) setRequest(null)
    if (request?.savedHandle !== undefined) {
      const latest = character?.classChoiceSelections?.find((row) => row.choiceId === request.id)
      if (!latest || getOptionalPoolSelectionHandle(latest) !== request.savedHandle)
        setRequest(null)
    }
    if (
      request &&
      !choices.some((choice) => choice.id === request.id) &&
      !recoveries.some((state) => state.selection.choiceId === request.id)
    )
      setRequest(null)
  }, [queue, queuedChoice, request, contextKey, choices, recoveries, character])
  const activeId =
    request?.contextKey === contextKey
      ? request.id
      : configurationPaused
        ? undefined
        : queuedChoice?.id
  const activeSaved = featureOptionStates.find((state) => state.selection.choiceId === activeId)
  const resolvedActiveChoice = choices.find((choice) => choice.id === activeId)
  const activeRemovalOnly = activeSaved?.recovery ?? false
  const activeDisplayChoice =
    activeRemovalOnly && activeSaved
      ? {
          id: activeSaved.selection.choiceId,
          label: activeSaved.selection.label,
          kind: activeSaved.selection.kind,
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
    ? (activeRemovalOnly && activeSaved
        ? activeSaved.selection.selected
        : (selectionByChoiceId.get(activeDisplayChoice.id)?.selected ?? [])
      )
        .map(getClassChoiceOptionKey)
        .filter((key) => activeOptionKeys.has(key))
    : []
  const activeRequiredCount =
    !activeRemovalOnly && resolvedActiveChoice
      ? getRequiredChoiceSelectionCount(resolvedActiveChoice, viewingClassLevel)
      : 0
  const close = () => {
    setRequest(null)
    setQueue(null)
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
      try {
        retainSavedFeatureOptions(
          activeSaved.selection.choiceId,
          keys,
          activeSaved.optionalPool ? request?.savedHandle : undefined,
        )
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'The saved choice changed. Review it before confirming.',
        )
        return
      }
      close()
      return
    }
    const current = resolvedActiveChoice
    if (!current) return
    {
      const currentViews = new Map(
        activeOptionViews.map((view) => [getClassChoiceOptionKey(view.reference), view]),
      )
      const previous = new Set(
        (selectionByChoiceId.get(current.id)?.selected ?? []).map(getClassChoiceOptionKey),
      )
      if (
        selected.some((view) => {
          const key = getClassChoiceOptionKey(view.reference)
          const live = currentViews.get(key)
          return !live || (!isClassChoiceOptionEligible(live) && !previous.has(key))
        })
      ) {
        toast.error('Source rules changed. Review the available choices before confirming.')
        return
      }
      selected = selected.flatMap((view) => {
        const live = currentViews.get(getClassChoiceOptionKey(view.reference))
        return live ? [live] : []
      })
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
    try {
      const unchanged =
        previousKeys.size === confirmedSelections.length &&
        confirmedSelections.every((option) =>
          previousKeys.has(getClassChoiceOptionKey(option.reference)),
        )
      if (!unchanged) {
        applyClassChoiceSelection(
          current,
          confirmedSelections.map((option) => option.reference),
        )
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'This choice could not be verified. Review the current source rules.',
      )
      return
    }
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
    setRequest(null)
    setQueue((pending) =>
      pending ? { ...pending, ids: pending.ids.filter((id) => id !== current.id) } : null,
    )
  }

  return {
    choices: visibleChoices,
    configurations,
    configureSubclass: (subclass: Subclass5e) => {
      if (!viewingClassData || !character) return
      const latest = useCharacterStore.getState().activeCharacter
      if (
        !hasCurrentCharacterSourceContext(
          latest,
          savedCharacter,
          useGameDataStore.getState().gameData,
          sourceData,
        ) ||
        !latest
      )
        return
      const owner = findClassReference(viewingClassData, latest.classProgression)
      if (
        !owner ||
        owner.levels !== viewingClassLevel ||
        owner.subclass !== subclass.name ||
        owner.subclassSource !== subclass.source
      )
        return
      const candidates = getSubclassConfigurations(
        getCharacterClassChoices(
          viewingClassData,
          subclass,
          createOptionalClassFeatureActivity(latest, catalogs),
          catalogs,
        ),
        viewingClassData,
        subclass,
      ).filter((choice) => choice.level <= viewingClassLevel)
      setRequest(null)
      setQueue({
        ids: candidates.map((choice) => choice.id),
        contextKey: ownerContext(subclass.name, subclass.source, latest),
        catalogs,
      })
    },
    recoveries,
    diagnostics:
      viewingClassData && activity
        ? getCharacterClassChoiceDiagnostics(
            viewingClassData,
            viewingSubclassData,
            activity,
            catalogs,
          ).filter(
            (diagnostic) =>
              (diagnostic.level === undefined || diagnostic.level <= viewingClassLevel) &&
              !hasNaturalExplorerRecovery(diagnostic, featureOptionStates) &&
              !hasClassProficiencyRecovery(diagnostic, featureOptionStates),
          )
        : [],
    selectionByChoiceId,
    selectedViewsByChoiceId,
    activeChoice: activeDisplayChoice,
    activeRemovalOnly,
    activeOptionViews,
    activeInitialSelectedIds,
    activeRequiredCount,
    historicalSetup:
      activeDisplayChoice?.id &&
      !activeRemovalOnly &&
      getHistoricalProficiencyRule(activeDisplayChoice.id)
        ? {
            name: getHistoricalProficiencyRule(activeDisplayChoice.id)!.proficiencyAtGain!,
            alreadyProficient: selectionByChoiceId.get(activeDisplayChoice.id)?.proficiencyAtGain
              ?.alreadyProficient,
            onConfirm: (alreadyProficient: boolean) => {
              if (!resolvedActiveChoice) return
              try {
                setHistoricalProficiencySetup(resolvedActiveChoice, alreadyProficient)
                if (!alreadyProficient) close()
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : 'This setup could not be verified.',
                )
              }
            },
          }
        : undefined,
    open: (choice: NormalizedCharacterChoice) => {
      setQueue(null)
      const saved = character?.classChoiceSelections?.find((row) => row.choiceId === choice.id)
      setRequest((previous) =>
        previous?.id === choice.id && previous.contextKey === contextKey
          ? previous
          : {
              id: choice.id,
              contextKey,
              savedHandle:
                saved && getOptionalClassPoolSelectionSection(saved)
                  ? getOptionalPoolSelectionHandle(saved)
                  : undefined,
            },
      )
    },
    openRecovery: (state: FeatureOptionSelectionState) => {
      setQueue(null)
      setRequest((previous) =>
        previous?.id === state.selection.choiceId && previous.contextKey === contextKey
          ? previous
          : {
              id: state.selection.choiceId,
              contextKey,
              savedHandle: state.optionalPool
                ? getOptionalPoolSelectionHandle(state.selection)
                : undefined,
            },
      )
    },
    close,
    confirm,
  }
}
