import { Warning } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useWizardGameData } from '@/hooks/data/useWizardGameData'
import { useAsyncAction } from '@/hooks/ui/useAsyncAction'
import { hasAvailableReprintPair } from '@/lib/5etools/reprints'
import {
  makeDefaultAbilityScores,
  makeDefaultStandardArrayAssignment,
} from '@/lib/calculations/abilityScores'
import { ABILITY_SCORE_MIN, POINT_BUY_MIN } from '@/lib/calculations/gameRules'
import { getVariantRuleContentAvailability } from '@/lib/calculations/variantRuleAvailability'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { resolveRaceGrantFilterOptions } from '@/lib/provenance'
import { getEffectiveSources } from '@/lib/sourceCompatibility'
import { SOURCE_PRESETS } from '@/lib/sourcePresets'
import { cn } from '@/lib/utils'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { AbilityScores } from '@/types/character'
import { INITIAL_CHARACTER_DATA, WIZARD_STEPS } from './constants'
import {
  AbilityScoresStep,
  BackgroundStep,
  BasicsStep,
  ClassStep,
  RaceStep,
  ReviewStep,
  RulesStep,
} from './steps'
import type { CharacterWizardData } from './types'
import { validateStep } from './validation'
import { WizardFooter } from './WizardFooter'
import { WizardNavigation } from './WizardNavigation'

