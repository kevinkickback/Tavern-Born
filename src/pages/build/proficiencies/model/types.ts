import type { Item5e, Language5e } from '@/types/5etools'

export type ProfFocus =
  | {
      type: 'skill'
      name: string
      ability: string
      proficient: boolean
      expertise: boolean
      modifierString: string
    }
  | {
      type: 'save'
      ability: string
      proficient: boolean
      modifierString: string
    }
  | {
      type: 'item'
      category: 'armor' | 'weapons' | 'tools' | 'languages'
      name: string
      isProficient: boolean
      itemData?: Item5e | null
      languageData?: Language5e | null
    }
