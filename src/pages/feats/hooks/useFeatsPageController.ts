import { useCallback, useMemo, useState } from 'react'
import type { CompactPane } from '@/components/ui/SplitPane'
import { useCharacterCalculationContext } from '@/hooks/character/useCharacterCalculationContext'
import { useFeatProvenanceMutations } from '@/hooks/character/useFeatProvenanceMutations'
import { useProvenanceLedger } from '@/hooks/character/useProvenanceLedger'
import { useFilteredGameData } from '@/hooks/data/useFilteredGameData'
import { useClassLookup } from '@/hooks/data/useGameData'
import { useAnchoredHintPosition } from '@/hooks/ui/useAnchoredHintPosition'
import { hasFeatOptions } from '@/lib/5etools/parsers/featOptions'
import {
  buildPrerequisiteSnapshot,
  type PrereqCharacterSnapshot,
} from '@/lib/calculations/prerequisites'
import { getCharacterClassEntries } from '@/lib/characterUtils'
import {
  getFixedFeatOptionKey,
  getFixedSpellcastingClass,
  resolveFixedFeatGrant,
} from '@/lib/featGrants'
import type { ChoiceRecord } from '@/lib/provenance/types'
import { isHintDismissed, setHintDismissed } from '@/lib/storage/hints'
import { countTotalFeatSlots } from '@/pages/build/class/model/pageUtils'
import { useCharacterStore } from '@/store/characterStore'
import type { Class5e, Feat5e, Spell5e } from '@/types/5etools'
import type { FeatOptionSelections } from '@/types/character'

const FEATS_EDIT_HINT_ID = 'feats-edit-setup'
const FEATS_EDIT_BTN_SELECTOR = '[data-feat-edit-setup-btn="true"]'
export const FEATS_HINT_WIDTH = 300
const EMPTY_STRINGS: string[] = []

export type FeatView = 'all' | 'character' | 'bonus'
export type FeatOptionsTarget = Feat5e & {
  grantVariant?: string
  fixedSpellcastingClass?: string
  provenanceChoiceId?: string
  classFeatChoiceId?: string
}
export type SelectedFeatIdentity = { name: string; source: string }

export function getChoiceFeatSelections(
  choice: ChoiceRecord,
): Array<{ name: string; source?: string; options?: FeatOptionSelections }> {
  return choice.selectedRefs ?? choice.selected.map((name) => ({ name }))
}

export function isSelectedFeat(
  selected: SelectedFeatIdentity | null,
  name: string,
  source: string | undefined,
): boolean {
  return selected?.name === name && selected.source === (source ?? '')
}

