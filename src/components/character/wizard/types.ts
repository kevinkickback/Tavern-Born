import type { PortraitTransform } from '@/types/character';

export interface WizardStep {
  id: number;
  label: string;
  icon: React.ElementType;
}

export interface CharacterWizardData {
  name: string;
  playerName: string;
  age: number | null;
  gender: string;
  race: string;
  raceSource: string;
  subrace: string;
  subraceSource: string;
  class: string;
  classSource: string;
  background: string;
  backgroundSource: string;
  abilityScoreMethod: string;
  abilityScores: Record<string, number>;
  portrait: string;
  portraitTransform: PortraitTransform;
  rulesMode: string;
  allowedSources: string[];
  raceAsiChoices: string[][];
  variantRules: {
    optionalClassFeatures: boolean;
    averageHitPoints: boolean;
    bladesingerAnyRace: boolean;
    battleragerAnyRace: boolean;
    firearmsAllowed: boolean;
  };
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  fields?: string[];
}

export interface StepProps {
  data: CharacterWizardData;
  onChange: (updates: Partial<CharacterWizardData>) => void;
  invalidFields?: Set<string>;
}
