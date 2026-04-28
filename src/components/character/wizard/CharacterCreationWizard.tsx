import { Warning } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  resolveBackgroundStartingEquipment,
  resolveClassStartingEquipment,
} from '@/lib/5etools/startingEquipment'
import { ABILITY_SCORE_MIN, POINT_BUY_MIN, STANDARD_ARRAY } from '@/lib/calculations/gameRules'
import { ensureOriginLanguageBaseline } from '@/lib/calculations/languageOrigin'
import {
  ensureOriginSystemInvariants,
  normalizeBackgroundForOriginSystem,
  normalizeRaceSelectionForOriginSystem,
} from '@/lib/calculations/originSystem'
import { buildInitialCharacterProficiencies } from '@/lib/character/commands/classSelectionOrchestrationCommand'
import { generateEquipmentId } from '@/lib/character/ids'
import {
  applyBackgroundGrants,
  applyClassGrants,
  applyRaceGrants,
  resolveRaceGrantFilterOptions,
} from '@/lib/provenance'
import { SOURCE_PRESETS } from '@/lib/sourcePresets'
import { emptyProvenance, useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Background5e, Class5e, Race5e } from '@/types/5etools'
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
    (acc, ability) => {
      acc[ability] = value
      return acc
    },
    {} as Record<string, number>,
  )
}

function getDefaultAbilityScoresForMethod(method: string): Record<string, number> {
  if (method === 'standard-array') {
    return ABILITY_ORDER.reduce(
      (acc, ability, index) => {
        acc[ability] = STANDARD_ARRAY[index] ?? POINT_BUY_MIN
        return acc
      },
      {} as Record<string, number>,
    )
  }

  if (method === 'custom') {
    return buildUniformAbilityScores(ABILITY_SCORE_MIN)
  }

  return buildUniformAbilityScores(POINT_BUY_MIN)
}

