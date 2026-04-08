import type { PrereqCharacterSnapshot } from '@/lib/calculations/prerequisites';
import type { Progression } from '@/lib/characterUtils';
import type { Character } from '@/types/character';

export function makeProgressionFixture(
  overrides: Partial<Progression> = {},
): Progression {
  return {
    classes: [{ name: 'Fighter', levels: 1, source: 'PHB' }],
    ...overrides,
  };
}

export function makePrereqCharacterSnapshotFixture(
  overrides: Partial<PrereqCharacterSnapshot> = {},
): PrereqCharacterSnapshot {
  return {
    level: 1,
    class: 'Fighter',
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
    progression: {
      classes: [{ name: 'Fighter', levels: 1, source: 'PHB' }],
    },
    ...overrides,
  };
}

export function makeCharacterFixture(
  overrides: Partial<Character> = {},
): Character {
  const now = '2026-01-01T00:00:00.000Z';

  return {
    id: 'character-1',
    version: '1.0.0',
    name: 'Fixture Character',
    race: 'Human',
    class: 'Fighter',
    background: 'Soldier',
    currency: {
      cp: 0,
      sp: 0,
      ep: 0,
      gp: 0,
      pp: 0,
    },
    level: 1,
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
        level1: { max: 0, used: 0 },
        level2: { max: 0, used: 0 },
        level3: { max: 0, used: 0 },
        level4: { max: 0, used: 0 },
        level5: { max: 0, used: 0 },
        level6: { max: 0, used: 0 },
        level7: { max: 0, used: 0 },
        level8: { max: 0, used: 0 },
        level9: { max: 0, used: 0 },
      },
    },
    equipment: [],
    hitPoints: {
      max: 10,
      current: 10,
      temporary: 0,
    },
    armorClass: 10,
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
  };
}