export function useFeatsPageController() {
  const character = useCharacterStore((state) => state.activeCharacter)
  const calculationContext = useCharacterCalculationContext(character)
  const { feats, spells, classes } = useFilteredGameData()
  const {
    replaceFeatSelections,
    replaceBonusFeatSelections,
    removeFeatChoiceSelection,
    commitFeatWithOptions,
    editFeatWithOptions,
  } = useFeatProvenanceMutations()
  const { ledger, getSourcesRowsBySection } = useProvenanceLedger()
  const [listCollapsed, setListCollapsed] = useState(false)
  const [detailCollapsed, setDetailCollapsed] = useState(false)
  const [compactPane, setCompactPane] = useState<CompactPane>('left')
  const [selectedFeat, setSelectedFeat] = useState<SelectedFeatIdentity | null>(null)
  const [featView, setFeatView] = useState<FeatView>('all')
  const [bonusModalOpen, setBonusModalOpen] = useState(false)
  const [featOptionsTarget, setFeatOptionsTarget] = useState<FeatOptionsTarget | null>(null)
  const [featEditCandidate, setFeatEditCandidate] = useState<{
    feat5e: FeatOptionsTarget
    priorOptions: FeatOptionSelections
  } | null>(null)
  const [featEditTarget, setFeatEditTarget] = useState<{
    feat5e: FeatOptionsTarget
    priorOptions: FeatOptionSelections
  } | null>(null)
  const classLookup = useClassLookup()

  const handleSelectFeat = useCallback((featName: string, featSource: string) => {
    setSelectedFeat({ name: featName, source: featSource })
    setDetailCollapsed(false)
    setCompactPane('right')
  }, [])

  const classProgression = useMemo(() => getCharacterClassEntries(character), [character])
  const fallbackClassByName = useMemo(
    () => new Map((classes as Class5e[]).map((classData) => [classData.name, classData])),
    [classes],
  )
  const totalFeatSlots = useMemo(
    () => countTotalFeatSlots({ classProgression, character, classLookup, fallbackClassByName }),
    [classProgression, character, classLookup, fallbackClassByName],
  )
  const usedASI = character?.feats?.length ?? 0
  const remainingASI = totalFeatSlots - usedASI
  const classProgressionFeats = useMemo(
    () =>
      (character?.classFeatChoices ?? []).flatMap((choice) =>
        choice.feats.map((feat) => ({ choice, feat })),
      ),
    [character?.classFeatChoices],
  )
  const characterSnapshot = useMemo<PrereqCharacterSnapshot>(
    () =>
      buildPrerequisiteSnapshot({
        character,
        classProgression,
        effectiveAbilityScores: calculationContext?.abilityScores.total,
      }),
    [character, classProgression, calculationContext?.abilityScores.total],
  )

  const {
    resolvedOriginChoices,
    resolvedRacialChoices,
    pendingOriginChoices,
    pendingRacialChoices,
  } = useMemo(() => {
    const origin = ledger.choices.filter(
      (choice) => choice.domain === 'feats' && choice.sourceTag.sourceType === 'background',
    )
    const racial = ledger.choices.filter(
      (choice) =>
        choice.domain === 'feats' &&
        (choice.sourceTag.sourceType === 'race' || choice.sourceTag.sourceType === 'subrace'),
    )
    return {
      resolvedOriginChoices: origin.filter((choice) => choice.selected.length > 0),
      resolvedRacialChoices: racial.filter((choice) => choice.selected.length > 0),
      pendingOriginChoices: origin.filter((choice) => choice.selected.length === 0),
      pendingRacialChoices: racial.filter((choice) => choice.selected.length === 0),
    }
  }, [ledger.choices])

  const fixedGrantedFeats = useMemo(
    () =>
      Object.entries(ledger.feats).flatMap(([name, tags]) =>
        tags
          .filter((tag) => tag.grantType === 'fixed')
          .map((tag) => {
            const resolved = resolveFixedFeatGrant(feats as Feat5e[], name, tag)
            return {
              name: resolved.name,
              source: resolved.source,
              sourceType: tag.sourceType,
              sourceLabel: `${tag.sourceType}: ${tag.sourceName}`,
              featData: resolved.feat,
              grantVariant: resolved.variant,
              variantLabel: resolved.variantLabel,
              fixedSpellcastingClass: resolved.fixedSpellcastingClass,
            }
          }),
      ),
    [ledger.feats, feats],
  )
  const { originFixedFeats, racialFixedFeats } = useMemo(
    () => ({
      originFixedFeats: fixedGrantedFeats.filter((feat) => feat.sourceType === 'background'),
      racialFixedFeats: fixedGrantedFeats.filter(
        (feat) => feat.sourceType === 'race' || feat.sourceType === 'subrace',
      ),
    }),
    [fixedGrantedFeats],
  )

  const hasCharacterSection =
    (character?.feats?.length ?? 0) > 0 ||
    classProgressionFeats.length > 0 ||
    racialFixedFeats.length > 0 ||
    resolvedRacialChoices.length > 0 ||
    originFixedFeats.length > 0 ||
    resolvedOriginChoices.length > 0
  const characterFeatCount =
    (character?.feats?.length ?? 0) +
    classProgressionFeats.length +
    racialFixedFeats.length +
    resolvedRacialChoices.reduce((sum, choice) => sum + choice.selected.length, 0) +
    originFixedFeats.length +
    resolvedOriginChoices.reduce((sum, choice) => sum + choice.selected.length, 0)
  const bonusFeats = character?.specialFeats ?? []
  const bonusInitialSelectedIds = useMemo(
    () => (character?.specialFeats ?? []).map((feat) => `${feat.name}|${feat.source ?? ''}`),
    [character?.specialFeats],
  )

  const handleRemoveFeat = useCallback(
    (featName: string, featSource: string) => {
      if (!character) return
      const remaining = (character.feats ?? [])
        .filter((feat) => feat.name !== featName || feat.source !== featSource)
        .map((feat) => ({ name: feat.name, source: feat.source }) as Feat5e)
      replaceFeatSelections(remaining)
      if (isSelectedFeat(selectedFeat, featName, featSource)) setSelectedFeat(null)
    },
    [character, replaceFeatSelections, selectedFeat],
  )
  const handleRemoveGrantedChoice = useCallback(
    (choiceId: string, featName: string, featSource: string) => {
      removeFeatChoiceSelection(choiceId, featName, featSource)
      if (isSelectedFeat(selectedFeat, featName, featSource)) setSelectedFeat(null)
    },
    [removeFeatChoiceSelection, selectedFeat],
  )
  const handleBonusModalConfirm = useCallback(
    (selectedFeats: Feat5e[]) => {
      const previousIds = new Set(
        (character?.specialFeats ?? []).map((feat) => `${feat.name}|${feat.source ?? ''}`),
      )
      replaceBonusFeatSelections(selectedFeats)
      const newlyAdded = selectedFeats.find(
        (feat) => !previousIds.has(`${feat.name}|${feat.source ?? ''}`) && hasFeatOptions(feat),
      )
      setBonusModalOpen(false)
      if (newlyAdded) setFeatOptionsTarget(newlyAdded)
    },
    [character?.specialFeats, replaceBonusFeatSelections],
  )
  const handleRemoveBonusFeat = useCallback(
    (featName: string, featSource: string) => {
      if (!character) return
      replaceBonusFeatSelections(
        (character.specialFeats ?? []).filter(
          (feat) => feat.name !== featName || feat.source !== featSource,
        ),
      )
      if (isSelectedFeat(selectedFeat, featName, featSource)) setSelectedFeat(null)
    },
    [character, replaceBonusFeatSelections, selectedFeat],
  )
  const handleCompleteSetup = useCallback(
    (
      featName: string,
      featSource: string,
      grantVariant?: string,
      provenanceChoiceId?: string,
      classFeatChoiceId?: string,
    ) => {
      const feat5e = (feats as Feat5e[]).find(
        (feat) => feat.name === featName && (feat.source ?? '') === featSource,
      )
      if (!feat5e) return
      setFeatOptionsTarget({
        ...feat5e,
        grantVariant,
        fixedSpellcastingClass: getFixedSpellcastingClass(feat5e, grantVariant),
        provenanceChoiceId,
        classFeatChoiceId,
      })
    },
    [feats],
  )
  const handleFeatOptionsFinish = useCallback(
    (selections: FeatOptionSelections) => {
      if (!featOptionsTarget) return
      commitFeatWithOptions(featOptionsTarget, selections, spells as Spell5e[])
      setFeatOptionsTarget(null)
    },
    [featOptionsTarget, commitFeatWithOptions, spells],
  )
  const handleEditSetup = useCallback(
    (
      featName: string,
      featSource: string,
      grantVariant?: string,
      provenanceChoiceId?: string,
      classFeatChoiceId?: string,
    ) => {
      const feat5e = (feats as Feat5e[]).find(
        (feat) => feat.name === featName && (feat.source ?? '') === featSource,
      )
      const fixedOptions = grantVariant
        ? character?.fixedFeatOptions?.[getFixedFeatOptionKey(featName, featSource, grantVariant)]
        : undefined
      const existing = (character?.feats ?? []).find(
        (feat) => feat.name === featName && feat.source === featSource,
      )
      const choiceOptions = provenanceChoiceId
        ? character?.provenance?.choices
            .find((choice) => choice.id === provenanceChoiceId)
            ?.selectedRefs?.find(
              (selected) => selected.name === featName && (selected.source ?? '') === featSource,
            )?.options
        : undefined
      const classOptions = classFeatChoiceId
        ? character?.classFeatChoices
            ?.find((choice) => choice.id === classFeatChoiceId)
            ?.feats.find((feat) => feat.name === featName && feat.source === featSource)?.options
        : undefined
      const priorOptions = fixedOptions ?? existing?.options ?? choiceOptions ?? classOptions
      if (!feat5e || !priorOptions) return
      setFeatEditCandidate({
        feat5e: {
          ...feat5e,
          grantVariant,
          fixedSpellcastingClass: getFixedSpellcastingClass(feat5e, grantVariant),
          provenanceChoiceId,
          classFeatChoiceId,
        },
        priorOptions,
      })
    },
    [
      feats,
      character?.feats,
      character?.fixedFeatOptions,
      character?.provenance?.choices,
      character?.classFeatChoices,
    ],
  )
  const handleEditBonusSetup = useCallback(
    (featName: string, featSource: string) => {
      const feat5e = (feats as Feat5e[]).find(
        (feat) => feat.name === featName && (feat.source ?? '') === featSource,
      )
      const existing = (character?.specialFeats ?? []).find(
        (feat) => feat.name === featName && feat.source === featSource,
      )
      if (feat5e && existing?.options) {
        setFeatEditCandidate({ feat5e, priorOptions: existing.options })
      }
    },
    [character?.specialFeats, feats],
  )
  const handleEditConfirm = useCallback(() => {
    if (!featEditCandidate) return
    setFeatEditTarget(featEditCandidate)
    setFeatEditCandidate(null)
  }, [featEditCandidate])
  const handleEditFinish = useCallback(
    (selections: FeatOptionSelections) => {
      if (!featEditTarget) return
      editFeatWithOptions(
        featEditTarget.feat5e,
        featEditTarget.priorOptions,
        selections,
        spells as Spell5e[],
      )
      setFeatEditTarget(null)
    },
    [featEditTarget, editFeatWithOptions, spells],
  )

  const pendingOptionFeatIds = useMemo(
    () =>
      new Set(
        (character?.feats ?? [])
          .filter((feat) => {
            if (feat.options) return false
            const data = (feats as Feat5e[]).find(
              (candidate) =>
                candidate.name === feat.name && (candidate.source ?? '') === feat.source,
            )
            return data ? hasFeatOptions(data) : false
          })
          .map((feat) => `${feat.name}|${feat.source}`),
      ),
    [character?.feats, feats],
  )
  const pendingOptionBonusFeatIds = useMemo(
    () =>
      new Set(
        (character?.specialFeats ?? [])
          .filter((feat) => {
            if (feat.options) return false
            const data = (feats as Feat5e[]).find(
              (candidate) =>
                candidate.name === feat.name && (candidate.source ?? '') === feat.source,
            )
            return data ? hasFeatOptions(data) : false
          })
          .map((feat) => `${feat.name}|${feat.source}`),
      ),
    [character?.specialFeats, feats],
  )
  const proficientSkillNames = character?.proficiencies?.skills ?? EMPTY_STRINGS
  const configuredChoiceOptionCount = [...resolvedRacialChoices, ...resolvedOriginChoices].reduce(
    (count, choice) =>
      count + getChoiceFeatSelections(choice).filter((selection) => selection.options).length,
    0,
  )
  const configuredOptionFeatCount =
    (character?.feats ?? []).filter((feat) => feat.options).length +
    (character?.specialFeats ?? []).filter((feat) => feat.options).length +
    classProgressionFeats.filter(({ feat }) => feat.options).length +
    configuredChoiceOptionCount
  const [showEditHint, setShowEditHint] = useState(() => !isHintDismissed(FEATS_EDIT_HINT_ID))
  const hintPosition = useAnchoredHintPosition({
    enabled: showEditHint && configuredOptionFeatCount > 0,
    selector: FEATS_EDIT_BTN_SELECTOR,
  })
  const handleDismissEditHint = useCallback(() => {
    setShowEditHint(false)
    setHintDismissed(FEATS_EDIT_HINT_ID, true)
  }, [])
  const pendingClassOptionCount = classProgressionFeats.filter(({ feat }) => {
    if (feat.options) return false
    const data = (feats as Feat5e[]).find(
      (candidate) => candidate.name === feat.name && (candidate.source ?? '') === feat.source,
    )
    return data ? hasFeatOptions(data) : false
  }).length
  const pendingChoiceOptionCount = [...resolvedRacialChoices, ...resolvedOriginChoices].reduce(
    (count, choice) =>
      count +
      getChoiceFeatSelections(choice).filter((selection) => {
        if (selection.options) return false
        const data = (feats as Feat5e[]).find(
          (candidate) =>
            candidate.name.toLowerCase() === selection.name.toLowerCase() &&
            (selection.source == null || candidate.source === selection.source),
        )
        return data ? hasFeatOptions(data) : false
      }).length,
    0,
  )
  const pendingOptionCount =
    pendingOptionFeatIds.size +
    pendingOptionBonusFeatIds.size +
    pendingClassOptionCount +
    pendingChoiceOptionCount
  const hasPendingWarnings =
    remainingASI > 0 ||
    pendingRacialChoices.length > 0 ||
    pendingOriginChoices.length > 0 ||
    pendingOptionCount > 0
  const activeFeatName = selectedFeat?.name ?? null
  const activeFeatData = (feats as Feat5e[]).find(
    (feat) =>
      feat.name === selectedFeat?.name && (feat.source ?? '') === (selectedFeat?.source ?? ''),
  )

  return {
    activeFeatData,
    activeFeatName,
    bonusFeats,
    bonusInitialSelectedIds,
    bonusModalOpen,
    character,
    characterFeatCount,
    characterSnapshot,
    classProgressionFeats,
    compactPane,
    detailCollapsed,
    featEditCandidate,
    featEditTarget,
    featOptionsTarget,
    feats: feats as Feat5e[],
    featView,
    getSourcesRowsBySection,
    handleBonusModalConfirm,
    handleCompleteSetup,
    handleDismissEditHint,
    handleEditBonusSetup,
    handleEditConfirm,
    handleEditFinish,
    handleEditSetup,
    handleFeatOptionsFinish,
    handleRemoveBonusFeat,
    handleRemoveFeat,
    handleRemoveGrantedChoice,
    handleSelectFeat,
    hasCharacterSection,
    hasPendingWarnings,
    hintPosition,
    listCollapsed,
    originFixedFeats,
    pendingOptionBonusFeatIds,
    pendingOptionCount,
    pendingOptionFeatIds,
    pendingOriginChoices,
    pendingRacialChoices,
    proficientSkillNames,
    racialFixedFeats,
    remainingASI,
    resolvedOriginChoices,
    resolvedRacialChoices,
    selectedFeat,
    setBonusModalOpen,
    setCompactPane,
    setDetailCollapsed,
    setFeatEditCandidate,
    setFeatEditTarget,
    setFeatOptionsTarget,
    setFeatView,
    setListCollapsed,
    showBonusGroup: featView === 'all' || featView === 'bonus',
    showCharacterGroup: featView === 'all' || featView === 'character',
    showEditHint,
    totalFeatSlots,
    usedASI,
  }
}
