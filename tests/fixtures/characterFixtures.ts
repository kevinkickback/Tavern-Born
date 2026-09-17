import type { PrereqCharacterSnapshot } from '@/lib/calculations/prerequisites'
import { CURRENT_CHARACTER_SCHEMA_VERSION } from '@/lib/schema/characterSchemaVersion'
import type { Character } from '@/types/character'

export function makePrereqCharacterSnapshotFixture(
  overrides: Partial<PrereqCharacterSnapshot> = {},
): PrereqCharacterSnapshot {
  return {
    race: 'Human',
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    features: [],
    spells: {
      cantrips: [],
      spellsKnown: [],
      preparedSpells: [],
    },
    progression: [{ name: 'Fighter', levels: 1, source: 'PHB' }],
    ...overrides,
  }
}

export function makeCharacterFixture(overrides: Partial<Character> = {}): Character {
  const now = '2026-01-01T00:00:00.000Z'

  return {
    id: 'character-1',
    schemaVersion: CURRENT_CHARACTER_SCHEMA_VERSION,
    name: 'Fixture Character',
    originSystem: '2014',
    race: 'Human',
    raceSource: 'PHB',
    background: 'Soldier',
    backgroundSource: 'PHB',
    currency: {
      cp: 0,
      sp: 0,
      ep: 0,
      gp: 0,
      pp: 0,
    },
    experiencePoints: 0,
    classProgression: [{ name: 'Fighter', levels: 1, source: 'PHB' }],
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
          id: 'class:Fighter|PHB',
          type: 'class',
          label: 'Fighter (Lv 1)',
          className: 'Fighter',
          classSource: 'PHB',
          cantrips: [],
          spellsKnown: [],
          preparedSpells: [],
          alwaysPrepared: false,
        },
        {
          id: 'special:unrestricted',
          type: 'special',
          label: 'Special (Unrestricted)',
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
    hitPoints: {
      current: 10,
      temporary: 0,
    },
    movement: { speeds: { walk: 30 }, source: { kind: 'manual', name: 'Manual' } },
    details: {},
    provenance: {
      proficiencies: {
        armor: {},
        weapons: {},
        tools: {},
        languages: {},
        skills: {},
        savingThrows: {},
      },
      abilityBonuses: [],
      features: {},
      feats: {},
      spells: {},
      equipment: {},
      choices: [],
    },
    createdAt: now,
    lastModified: now,
    ...overrides,
  }
}