interface CharacterCreationWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function getDefaultAbilityScoresForMethod(method: string): Record<string, number> {
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

export function CharacterCreationWizard({ open, onOpenChange }: CharacterCreationWizardProps) {
  const { setPortalHost } = useRulesPreview()
  const addCharacter = useCharacterStore((state) => state.addCharacter)
  const setActiveCharacter = useCharacterStore((state) => state.setActiveCharacter)
  const isBundledSrd = useGameDataStore((state) => state.dataSourceConfig?.type === 'bundled')
  const gameData = useGameDataStore((state) => state.gameData)
  const [currentStep, setCurrentStep] = useState(1)
  const [characterData, setCharacterData] = useState<CharacterWizardData>(INITIAL_CHARACTER_DATA)
  const originalValues = useRef<Record<string, unknown>>({})
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const discardOrigin = useRef<HTMLElement | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())
  const { isPending: isCreating, run: runCreation } = useAsyncAction()
  const wizardData = useWizardGameData({
    allowedSources: characterData.allowedSources,
    originSystem: characterData.originSystem,
    preferNewerPrintings: characterData.variantRules?.preferNewerPrintings,
  })
  const preferNewerPrintingsAvailable = useMemo(() => {
    if (!gameData) return false
    const effectiveSources = getEffectiveSources(
      characterData.allowedSources ?? [],
      characterData.originSystem || '2014',
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
    if (!open) return
    setCharacterData((previous) => {
      if ((previous.allowedSources?.length ?? 0) > 0 || 'allowedSources' in originalValues.current)
        return previous
      const recommended = SOURCE_PRESETS.find((preset) => preset.id === 'recommended')
      if (!recommended) return previous
      const availableSources = new Set(wizardData.sources.map((source) => source.abbreviation))
      const allowedSources =
        availableSources.size > 0
          ? recommended.abbreviations.filter((source) => availableSources.has(source))
          : recommended.abbreviations
      return allowedSources.length > 0 ? { ...previous, allowedSources } : previous
    })
  }, [open, wizardData.sources])

  const resetAndClose = () => {
    discardOrigin.current = null
    setConfirmDiscard(false)
    originalValues.current = {}
    setCurrentStep(1)
    setCharacterData(INITIAL_CHARACTER_DATA)
    setValidationError(null)
    setInvalidFields(new Set())
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

  const handleFinish = () =>
    runCreation(
      async () => {
        if (useGameDataStore.getState().gameData !== gameData)
          throw new RangeError(
            'Content changed. Review the current selections before creating the character.',
          )
        const classEntity = wizardData.resolveClass({
          name: characterData.class,
          source: characterData.classSource,
        })
        const background = wizardData.resolveBackground({
          name: characterData.background,
          source: characterData.backgroundSource,
        })
        const character = buildInitialCharacter(
          {
            initial: {
              name: characterData.name,
              originSystem: characterData.originSystem as '2014' | '2024',
              portrait: characterData.portrait,
              portraitTransform: characterData.portraitTransform,
              allowedSources: characterData.allowedSources,
              abilityScores: characterData.abilityScores as unknown as AbilityScores,
              variantRules: {
                ...characterData.variantRules,
                abilityScoreMethod:
                  (characterData.abilityScoreMethod as 'point-buy' | 'standard-array' | 'custom') ||
                  'standard-array',
              },
              details: {
                playerName: characterData.playerName,
                age: characterData.age ?? undefined,
                gender: characterData.gender,
              },
            },
            race: raceResolution.parentRace,
            subrace: raceResolution.subraceData,
            classEntity,
            background,
            raceAsiChoices: characterData.raceAsiChoices,
            raceAsiBlockIndex: characterData.raceAsiBlockIndex,
          },
          wizardData.itemLookup,
          (domain, fromFilter) =>
            resolveRaceGrantFilterOptions(domain, fromFilter, {
              items: wizardData.items,
              itemsBase: wizardData.itemsBase,
              allowedSources: characterData.allowedSources,
            }),
          wizardData.creationLookups,
        )
        const saved = await addCharacter(character)
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

  const handleNext = () => {
    const validation = validateStep(currentStep, characterData, wizardData)
    if (!validation.valid) {
      setValidationError(validation.error || 'Please complete this step')
      if (validation.fields) setInvalidFields(new Set(validation.fields))
      return
    }
    setValidationError(null)
    setInvalidFields(new Set())
    if (currentStep < WIZARD_STEPS.length) setCurrentStep(currentStep + 1)
    else handleFinish()
  }

  const handleBack = () => {
    setValidationError(null)
    setInvalidFields(new Set())
    if (currentStep > 1) setCurrentStep(currentStep - 1)
  }

  const updateCharacterData = (updates: Partial<CharacterWizardData>) => {
    const normalizedUpdates = { ...updates }
    if (
      typeof normalizedUpdates.abilityScoreMethod === 'string' &&
      !normalizedUpdates.abilityScores
    ) {
      normalizedUpdates.abilityScores = getDefaultAbilityScoresForMethod(
        normalizedUpdates.abilityScoreMethod,
      )
    }
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
    const nextInvalidFields = new Set(invalidFields)
    Object.keys(normalizedUpdates).forEach((key) => {
      nextInvalidFields.delete(key)
    })
    setInvalidFields(nextInvalidFields)
  }

  const raceResolution = wizardData.resolveRace({
    name: characterData.race,
    source: characterData.raceSource,
    subraceName: characterData.subrace,
    subraceSource: characterData.subraceSource,
  })
  const Step = [
    BasicsStep,
    RulesStep,
    RaceStep,
    ClassStep,
    BackgroundStep,
    AbilityScoresStep,
    ReviewStep,
  ][currentStep - 1]

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        rulesPreviewPortalRef={setPortalHost}
        onPointerDownOutside={(event) => event.preventDefault()}
        closeDisabled={isCreating}
        aria-busy={isCreating}
        className="character-wizard-modal flex flex-col gap-0 overflow-hidden border-border bg-workspace-detail p-0 [&_[data-slot=dialog-close]]:right-3 [&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:z-20 [&_[data-slot=dialog-close]]:flex [&_[data-slot=dialog-close]]:size-8 [&_[data-slot=dialog-close]]:items-center [&_[data-slot=dialog-close]]:justify-center [&_[data-slot=dialog-close]]:border [&_[data-slot=dialog-close]]:border-border [&_[data-slot=dialog-close]]:bg-workspace-pane"
      >
        <DialogTitle className="sr-only">Create New Character</DialogTitle>
        <DialogDescription className="sr-only">
          Step through the wizard to configure your new character.
        </DialogDescription>
        <div className="flex min-h-0 flex-1">
          <WizardNavigation steps={WIZARD_STEPS} currentStep={currentStep} />
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              className={cn(
                'min-h-0 flex-1 py-6 pl-8 pr-14',
                currentStep === 2 ? 'overflow-hidden' : 'overflow-y-auto',
              )}
            >
              {validationError && invalidFields.size === 0 && (
                <Alert variant="destructive" className="mb-4">
                  <Warning className="size-4" />
                  <AlertDescription>{validationError}</AlertDescription>
                </Alert>
              )}
              {Step && (
                <Step
                  data={characterData}
                  onChange={updateCharacterData}
                  invalidFields={invalidFields}
                  contentAvailability={variantRuleAvailability}
                  isBundledSrd={isBundledSrd}
                  races={wizardData.races}
                  recursiveLookup={wizardData.recursiveLookup}
                  classes={wizardData.classes}
                  backgrounds={wizardData.backgrounds}
                  raceResolution={raceResolution}
                  sources={wizardData.sources}
                  variantRuleAvailability={variantRuleAvailability}
                />
              )}
            </div>
            <WizardFooter
              currentStep={currentStep}
              totalSteps={WIZARD_STEPS.length}
              onBack={handleBack}
              onNext={handleNext}
              onCancel={handleClose}
              isPending={isCreating}
            />
          </div>
        </div>
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
      </DialogContent>
    </Dialog>
  )
}
