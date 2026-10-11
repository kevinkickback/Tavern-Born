import type { AbilityName } from './character'

type CharacterActionKind = 'action' | 'bonus-action' | 'reaction' | 'passive' | 'special' | 'attack'

interface CharacterActionSource {
  kind: 'race' | 'class' | 'subclass' | 'feat' | 'spell' | 'item' | 'manual' | 'other'
  name: string
  source?: string
  entityId?: string
}

interface CharacterActionDamage {
  dice?: string
  bonus: number
  damageType?: string
}

export interface CharacterAction {
  id: string
  name: string
  kind: CharacterActionKind
  description: string
  source: CharacterActionSource
  active: boolean
  inactiveReason?: string
  ability?: AbilityName
  proficient?: boolean
  attackBonus?: number
  save?: { ability?: AbilityName; dc: number }
  range?: string
  damage?: CharacterActionDamage[]
  properties?: string[]
  mastery?: Array<{ name: string; source?: string }>
  resourceCost?: { resourceId: string; amount: number }
  recharge?: { rest?: 'short' | 'long'; note?: string }
}
