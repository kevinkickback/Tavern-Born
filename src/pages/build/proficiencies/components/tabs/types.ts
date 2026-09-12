import type { ChoiceRecord, ProficiencyProvenance } from '@/lib/provenance/types'
import type { ToolChoiceSlot } from '@/pages/build/proficiencies/model/data'
import type { ProfFocus } from '@/pages/build/proficiencies/model/types'

export type ChoiceCounts = Record<'skills' | 'armor' | 'weapons' | 'tools' | 'languages', number>

export interface SkillRow {
  name: string
  ability: string
  proficient: boolean
  expertise: boolean
  modifierString: string
}

export type SkillSort = 'ability' | 'alpha' | 'proficient'
export type SkillGroup = { label: string | null; skills: SkillRow[] }

export type WeaponSort = 'alpha' | 'category' | 'melee-ranged' | 'proficient'
export type ToolSort = 'alpha' | 'type' | 'proficient'
export type LanguageSort = 'alpha' | 'type' | 'proficient'
export type ItemGroup = { label: string | null; items: string[] }

export interface SavingThrowRow {
  ability: string
  proficient: boolean
  modifierString: string
}

export interface CurrentProficiencies {
  armor: string[]
  weapons: string[]
  tools: string[]
  languages: string[]
}

export interface ProficiencyLedger {
  choices: ChoiceRecord[]
  proficiencies: ProficiencyProvenance
}

export type ResolveChoiceSelection = (
  domain: 'skills' | 'languages' | 'tools' | 'armor' | 'weapons',
  itemName: string,
  adding: boolean,
  choiceId?: string,
) => void

export interface ProficiencyPanelCallbacks {
  onFocusChange: (focus: ProfFocus) => void
  onExpandDetails: () => void
  onResolveChoiceSelection: ResolveChoiceSelection
}

export interface ToolPanelChoices {
  dropdownToolSlots: ToolChoiceSlot[]
  artisanToolSlots: ToolChoiceSlot[]
  artisanChoiceByNorm: Map<string, string>
}