export function CharacterCreationWizard({ open, onOpenChange }: CharacterCreationWizardProps) {
  const createNewCharacter = useCharacterStore((state) => state.createNewCharacter)
  const setActiveCharacter = useCharacterStore((state) => state.setActiveCharacter)
  const gameData = useGameDataStore((state) => state.gameData)
  const itemLookup = useGameDataStore((state) => state.itemLookup)

  const [currentStep, setCurrentStep] = useState(1)
  const [characterData, setCharacterData] = useState<CharacterWizardData>(INITIAL_CHARACTER_DATA)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open) {
      return
    }

    setCharacterData((prev) => {
      if ((prev.allowedSources?.length ?? 0) > 0) {
        return prev
      }

      const recommended = SOURCE_PRESETS.find((preset) => preset.id === 'recommended')
      if (!recommended) {
        return prev
      }

      const availableSourceSet = new Set(
        (gameData?.sources ?? []).map((source) => source.abbreviation),
      )
      const allowedSources =
        availableSourceSet.size > 0
          ? recommended.abbreviations.filter((abbr) => availableSourceSet.has(abbr))
          : recommended.abbreviations

      if (allowedSources.length === 0) {
        return prev
      }

      return {
        ...prev,
        allowedSources,
      }
    })
  }, [open, gameData?.sources])

  const handleClose = () => {
    setCurrentStep(1)
    setCharacterData(INITIAL_CHARACTER_DATA)
    setValidationError(null)
    setInvalidFields(new Set())
    onOpenChange(false)
  }

  const handleNext = () => {
    const validation = validateStep(currentStep, characterData, gameData)

    if (!validation.valid) {
      setValidationError(validation.error || 'Please complete this step')
      if (validation.fields) {
        setInvalidFields(new Set(validation.fields))
      }
      return
    }

    setValidationError(null)
    setInvalidFields(new Set())

    if (currentStep < WIZARD_STEPS.length) {
      setCurrentStep(currentStep + 1)
    } else {
      handleFinish()
    }
  }

  const handleBack = () => {
    setValidationError(null)
    setInvalidFields(new Set())
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleFinish = () => {
    const raceObj = (gameData?.races ?? []).find(
      (r: Race5e) =>
        r.name === characterData.race &&
        (!characterData.raceSource || r.source === characterData.raceSource),
    )
    const subraceObj = raceObj?.subraces?.find(
      (sr: Race5e) =>
        sr.name === characterData.subrace &&
        (sr.source ?? '') === (characterData.subraceSource ?? ''),
    )
    const classObj = (gameData?.classes ?? []).find(
      (c: Class5e) =>
        c.name === characterData.class &&
        (!characterData.classSource || c.source === characterData.classSource),
    )
    const bgObj = (gameData?.backgrounds ?? []).find(
      (b: Background5e) =>
        b.name === characterData.background &&
        (!characterData.backgroundSource || b.source === characterData.backgroundSource),
    )
    const originSystem = characterData.originSystem as '2014' | '2024'
    const normalizedRaceSelection = normalizeRaceSelectionForOriginSystem(
      raceObj,
      subraceObj,
      originSystem,
    )
    const normalizedBackground = normalizeBackgroundForOriginSystem(bgObj, originSystem)

    let provenance = emptyProvenance()
    if (normalizedRaceSelection.race) {
      provenance = applyRaceGrants(
        normalizedRaceSelection.race,
        normalizedRaceSelection.subrace,
        provenance,
        (domain, fromFilter) =>
          resolveRaceGrantFilterOptions(domain, fromFilter, {
            items: gameData?.items ?? [],
            itemsBase: gameData?.itemsBase ?? [],
            allowedSources: characterData.allowedSources,
          }),
        characterData.raceAsiBlockIndex,
        1,
        { suppressLanguageGrants: originSystem === '2024' },
      )
    }
    if (classObj) {
      provenance = applyClassGrants(classObj, undefined, provenance, { itemLookup })
    }
    if (normalizedBackground) {
      provenance = applyBackgroundGrants(normalizedBackground, provenance, {
        itemLookup,
        suppressLanguageGrants: originSystem === '2024',
      })
    }
    provenance = ensureOriginLanguageBaseline(provenance, originSystem)
    ensureOriginSystemInvariants(provenance, originSystem)

    const { proficiencies, skills: initialSkills } = buildInitialCharacterProficiencies(
      classObj,
      normalizedBackground,
    )
    const startingEquipment = [
      ...resolveClassStartingEquipment(classObj?.startingEquipment, itemLookup),
      ...resolveBackgroundStartingEquipment(bgObj?.startingEquipment, itemLookup),
    ]

    const character = createNewCharacter({
      name: characterData.name,
      originSystem,
      race: characterData.race,
      raceSource: characterData.raceSource || undefined,
      subrace: characterData.subrace,
      subraceSource: characterData.subraceSource || undefined,
      class: characterData.class,
      classSource: characterData.classSource || undefined,
      background: characterData.background,
      backgroundSource: characterData.backgroundSource || undefined,
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
      provenance,
      proficiencies,
      skills: initialSkills,
      equipment: startingEquipment.map((item) => ({
        id: generateEquipmentId(),
        equipped: false,
        attuned: false,
        ...item,
      })),
      raceAsiChoices: characterData.raceAsiChoices,
      raceAsiBlockIndex: characterData.raceAsiBlockIndex,
    })

    setActiveCharacter(character.id)
    handleClose()
    toast.success('Character created successfully')
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

    setCharacterData((prev) => ({ ...prev, ...normalizedUpdates }))
    setValidationError(null)
    const newInvalidFields = new Set(invalidFields)
    Object.keys(normalizedUpdates).forEach((key) => {
      newInvalidFields.delete(key)
    })
    setInvalidFields(newInvalidFields)
  }

  const races = gameData?.races || []
  const classes = gameData?.classes || []
  const backgrounds = gameData?.backgrounds || []

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="character-wizard-modal p-0 gap-0 bg-card border-border flex flex-col">
        <DialogTitle className="sr-only">Create New Character</DialogTitle>
        <DialogDescription className="sr-only">
          Step through the wizard to configure your new character.
        </DialogDescription>

        <WizardNavigation steps={WIZARD_STEPS} currentStep={currentStep} />

        <div className="flex-1 overflow-y-auto px-8 py-6 min-h-0">
          {validationError && invalidFields.size === 0 && (
            <Alert variant="destructive" className="mb-4">
              <Warning className="h-4 w-4" />
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
              gameData={gameData ?? undefined}
              invalidFields={invalidFields}
            />
          )}
          {currentStep === 3 && (
            <RaceStep data={characterData} onChange={updateCharacterData} races={races} />
          )}
          {currentStep === 4 && (
            <ClassStep data={characterData} onChange={updateCharacterData} classes={classes} />
          )}
          {currentStep === 5 && (
            <BackgroundStep
              data={characterData}
              onChange={updateCharacterData}
              backgrounds={backgrounds}
            />
          )}
          {currentStep === 6 && (
            <AbilityScoresStep data={characterData} onChange={updateCharacterData} />
          )}
          {currentStep === 7 && <ReviewStep data={characterData} />}
        </div>

        <WizardFooter
          currentStep={currentStep}
          totalSteps={WIZARD_STEPS.length}
          onBack={handleBack}
          onNext={handleNext}
          onCancel={handleClose}
        />
      </DialogContent>
    </Dialog>
  )
}
