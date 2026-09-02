import { SPECIAL_SPELL_PROFILE_LABEL } from '@/lib/calculations/spellProfiles'
import { DEFAULT_PORTRAIT_TRANSFORM } from '@/lib/portraitConstants'
import type { ProvenanceLedger, SourceTag } from '@/lib/provenance/types'
import { CURRENT_SCHEMA_VERSION } from '@/lib/schema/migrations'
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
    version: `${CURRENT_SCHEMA_VERSION}.0.0`,
    name: '',
    originSystem: '2014',
    race: '',
    class: '',
    background: '',
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    level: 1,
    experiencePoints: 0,
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
    },
    equipment: [],
    hitPoints: { max: 0, current: 0, temporary: 0 },
    initiative: 0,
    speed: 30,
    savingThrows: {
      strength: { proficient: false, bonus: 0 },
      dexterity: { proficient: false, bonus: 0 },
      constitution: { proficient: false, bonus: 0 },
      intelligence: { proficient: false, bonus: 0 },
      wisdom: { proficient: false, bonus: 0 },
      charisma: { proficient: false, bonus: 0 },
    },
    skills: {},
    details: {},
    portraitTransform: { ...DEFAULT_PORTRAIT_TRANSFORM },
    createdAt: now,
    lastModified: now,
    provenance: emptyProvenance(),
    ...initial,
  }
}
