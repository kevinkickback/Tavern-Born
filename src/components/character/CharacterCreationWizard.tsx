import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import { toast } from 'sonner'
import { Warning } from '@phosphor-icons/react'
import { WIZARD_STEPS, INITIAL_CHARACTER_DATA } from './wizard/constants'
import { WizardNavigation } from './wizard/WizardNavigation'
import { WizardFooter } from './wizard/WizardFooter'
import { validateStep } from './wizard/validation'
import { CharacterWizardData } from './wizard/types'
import {
  BasicsStep,
  RulesStep,
  RaceStep,
  ClassStep,
  BackgroundStep,
  AbilityScoresStep,
  ReviewStep,
} from './wizard/steps'

interface CharacterCreationWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CharacterCreationWizard({
  open,
  onOpenChange,
}: CharacterCreationWizardProps) {
  const navigate = useNavigate()
  const { createNewCharacter, setActiveCharacter } = useCharacterStore()
  const gameData = useGameDataStore((state) => state.gameData)
  
  const [currentStep, setCurrentStep] = useState(1)
  const [characterData, setCharacterData] = useState<CharacterWizardData>(INITIAL_CHARACTER_DATA)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())

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
    const character = createNewCharacter({
      name: characterData.name,
      race: characterData.race,
      subrace: characterData.subrace,
      class: characterData.class,
      background: characterData.background,
      portrait: characterData.portrait,
      allowedSources: characterData.allowedSources,
      variantRules: characterData.variantRules,
      details: {
        gender: characterData.gender,
      },
    })
    
    setActiveCharacter(character.id)
    handleClose()
    navigate('/build/race')
    toast.success('Character created successfully')
  }

  const updateCharacterData = (updates: Partial<CharacterWizardData>) => {
    setCharacterData({ ...characterData, ...updates })
    setValidationError(null)
    const newInvalidFields = new Set(invalidFields)
    Object.keys(updates).forEach(key => newInvalidFields.delete(key))
    setInvalidFields(newInvalidFields)
  }

  const races = gameData?.races || []
  const classes = gameData?.classes || []
  const backgrounds = gameData?.backgrounds || []

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="character-wizard-modal p-0 gap-0 bg-card border-border flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <DialogTitle className="font-display text-2xl font-bold">
            Create New Character
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden min-h-0">
          <WizardNavigation steps={WIZARD_STEPS} currentStep={currentStep} />

          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 overflow-y-auto px-8 py-6 min-h-0">
              {validationError && (
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
                  gameData={gameData}
                />
              )}
              {currentStep === 3 && (
                <RaceStep
                  data={characterData}
                  onChange={updateCharacterData}
                  races={races}
                />
              )}
              {currentStep === 4 && (
                <ClassStep
                  data={characterData}
                  onChange={updateCharacterData}
                  classes={classes}
                />
              )}
              {currentStep === 5 && (
                <BackgroundStep
                  data={characterData}
                  onChange={updateCharacterData}
                  backgrounds={backgrounds}
                />
              )}
              {currentStep === 6 && (
                <AbilityScoresStep
                  data={characterData}
                  onChange={updateCharacterData}
                />
              )}
              {currentStep === 7 && (
                <ReviewStep data={characterData} />
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
