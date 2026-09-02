import { Warning } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useWizardGameData } from '@/hooks/data/useWizardGameData'
import { ABILITY_SCORE_MIN, POINT_BUY_MIN, STANDARD_ARRAY } from '@/lib/calculations/gameRules'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { resolveRaceGrantFilterOptions } from '@/lib/provenance'
import { SOURCE_PRESETS } from '@/lib/sourcePresets'
import { cn } from '@/lib/utils'
import { useCharacterStore } from '@/store/characterStore'
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

const ABILITY_ORDER = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const

function buildUniformAbilityScores(value: number): Record<string, number> {
  return ABILITY_ORDER.reduce(
    (scores, ability) => {
      scores[ability] = value
      return scores
    },
    {} as Record<string, number>,
  )
}

function getDefaultAbilityScoresForMethod(method: string): Record<string, number> {
  if (method === 'standard-array') {
    return ABILITY_ORDER.reduce(
      (scores, ability, index) => {
        scores[ability] = STANDARD_ARRAY[index] ?? POINT_BUY_MIN
        return scores
      },
      {} as Record<string, number>,
    )
  }
  if (method === 'custom') return buildUniformAbilityScores(ABILITY_SCORE_MIN)
  return buildUniformAbilityScores(POINT_BUY_MIN)
}

export function CharacterCreationWizard({ open, onOpenChange }: CharacterCreationWizardProps) {
  const addCharacter = useCharacterStore((state) => state.addCharacter)
  const setActiveCharacter = useCharacterStore((state) => state.setActiveCharacter)
  const [currentStep, setCurrentStep] = useState(1)
  const [characterData, setCharacterData] = useState<CharacterWizardData>(INITIAL_CHARACTER_DATA)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())
  const wizardData = useWizardGameData({
    allowedSources: characterData.allowedSources,
    originSystem: characterData.originSystem,
    preferNewerPrintings: characterData.variantRules?.preferNewerPrintings,
  })

  useEffect(() => {
    if (!open) return
    setCharacterData((previous) => {
      if ((previous.allowedSources?.length ?? 0) > 0) return previous
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

  const handleClose = () => {
    setCurrentStep(1)
    setCharacterData(INITIAL_CHARACTER_DATA)
    setValidationError(null)
    setInvalidFields(new Set())
    onOpenChange(false)
  }

  const handleFinish = () => {
    const raceResolution = wizardData.resolveRace({
      name: characterData.race,
      source: characterData.raceSource,
      subraceName: characterData.subrace,
      subraceSource: characterData.subraceSource,
    })
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
    )
    addCharacter(character)
    setActiveCharacter(character.id)
    handleClose()
    toast.success('Character created successfully')
  }

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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="character-wizard-modal flex flex-col gap-0 overflow-hidden border-border bg-workspace-detail p-0 [&_[data-slot=dialog-close]]:right-3 [&_[data-slot=dialog-close]]:top-3 [&_[data-slot=dialog-close]]:z-20 [&_[data-slot=dialog-close]]:flex [&_[data-slot=dialog-close]]:size-8 [&_[data-slot=dialog-close]]:items-center [&_[data-slot=dialog-close]]:justify-center [&_[data-slot=dialog-close]]:border [&_[data-slot=dialog-close]]:border-border [&_[data-slot=dialog-close]]:bg-workspace-pane">
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
              {currentStep === 1 && (
                <BasicsStep
                  data={characterData}
                  onChange={updateCharacterData}
                  invalidFields={invalidFields}
                />
              )}
              {currentStep === 2 && (
                <RulesStep
                  data={characterData}
                  onChange={updateCharacterData}
                  sources={wizardData.sources}
                  invalidFields={invalidFields}
                />
              )}
              {currentStep === 3 && (
                <RaceStep
                  data={characterData}
                  onChange={updateCharacterData}
                  races={wizardData.races}
                />
              )}
              {currentStep === 4 && (
                <ClassStep
                  data={characterData}
                  onChange={updateCharacterData}
                  classes={wizardData.classes}
                />
              )}
              {currentStep === 5 && (
                <BackgroundStep
                  data={characterData}
                  onChange={updateCharacterData}
                  backgrounds={wizardData.backgrounds}
                />
              )}
              {currentStep === 6 && (
                <AbilityScoresStep
                  data={characterData}
                  onChange={updateCharacterData}
                  raceResolution={raceResolution}
                />
              )}
              {currentStep === 7 && (
                <ReviewStep
                  data={characterData}
                  raceResolution={raceResolution}
                  sources={wizardData.sources}
                />
              )}
            </div>
            <WizardFooter
              currentStep={currentStep}
              totalSteps={WIZARD_STEPS.length}
              onBack={handleBack}
              onNext={handleNext}
              onCancel={handleClose}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
