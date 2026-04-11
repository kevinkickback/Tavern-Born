import { BookOpen, ChartBar, CheckCircle, Sparkle, Sword, User, Users } from '@phosphor-icons/react'
import type { WizardStep } from './types'

export const WIZARD_STEPS: WizardStep[] = [
  { id: 1, label: 'Basics', icon: User },
  { id: 2, label: 'Rules', icon: Sparkle },
  { id: 3, label: 'Race', icon: Users },
  { id: 4, label: 'Class', icon: Sword },
  { id: 5, label: 'Background', icon: BookOpen },
  { id: 6, label: 'Ability Scores', icon: ChartBar },
  { id: 7, label: 'Review', icon: CheckCircle },
]

export const INITIAL_CHARACTER_DATA = {
  name: '',
  playerName: '',
  age: null,
  gender: 'Female',
  race: '',
  raceSource: '',
  subrace: '',
  subraceSource: '',
  class: '',
  classSource: '',
  background: '',
  backgroundSource: '',
  abilityScoreMethod: 'point-buy',
  abilityScores: {
    strength: 8,
    dexterity: 8,
    constitution: 8,
    intelligence: 8,
    wisdom: 8,
    charisma: 8,
  },
  portrait: '',
  portraitTransform: {
    zoom: 150,
    panX: 25,
    panY: 25,
    rotation: 0,
  },
  rulesMode: 'strict',
  allowedSources: [] as string[],
  raceAsiChoices: [] as string[][],
  raceAsiBlockIndex: 0 as 0 | 1,
  variantRules: {
    optionalClassFeatures: false,
    averageHitPoints: true,
    bladesingerAnyRace: false,
    battleragerAnyRace: false,
    preferNewerPrintings: true,
  },
}
