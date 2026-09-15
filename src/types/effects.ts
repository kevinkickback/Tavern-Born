import type { AbilityName } from './character'

export type NumericEffectTarget =
  | { kind: 'ability-score'; ability: AbilityName }
  | { kind: 'skill-modifier'; skill: string }
  | { kind: 'saving-throw-modifier'; ability: AbilityName }
  | { kind: 'initiative' }
  | { kind: 'armor-class' }
  | { kind: 'hit-point-maximum' }
  | { kind: 'speed'; mode: string }
  | { kind: 'carrying-capacity' }
  | { kind: 'attack-roll'; attackId?: string }
  | { kind: 'damage'; attackId?: string; damageType?: string }
  | { kind: 'spell-attack'; profileId?: string }
  | { kind: 'spell-save-dc'; profileId?: string }
  | { kind: 'sense'; sense: string }
  | { kind: 'resource-maximum'; resourceId: string }

export type RollEffectTarget =
  | { kind: 'ability-check'; ability: AbilityName }
  | { kind: 'skill-check'; skill: string }
  | { kind: 'saving-throw'; ability: AbilityName }
  | { kind: 'initiative-roll' }
  | { kind: 'attack-roll'; attackId?: string }
  | { kind: 'spell-attack'; profileId?: string }

export type TraitEffectTarget =
  | { kind: 'damage-resistance'; damageType: string }
  | { kind: 'damage-immunity'; damageType: string }
  | { kind: 'condition-immunity'; condition: string }

export type NumericEffectOperation =
  | { kind: 'base'; value: number }
  | { kind: 'set'; value: number }
  | { kind: 'add'; value: number }
  | { kind: 'multiply'; value: number }
  | { kind: 'minimum'; value: number }
  | { kind: 'maximum'; value: number }
  | { kind: 'override'; value: number }

type RollEffectOperation =
  | { kind: 'advantage' }
  | { kind: 'disadvantage' }
  | { kind: 'conditional-note'; note: string }

type TraitEffectOperation = { kind: 'grant' } | { kind: 'conditional-note'; note: string }

type CharacterEffectSourceKind =
  | 'race'
  | 'subrace'
  | 'class'
  | 'subclass'
  | 'background'
  | 'feat'
  | 'spell'
  | 'item'
  | 'condition'
  | 'manual'
  | 'other'

interface CharacterEffectSource {
  kind: CharacterEffectSourceKind
  name: string
  source?: string
  entityId?: string
  provenance?: {
    choiceId?: string
    grantVariant?: string
  }
}

export type CharacterEffectRequirement =
  | {
      kind: 'equipment'
      itemId: string
      state: 'equipped' | 'attuned' | 'equipped-and-attuned'
    }
  | { kind: 'flag'; key: string; expected: boolean }

interface CharacterEffectBase {
  id: string
  label: string
  source: CharacterEffectSource
  priority?: number
  requirements?: CharacterEffectRequirement[]
  condition?: string
}

/** A typed modifier declaration. Rules prose is preserved in `condition` rather than evaluated. */
export type CharacterEffect =
  | (CharacterEffectBase & {
      target: NumericEffectTarget
      operation: NumericEffectOperation | { kind: 'conditional-note'; note: string }
    })
  | (CharacterEffectBase & { target: RollEffectTarget; operation: RollEffectOperation })
  | (CharacterEffectBase & { target: TraitEffectTarget; operation: TraitEffectOperation })
