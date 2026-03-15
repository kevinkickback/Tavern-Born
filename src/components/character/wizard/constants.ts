import {
  User,
  Sparkle,
  Users,
  Sword,
  BookOpen,
  ChartBar,
  CheckCircle,
} from '@phosphor-icons/react'
import { WizardStep } from './types'

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
  gender: 'Female',
  race: '',
  subrace: '',
  class: '',
  background: '',
  abilityScoreMethod: 'standard-array',
  portrait: '',
  rulesMode: 'strict',
  allowedSources: [] as string[],
  variantRules: {
    optionalClassFeatures: false,
    averageHitPoints: false,
  },
}
