import { SPECIAL_SPELL_PROFILE_LABEL } from '@/lib/calculations/spellProfiles'
import { DEFAULT_PORTRAIT_TRANSFORM } from '@/lib/portraitConstants'
import type { ProvenanceLedger, SourceTag } from '@/lib/provenance/types'
import { CURRENT_CHARACTER_SCHEMA_VERSION } from '@/lib/schema/characterSchemaVersion'
import type { Character } from '@/types/character'

export function emptyProvenance(): ProvenanceLedger {
  const emptyMap = () => ({}) as Record<string, SourceTag[]>
  return {
    proficiencies: {
      armor: emptyMap(),
      weapons: emptyMap(),
      tools: emptyMap(),
      languages: emptyMap(),
      skills: emptyMap(),
      savingThrows: emptyMap(),
    },
    abilityBonuses: [],
    features: emptyMap(),
    feats: emptyMap(),
    spells: emptyMap(),
    equipment: emptyMap(),
    choices: [],
  }
}

export function createEmptyCharacter(initial: Partial<Character> = {}): Character {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    schemaVersion: CURRENT_CHARACTER_SCHEMA_VERSION,
    name: '',
    originSystem: '2014',
    race: '',
    background: '',
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    experiencePoints: 0,
    classProgression: [],
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    proficiencies: {
      armor: [],
      weapons: [],
      tools: [],
      skills: [],
      expertise: [],
      languages: [],
      savingThrows: [],
    },
    features: [],
    feats: [],
    spells: {
      spellProfiles: [
        {
          id: 'special:unrestricted',
          type: 'special',
          label: SPECIAL_SPELL_PROFILE_LABEL,
          cantrips: [],
          spellsKnown: [],
          preparedSpells: [],
          alwaysPrepared: true,
        },
      ],
      spellSlots: {
        1: { max: 0, used: 0 },
        2: { max: 0, used: 0 },
        3: { max: 0, used: 0 },
        4: { max: 0, used: 0 },
        5: { max: 0, used: 0 },
        6: { max: 0, used: 0 },
        7: { max: 0, used: 0 },
        8: { max: 0, used: 0 },
        9: { max: 0, used: 0 },
      },
      pactSpellSlots: {
        1: { max: 0, used: 0 },
        2: { max: 0, used: 0 },
        3: { max: 0, used: 0 },
        4: { max: 0, used: 0 },
        5: { max: 0, used: 0 },
        6: { max: 0, used: 0 },
        7: { max: 0, used: 0 },
        8: { max: 0, used: 0 },
        9: { max: 0, used: 0 },
      },
    },
    equipment: [],
    hitPoints: { current: 0, temporary: 0 },
    hitPointsInitialized: false,
    hitPointGains: [],
    hitPointAdjustments: [],
    armorClassAdjustments: [],
    movement: {
      speeds: {},
      source: { kind: 'manual', name: 'Unspecified movement' },
    },
    movementAdjustments: [],
    movementOverrides: {},
    details: {},
    portraitTransform: { ...DEFAULT_PORTRAIT_TRANSFORM },
    classChoiceSelections: [],
    manualEffects: [],
    suppressedEffectIds: [],
    effectFlags: {},
    manualActions: [],
    createdAt: now,
    lastModified: now,
    provenance: emptyProvenance(),
    ...initial,
  }
}
