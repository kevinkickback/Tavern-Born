import { Warning } from '@phosphor-icons/react'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { toast } from 'sonner'
import { useRulesPreview } from '@/components/editor/RulesPreviewManager'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useWizardGameData } from '@/hooks/data/useWizardGameData'
import { useAsyncAction } from '@/hooks/ui/useAsyncAction'
import { hasAvailableReprintPair } from '@/lib/5etools/reprints'
import type { AbilityScoreMethod } from '@/lib/calculations/abilityScoreMethods'
import {
  getBackgroundAbilityData,
  makeDefaultAbilityScores,
  makeDefaultStandardArrayAssignment,
} from '@/lib/calculations/abilityScores'
import { getCachedCharacterCalculationContext } from '@/lib/calculations/cachedCharacterCalculationContext'
import { ABILITY_SCORE_MIN, POINT_BUY_MIN } from '@/lib/calculations/gameRules'
import { isFixedBackgroundAbilityBlock } from '@/lib/calculations/originAbilityChoices'
import { normalizeBackgroundForOriginSystem } from '@/lib/calculations/originSystem'
import { getVariantRuleContentAvailability } from '@/lib/calculations/variantRuleAvailability'
import {
  applyBackgroundAbilityChoicesCommand,
  applyBackgroundSelectionCommand,
} from '@/lib/character/commands/backgroundCommands'
import { applyClassSelectionCommand } from '@/lib/character/commands/classCommands'
import { synchronizeCreatorRaceChoices } from '@/lib/character/commands/creatorRaceChoices'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import {
  buildInitialCharacter,
  getInitialEquipmentPolicy,
} from '@/lib/character/commands/originSelectionCommand'
import { getEffectiveMaxHP } from '@/lib/characterUtils'
import { resolveRaceGrantFilterOptions } from '@/lib/provenance/raceGrantFilterOptions'
import { getEffectiveSources, normalizeSelectableAllowedSources } from '@/lib/sourceCompatibility'
import { SOURCE_PRESETS } from '@/lib/sourcePresets'
import { cn } from '@/lib/utils'
import { buildToolSubtypeOptionsByKind } from '@/pages/build/proficiencies/model/data'
import { createCharacterEditingDraft } from '@/store/characterEditingContext'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { AbilityScores, Character } from '@/types/character'
import type { CreatorChoiceReview } from './CreatorChoiceDetails'
import { INITIAL_CHARACTER_DATA, WIZARD_STEPS } from './constants'
import { getCreatorChoiceGroups } from './creatorChoiceGroups'
import {
  AbilityScoresStep,
  BackgroundStep,
  BasicsStep,
  ClassStep,
  ContentStep,
  RaceStep,
  ReviewStep,
  RulesStep,
} from './steps'
import type { CharacterWizardData, WizardStepId } from './types'
import { useCreatorRaceDraft } from './useCreatorRaceDraft'
import { validateStep } from './validation'
import { WizardFooter } from './WizardFooter'

interface CharacterCreationWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const STEP_COMPONENTS = {
  basics: BasicsStep,
  rules: RulesStep,
  content: ContentStep,
  race: RaceStep,
  class: ClassStep,
  background: BackgroundStep,
  abilities: AbilityScoresStep,
  review: ReviewStep,
} satisfies Record<WizardStepId, unknown>

function getDefaultAbilityScoresForMethod(method: AbilityScoreMethod): AbilityScores {
  if (method === 'standard-array') return makeDefaultStandardArrayAssignment()
  if (method === 'custom') return makeDefaultAbilityScores(ABILITY_SCORE_MIN)
  return makeDefaultAbilityScores(POINT_BUY_MIN)
}

function sameWizardValue(left: unknown, right: unknown, sourceSelection = false): boolean {
  if (left === right) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  if (sourceSelection && Array.isArray(left) && Array.isArray(right)) {
    return sameWizardValue([...left].sort(), [...right].sort())
  }
  const keys = Object.keys(left)
  const otherKeys = Object.keys(right)
  return (
    keys.length === otherKeys.length &&
    keys.every(
      (key) =>
        otherKeys.includes(key) &&
        sameWizardValue(
          (left as Record<string, unknown>)[key],
          (right as Record<string, unknown>)[key],
        ),
    )
  )
}

