import { Warning } from '@phosphor-icons/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  addGrant,
  applyBackgroundGrants,
  applyClassGrants,
  applyRaceGrants,
  makeSourceTag,
} from '@/lib/provenance';
import { emptyProvenance, useCharacterStore } from '@/store/characterStore';
import { useGameDataStore } from '@/store/gameDataStore';
import type { Background5e, Class5e, Race5e } from '@/types/5etools';
import type { AbilityScores } from '@/types/character';
import { INITIAL_CHARACTER_DATA, WIZARD_STEPS } from './constants';
import {
  AbilityScoresStep,
  BackgroundStep,
  BasicsStep,
  ClassStep,
  RaceStep,
  ReviewStep,
  RulesStep,
} from './steps';
import type { CharacterWizardData } from './types';
import { validateStep } from './validation';
import { WizardFooter } from './WizardFooter';
import { WizardNavigation } from './WizardNavigation';

interface CharacterCreationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CharacterCreationWizard({
  open,
  onOpenChange,
}: CharacterCreationWizardProps) {
  const createNewCharacter = useCharacterStore(
    (state) => state.createNewCharacter,
  );
  const setActiveCharacter = useCharacterStore(
    (state) => state.setActiveCharacter,
  );
  const gameData = useGameDataStore((state) => state.gameData);

  const [currentStep, setCurrentStep] = useState(1);
  const [characterData, setCharacterData] = useState<CharacterWizardData>(
    INITIAL_CHARACTER_DATA,
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());

  const handleClose = () => {
    setCurrentStep(1);
    setCharacterData(INITIAL_CHARACTER_DATA);
    setValidationError(null);
    setInvalidFields(new Set());
    onOpenChange(false);
  };

  const handleNext = () => {
    const validation = validateStep(currentStep, characterData, gameData);

    if (!validation.valid) {
      setValidationError(validation.error || 'Please complete this step');
      if (validation.fields) {
        setInvalidFields(new Set(validation.fields));
      }
      return;
    }

    setValidationError(null);
    setInvalidFields(new Set());

    if (currentStep < WIZARD_STEPS.length) {
      setCurrentStep(currentStep + 1);
    } else {
      handleFinish();
    }
  };

  const handleBack = () => {
    setValidationError(null);
    setInvalidFields(new Set());
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFinish = () => {
    const raceObj = (gameData?.races ?? []).find(
      (r: Race5e) =>
        r.name === characterData.race &&
        (!characterData.raceSource || r.source === characterData.raceSource),
    );
    const subraceObj = raceObj?.subraces?.find(
      (sr: Race5e) => sr.name === characterData.subrace,
    );
    const classObj = (gameData?.classes ?? []).find(
      (c: Class5e) =>
        c.name === characterData.class &&
        (!characterData.classSource || c.source === characterData.classSource),
    );
    const bgObj = (gameData?.backgrounds ?? []).find(
      (b: Background5e) =>
        b.name === characterData.background &&
        (!characterData.backgroundSource ||
          b.source === characterData.backgroundSource),
    );

    let provenance = emptyProvenance();
    if (raceObj) provenance = applyRaceGrants(raceObj, subraceObj, provenance);
    if (classObj)
      provenance = applyClassGrants(classObj, undefined, provenance);
    if (bgObj) provenance = applyBackgroundGrants(bgObj, provenance);
    provenance = addGrant(
      provenance,
      'languages',
      'Common',
      makeSourceTag('manual', 'Default', 'fixed'),
    );

    const classProficiencies = classObj?.startingProficiencies ?? {};
    const proficiencies = {
      armor: classProficiencies.armor ?? [],
      weapons: classProficiencies.weapons ?? [],
      tools: (classProficiencies.tools ?? []).filter(
        (t: string) =>
          !t.toLowerCase().includes('choose') &&
          !t.toLowerCase().includes('any'),
      ),
      languages: ['Common'],
      savingThrows: [],
    };

    const character = createNewCharacter({
      name: characterData.name,
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
          (characterData.abilityScoreMethod as
            | 'point-buy'
            | 'standard-array'
            | 'custom') || 'standard-array',
      },
      details: {
        gender: characterData.gender,
      },
      provenance,
      proficiencies,
      raceAsiChoices: characterData.raceAsiChoices,
    });

    setActiveCharacter(character.id);
    handleClose();
    toast.success('Character created successfully');
  };

  const updateCharacterData = (updates: Partial<CharacterWizardData>) => {
    setCharacterData({ ...characterData, ...updates });
    setValidationError(null);
    const newInvalidFields = new Set(invalidFields);
    Object.keys(updates).forEach((key) => {
      newInvalidFields.delete(key);
    });
    setInvalidFields(newInvalidFields);
  };

  const races = gameData?.races || [];
  const classes = gameData?.classes || [];
  const backgrounds = gameData?.backgrounds || [];

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
              {currentStep === 7 && <ReviewStep data={characterData} />}
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
  );
}