export function CharacterCreationWizard({
  open: requestedOpen,
  onOpenChange,
}: CharacterCreationWizardProps) {
  const activating = useGameDataStore((state) => state.isCatalogActivating)
  const protectCatalog = useGameDataStore((state) => state.protectCatalog)
  const open = requestedOpen && !activating
  useLayoutEffect(() => {
    if (open) return protectCatalog()
  }, [open, protectCatalog])
  const { setPortalHost } = useRulesPreview()
  const addCharacter = useCharacterStore((state) => state.addCharacter)
  const setActiveCharacter = useCharacterStore((state) => state.setActiveCharacter)
  const isBundledSrd = useGameDataStore(
    (state) => (state.sessionBundledSource ?? state.dataSourceConfig)?.type === 'bundled',
  )
  const gameData = useGameDataStore((state) => state.gameData)
  const [currentStep, setCurrentStep] = useState(1)
  const [completedThrough, setCompletedThrough] = useState(0)
  const activeStep = WIZARD_STEPS[currentStep - 1]
  const stepId = activeStep?.id
  const StepIcon = activeStep?.icon
  const [characterData, setCharacterData] = useState<CharacterWizardData>(INITIAL_CHARACTER_DATA)
  const [choicesPending, setChoicesPending] = useState(false)
  const choicesReviewRef = useRef<CreatorChoiceReview>(null)
  const [choicesDraft, setChoicesDraft] = useState<{
    rulesKey: string
    raceSnapshot: Character
    store: ReturnType<typeof createCharacterEditingDraft>
  }>()
  const [originDraftError, setOriginDraftError] = useState<string>()
  const originalValues = useRef<Record<string, unknown>>({})
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmResetChoices, setConfirmResetChoices] = useState(false)
  const resetChoicesOrigin = useRef<HTMLElement | null>(null)
  const discardOrigin = useRef<HTMLElement | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const { isPending: isCreating, run: runCreation } = useAsyncAction()
  const wizardData = useWizardGameData({
    allowedSources: characterData.allowedSources,
    originSystem: characterData.originSystem,
    preferNewerPrintings: characterData.variantRules?.preferNewerPrintings,
  })
  const raceResolution = useMemo(
    () =>
      wizardData.resolveRace({
        name: characterData.race,
        source: characterData.raceSource,
        subraceName: characterData.subrace,
        subraceSource: characterData.subraceSource,
      }),
    [
      wizardData.resolveRace,
      characterData.race,
      characterData.raceSource,
      characterData.subrace,
      characterData.subraceSource,
    ],
  )
  const resolveRaceChoiceOptions = useCallback(
    (domain: 'armor' | 'weapons', fromFilter: string) =>
      resolveRaceGrantFilterOptions(domain, fromFilter, {
        items: wizardData.items,
        itemsBase: wizardData.itemsBase,
        allowedSources: characterData.allowedSources,
      }),
    [wizardData.items, wizardData.itemsBase, characterData.allowedSources],
  )
  const raceDraft = useCreatorRaceDraft(
    open && stepId === 'race',
    characterData,
    raceResolution,
    wizardData,
    resolveRaceChoiceOptions,
  )
  const preferNewerPrintingsAvailable = useMemo(() => {
    if (!gameData) return false
    const effectiveSources = getEffectiveSources(
      characterData.allowedSources ?? [],
      characterData.originSystem,
      wizardData.sources,
    )
    return hasAvailableReprintPair(gameData, effectiveSources)
  }, [characterData.allowedSources, characterData.originSystem, gameData, wizardData.sources])
  const variantRuleAvailability = getVariantRuleContentAvailability({
    classes: wizardData.classes,
    classFeatures: wizardData.classFeatures,
    optionalFeatures: wizardData.optionalfeatures,
    preferNewerPrintingsAvailable,
  })

  useEffect(() => {
    if (!open || wizardData.sources.length === 0) return
    setCharacterData((previous) => {
      if ('allowedSources' in originalValues.current) return previous
      const ruleset = previous.originSystem
      const selected = normalizeSelectableAllowedSources(
        previous.allowedSources,
        ruleset,
        wizardData.sources,
      )
      const recommended = SOURCE_PRESETS.find((preset) => preset.id === 'recommended')
      const availableSources = new Set(wizardData.sources.map((source) => source.abbreviation))
      const allowedSources =
        selected.length > 0
          ? selected
          : normalizeSelectableAllowedSources(
              recommended?.abbreviations.filter((source) => availableSources.has(source)) ?? [],
              ruleset,
              wizardData.sources,
            )
      return sameWizardValue(allowedSources, previous.allowedSources, true)
        ? previous
        : { ...previous, allowedSources }
    })
  }, [open, wizardData.sources])

  const resetAndClose = () => {
    discardOrigin.current = null
    setConfirmDiscard(false)
    setConfirmResetChoices(false)
    resetChoicesOrigin.current = null
    originalValues.current = {}
    setCurrentStep(1)
    setCompletedThrough(0)
    setCharacterData(INITIAL_CHARACTER_DATA)
    setChoicesPending(false)
    raceDraft.reset()
    setChoicesDraft(undefined)
    setOriginDraftError(undefined)
    setValidationError(null)
    onOpenChange(false)
  }

  const handleClose = () => {
    if (isCreating) return
    const hasUnsavedInput = Object.entries(originalValues.current).some(
      ([key, value]) =>
        !sameWizardValue(
          value,
          characterData[key as keyof CharacterWizardData],
          key === 'allowedSources',
        ),
    )
    if (hasUnsavedInput) {
      discardOrigin.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      setConfirmDiscard(true)
    } else resetAndClose()
  }

  const background = wizardData.resolveBackground({
    name: characterData.background,
    source: characterData.backgroundSource,
  })
  const backgroundAbilityData = getBackgroundAbilityData(
    normalizeBackgroundForOriginSystem(background, characterData.originSystem),
  )
  const backgroundBlockIndex = characterData.backgroundAsi?.blockIndex ?? 0
  const backgroundBlock = backgroundAbilityData.blocks[backgroundBlockIndex]
  const fixedBackgroundAsi = backgroundBlock && isFixedBackgroundAbilityBlock(backgroundBlock)
  const backgroundAsi = fixedBackgroundAsi
    ? { blockIndex: backgroundBlockIndex, choices: backgroundBlock.from }
    : characterData.backgroundAsi
  const classEntity = wizardData.resolveClass({
    name: characterData.class,
    source: characterData.classSource,
  })
  const rulesKey = JSON.stringify([
    characterData.originSystem,
    [...characterData.allowedSources].sort(),
    characterData.variantRules,
  ])
  const raceSnapshot = raceDraft.store?.getState().activeCharacter
  const previousRace = choicesDraft?.raceSnapshot
  const canRetainOriginDraft =
    !!previousRace &&
    !!raceSnapshot &&
    choicesDraft?.rulesKey === rulesKey &&
    previousRace.race === raceSnapshot.race &&
    previousRace.raceSource === raceSnapshot.raceSource &&
    previousRace.subrace === raceSnapshot.subrace &&
    previousRace.subraceSource === raceSnapshot.subraceSource

  useLayoutEffect(() => {
    if (!open || (stepId !== 'class' && stepId !== 'background') || !raceSnapshot || !classEntity)
      return
    const old = canRetainOriginDraft ? choicesDraft?.store.getState().activeCharacter : undefined
    const creating = !old
    try {
      let character =
        old ??
        buildInitialCharacter(
          {
            initial: {
              name: characterData.name,
              originSystem: characterData.originSystem,
              allowedSources: characterData.allowedSources,
              abilityScores: characterData.abilityScores,
              variantRules: characterData.variantRules,
            },
            race: raceResolution.parentRace,
            subrace: raceResolution.subraceData,
            subraceIsNested: raceResolution.subraceIsNested,
            raceDraft: raceSnapshot,
            classEntity,
            raceAsiChoices: characterData.raceAsiChoices,
            raceAsiBlockIndex: characterData.raceAsiBlockIndex,
          },
          wizardData.itemLookup,
          resolveRaceChoiceOptions,
          wizardData.creationLookups,
        )
      if (old && previousRace && previousRace !== raceSnapshot) {
        character = synchronizeCreatorRaceChoices(
          character,
          raceSnapshot,
          previousRace,
          raceResolution,
          {
            feats: wizardData.feats,
            spells: wizardData.spells,
            lookups: wizardData.creationLookups,
            toolPools: buildToolSubtypeOptionsByKind(wizardData),
            effectiveCharacter: (draft) =>
              getCachedCharacterCalculationContext(draft, wizardData, gameData?.lookups).character,
          },
        )
      }
      if (!sameWizardValue(character.abilityScores, characterData.abilityScores))
        character = { ...character, abilityScores: characterData.abilityScores }
      const primary = character.classProgression[0]
      if (primary?.name !== classEntity.name || primary.source !== classEntity.source) {
        character = applyCharacterCommandResult(
          character,
          applyClassSelectionCommand(
            character,
            character.provenance,
            classEntity,
            undefined,
            wizardData.itemLookup,
            {
              ...wizardData.creationLookups,
              raceResolution,
              startingEquipmentPolicy: getInitialEquipmentPolicy(
                character,
                classEntity,
                'class',
                wizardData.creationLookups?.startingEquipment,
              ),
            },
          ),
        )
      }
      if (stepId === 'background' && background) {
        if (
          character.background !== background.name ||
          character.backgroundSource !== background.source
        ) {
          character = applyCharacterCommandResult(
            character,
            applyBackgroundSelectionCommand(
              character,
              character.provenance,
              background,
              [],
              wizardData.itemLookup,
              {},
              getInitialEquipmentPolicy(
                character,
                background,
                'background',
                wizardData.creationLookups?.startingEquipment,
              ),
            ),
          )
        }
        if (backgroundAbilityData.blocks.length) {
          const blockIndex = backgroundAsi?.blockIndex ?? 0
          const choices = backgroundAsi?.choices ?? []
          if (
            character.backgroundAsiBlockIndex !== blockIndex ||
            !sameWizardValue(character.backgroundAsiChoices, choices)
          ) {
            character = applyCharacterCommandResult(
              character,
              applyBackgroundAbilityChoicesCommand(
                character,
                character.provenance,
                background,
                blockIndex,
                choices,
              ),
            )
          }
        }
      }

      if (creating || old !== character || choicesDraft?.raceSnapshot !== raceSnapshot) {
        setChoicesDraft({
          rulesKey,
          raceSnapshot,
          store: createCharacterEditingDraft(character),
        })
      }
      setOriginDraftError(undefined)
    } catch (error) {
      setOriginDraftError(
        error instanceof Error ? error.message : 'Could not prepare character choices.',
      )
    }
  }, [
    open,
    stepId,
    raceSnapshot,
    previousRace,
    classEntity,
    choicesDraft,
    rulesKey,
    canRetainOriginDraft,
    raceResolution,
    wizardData,
    resolveRaceChoiceOptions,
    characterData,
    background,
    backgroundAsi,
    backgroundAbilityData.blocks.length,
    gameData?.lookups,
  ])

  const originCharacter = choicesDraft?.store.getState().activeCharacter
  const originDraftStore =
    !originDraftError &&
    choicesDraft?.raceSnapshot === raceSnapshot &&
    choicesDraft?.rulesKey === rulesKey &&
    originCharacter?.classProgression[0]?.name === classEntity?.name &&
    originCharacter?.classProgression[0]?.source === classEntity?.source &&
    (stepId !== 'background' ||
      (originCharacter?.background === background?.name &&
        originCharacter?.backgroundSource === background?.source))
      ? choicesDraft?.store
      : undefined

  const handleFinish = () =>
    runCreation(
      async () => {
        if (useGameDataStore.getState().gameData !== gameData)
          throw new RangeError(
            'Content changed. Review the current selections before creating the character.',
          )
        const draft = originDraftStore?.getState().activeCharacter
        if (
          !draft ||
          draft.background !== background?.name ||
          draft.backgroundSource !== background?.source
        )
          throw new RangeError(
            'Review the current character choices before creating the character.',
          )
        const character: Character = {
          ...draft,
          name: characterData.name,
          portrait: characterData.portrait,
          portraitTransform: characterData.portraitTransform,
          abilityScores: characterData.abilityScores,
          variantRules: {
            ...characterData.variantRules,
            abilityScoreMethod: characterData.abilityScoreMethod,
          },
          details: {
            ...draft.details,
            age: characterData.age ?? undefined,
            gender: characterData.gender,
            height: characterData.height || undefined,
            weight: characterData.weight || undefined,
            eyes: characterData.eyes || undefined,
            hair: characterData.hair || undefined,
          },
        }
        const context = getCachedCharacterCalculationContext(
          character,
          wizardData,
          gameData?.lookups,
        )
        const maximum = getEffectiveMaxHP(
          character,
          context.classes,
          context.abilityScores.total,
          context.effects.sourceDeclarations,
        )
        const saved = await addCharacter({
          ...character,
          ...(character.hitPointsInitialized && {
            hitPoints: { ...character.hitPoints, current: maximum },
          }),
        })
        setActiveCharacter(saved.id)
        resetAndClose()
        toast.success('Character created')
      },
      (error) => {
        const message =
          error instanceof Error ? error.message : 'Could not save the character. Please try again.'
        setValidationError(message)
        toast.error(message)
      },
    )

  const handleNext = (resetChoicesConfirmed = false) => {
    if (!stepId) return
    if (choicesReviewRef.current?.check() === false) {
      setValidationError(null)
      return
    }
    const validation = validateStep(stepId, characterData, wizardData)
    if (!validation.valid) {
      setValidationError(validation.error || 'Please complete this step')
      return
    }
    if (stepId === 'race' && !raceDraft.store) {
      setValidationError(raceDraft.error ?? 'Wait for the race choices to load.')
      return
    }
    if ((stepId === 'class' || stepId === 'background') && !originDraftStore) {
      setValidationError(originDraftError ?? 'Wait for the choices to load.')
      return
    }
    if (stepId === 'class' || stepId === 'background') {
      const current = originDraftStore?.getState().activeCharacter
      if (current && raceSnapshot) {
        const effective = getCachedCharacterCalculationContext(
          current,
          wizardData,
          gameData?.lookups,
        ).character
        const raceConflict =
          getCreatorChoiceGroups(raceSnapshot, wizardData, 'race', effective)
            .conflictingProficiencies.size > 0
        const classConflict =
          stepId === 'background' &&
          getCreatorChoiceGroups(current, wizardData, 'class', effective).conflictingProficiencies
            .size > 0
        if (raceConflict || classConflict) {
          const scope = raceConflict ? 'race' : 'class'
          setValidationError(null)
          setCurrentStep(WIZARD_STEPS.findIndex((step) => step.id === scope) + 1)
          toast.info(
            `Review the ${scope} choices. A later grant already provides one of those proficiencies.`,
          )
          return
        }
      }
    }
    if (stepId === 'race' && choicesDraft && !canRetainOriginDraft) {
      if (!resetChoicesConfirmed) {
        resetChoicesOrigin.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null
        setConfirmResetChoices(true)
        return
      }
      setChoicesDraft(undefined)
      setOriginDraftError(undefined)
    }
    setValidationError(null)
    if (currentStep < WIZARD_STEPS.length) {
      setCompletedThrough(Math.max(completedThrough, currentStep))
      setCurrentStep(currentStep + 1)
    } else handleFinish()
  }

  const revisitStep = (step: number) => {
    if (isCreating || step < 1 || step >= currentStep) return
    setValidationError(null)
    setCurrentStep(step)
  }

  const updateCharacterData = (updates: Partial<CharacterWizardData>) => {
    const normalizedUpdates = { ...updates }
    if (normalizedUpdates.abilityScoreMethod !== undefined && !normalizedUpdates.abilityScores) {
      normalizedUpdates.abilityScores = getDefaultAbilityScoresForMethod(
        normalizedUpdates.abilityScoreMethod,
      )
    }
    if (
      (updates.originSystem !== undefined && updates.originSystem !== characterData.originSystem) ||
      (updates.background !== undefined && updates.background !== characterData.background) ||
      (updates.backgroundSource !== undefined &&
        updates.backgroundSource !== characterData.backgroundSource)
    ) {
      normalizedUpdates.backgroundAsi = undefined
    }
    const changed = Object.entries(normalizedUpdates).some(
      ([key, value]) =>
        !sameWizardValue(
          value,
          characterData[key as keyof CharacterWizardData],
          key === 'allowedSources',
        ),
    )
    if (changed && completedThrough >= currentStep) setCompletedThrough(currentStep - 1)
    for (const [key, value] of Object.entries(normalizedUpdates)) {
      if (
        key in originalValues.current &&
        sameWizardValue(value, originalValues.current[key], key === 'allowedSources')
      ) {
        delete originalValues.current[key]
      } else if (
        !(key in originalValues.current) &&
        !sameWizardValue(
          value,
          characterData[key as keyof CharacterWizardData],
          key === 'allowedSources',
        )
      ) {
        originalValues.current[key] = characterData[key as keyof CharacterWizardData]
      }
    }
    setCharacterData((previous) => ({ ...previous, ...normalizedUpdates }))
    setValidationError(null)
  }

  const Step = stepId ? STEP_COMPONENTS[stepId] : undefined
  const renderIntro = (titleAccessory?: ReactNode, actions?: ReactNode) =>
    activeStep &&
    StepIcon && (
      <div
        className={cn(
          'min-w-0 shrink-0 pb-[calc(0.25rem+var(--text-sm)*var(--leading-relaxed))]',
          stepId === 'content' ? 'mb-1' : 'mb-3',
        )}
      >
        <p className="flex items-center gap-3 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground after:h-px after:flex-1 after:bg-border">
          {activeStep.section}
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight sm:text-3xl">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/35 bg-primary/10 text-primary">
                <StepIcon className="size-5" weight="duotone" aria-hidden="true" />
              </span>
              {activeStep.title}
            </h2>
            {titleAccessory}
          </div>
          {actions}
        </div>
      </div>
    )
  const intro = stepId === 'content' ? null : renderIntro()
  const usesSplitLayout = stepId === 'basics' || stepId === 'rules'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        aria-describedby={undefined}
        viewportPortalHostRef={setPortalHost}
        onPointerDownOutside={(event) => event.preventDefault()}
        closeDisabled={isCreating}
        aria-busy={isCreating}
        className="character-wizard-modal flex flex-col gap-0 overflow-hidden border-border bg-workspace-detail p-0 [&_[data-slot=dialog-close]]:right-3 [&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:z-20 [&_[data-slot=dialog-close]]:flex [&_[data-slot=dialog-close]]:size-8 [&_[data-slot=dialog-close]]:items-center [&_[data-slot=dialog-close]]:justify-center [&_[data-slot=dialog-close]]:border [&_[data-slot=dialog-close]]:border-border [&_[data-slot=dialog-close]]:bg-workspace-pane"
      >
        <header className="flex h-14 shrink-0 items-center border-b border-border bg-workspace-canvas px-4 pr-14 sm:px-6">
          <DialogTitle className="text-sm font-semibold">Create New Character</DialogTitle>
        </header>
        <div
          key={stepId}
          className={cn(
            'min-h-0 min-w-0 flex-1',
            !usesSplitLayout && 'flex flex-col p-4 sm:px-6 lg:py-6',
            stepId === 'content' ? 'overflow-hidden max-lg:py-3' : 'overflow-y-auto',
          )}
        >
          {validationError && stepId !== 'basics' && (
            <Alert
              variant="destructive"
              className={cn('mb-4 shrink-0', stepId === 'rules' && 'mx-4 mt-4 sm:mx-6')}
            >
              <Warning className="size-4" />
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}
          {!usesSplitLayout && intro}
          {Step && (
            <Step
              intro={intro}
              renderIntro={renderIntro}
              data={fixedBackgroundAsi ? { ...characterData, backgroundAsi } : characterData}
              onChange={updateCharacterData}
              nameError={stepId === 'basics' ? validationError : null}
              isBundledSrd={isBundledSrd}
              races={wizardData.races}
              raceDraft={raceDraft}
              laterOriginDraft={canRetainOriginDraft ? (originCharacter ?? undefined) : undefined}
              choiceCatalog={wizardData}
              originDraftStore={originDraftStore}
              onChoicesPendingChange={setChoicesPending}
              choicesReviewRef={choicesReviewRef}
              recursiveLookup={wizardData.recursiveLookup}
              classes={wizardData.classes}
              backgrounds={wizardData.backgrounds}
              backgroundAbilityData={backgroundAbilityData}
              raceResolution={raceResolution}
              sources={wizardData.sources}
              variantRuleAvailability={variantRuleAvailability}
            />
          )}
        </div>
        <WizardFooter
          currentStep={currentStep}
          completedThrough={completedThrough}
          onRevisit={revisitStep}
          onNext={() => handleNext()}
          isPending={isCreating}
          nextBlocked={
            (stepId === 'race' || stepId === 'class' || stepId === 'background') && choicesPending
          }
        />
        <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
          <AlertDialogContent
            onCloseAutoFocus={(event) => {
              if (discardOrigin.current?.isConnected) {
                event.preventDefault()
                discardOrigin.current.focus()
              }
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Discard character creation?</AlertDialogTitle>
              <AlertDialogDescription>
                Your unsaved character details and choices will be lost.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={resetAndClose}
              >
                Discard changes
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog open={confirmResetChoices} onOpenChange={setConfirmResetChoices}>
          <AlertDialogContent
            onCloseAutoFocus={(event) => {
              if (resetChoicesOrigin.current?.isConnected) {
                event.preventDefault()
                resetChoicesOrigin.current.focus()
              }
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>Reset remaining character choices?</AlertDialogTitle>
              <AlertDialogDescription>
                Your race or source rules changed. Continuing will reset your Class and Background
                choices.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep editing</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleNext(true)}>
                Reset and continue
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}
