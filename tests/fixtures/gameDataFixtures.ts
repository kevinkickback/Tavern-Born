import type { Class5e, Race5e, Spell5e } from '@/types/5etools'

function buildClassFeatureRefs(cls: Class5e) {
  const refs = Array.isArray(cls.classFeatures) ? cls.classFeatures : []
  return refs
    .map((feature) => {
      if (typeof feature !== 'string') return undefined
      const [name, className, source, level] = feature.split('|')
      const parsedLevel = Number.parseInt(level ?? '', 10)
      return {
        ref: feature,
        name,
        source,
        className,
        classSource: cls.source,
        level: Number.isNaN(parsedLevel) ? undefined : parsedLevel,
      }
    })
    .filter((feature) => feature !== undefined)
}

export function makeClassFixture(overrides: Partial<Class5e> = {}): Class5e {
  const fixture: Class5e = {
    name: 'Wizard',
    source: 'PHB',
    hd: { faces: 6, number: 1 },
    classFeatures: [
      'Ability Score Improvement|Wizard|PHB|4',
      'Ability Score Improvement|Wizard|PHB|8',
      'Ability Score Improvement|Wizard|PHB|12',
      'Ability Score Improvement|Wizard|PHB|16',
      'Ability Score Improvement|Wizard|PHB|19',
    ],
    casterProgression: 'full',
    classTableGroups: [
      {
        rowsSpellProgression: [[2], [3], [4, 2], [4, 3], [4, 3, 2]],
      },
    ],
    ...overrides,
  }

  if (!fixture.classFeatureRefs) {
    fixture.classFeatureRefs = buildClassFeatureRefs(fixture)
  }

  return fixture
}

export function makeRaceFixture(overrides: Partial<Race5e> = {}): Race5e {
  return {
    name: 'Human',
    source: 'PHB',
    ability: [{ str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }],
    ...overrides,
  }
}

export function makeSpellFixture(overrides: Partial<Spell5e> = {}): Spell5e {
  return {
    name: 'Magic Missile',
    source: 'PHB',
    level: 1,
    school: 'V',
    time: [{ number: 1, unit: 'action' }],
    range: { type: 'point', distance: { type: 'feet', amount: 120 } },
    duration: [{ type: 'instant' }],
    ...overrides,
  }
}

// ---------- XPHB (2024) class fixtures ----------

/** XPHB Sorcerer: level-only prepared caster (preparedSpellsChange = "level"). */
export function makeXphbSorcererFixture(overrides: Partial<Class5e> = {}): Class5e {
  return makeClassFixture({
    name: 'Sorcerer',
    source: 'XPHB',
    hd: { faces: 6, number: 1 },
    casterProgression: 'full',
    spellcastingAbility: 'cha',
    preparedSpellsProgression: [
      2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22,
    ],
    preparedSpellsChange: 'level',
    cantripProgression: [4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
    ...overrides,
  })
}

/** XPHB Cleric: daily-prep true prepared caster (preparedSpellsChange = "restLong"). */
export function makeXphbClericFixture(overrides: Partial<Class5e> = {}): Class5e {
  return makeClassFixture({
    name: 'Cleric',
    source: 'XPHB',
    hd: { faces: 8, number: 1 },
    casterProgression: 'full',
    spellcastingAbility: 'wis',
    preparedSpellsProgression: [
      4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22,
    ],
    preparedSpellsChange: 'restLong',
    cantripProgression: [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    ...overrides,
  })
}

/** XPHB Wizard: daily-prep + spellbook (preparedSpellsProgression + spellsKnownProgressionFixed). */
export function makeXphbWizardFixture(overrides: Partial<Class5e> = {}): Class5e {
  return makeClassFixture({
    name: 'Wizard',
    source: 'XPHB',
    hd: { faces: 6, number: 1 },
    casterProgression: 'full',
    spellcastingAbility: 'int',
    preparedSpellsProgression: [
      4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25,
    ],
    preparedSpellsChange: 'restLong',
    cantripProgression: [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    spellsKnownProgressionFixed: [6, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    spellsKnownProgressionFixedAllowLowerLevel: true,
    ...overrides,
  })
}

/** XPHB Warlock: level-only prepared + pact caster. */
export function makeXphbWarlockFixture(overrides: Partial<Class5e> = {}): Class5e {
  return makeClassFixture({
    name: 'Warlock',
    source: 'XPHB',
    hd: { faces: 8, number: 1 },
    casterProgression: 'pact',
    spellcastingAbility: 'cha',
    preparedSpellsProgression: [
      2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15,
    ],
    preparedSpellsChange: 'level',
    cantripProgression: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    ...overrides,
  })
}

/** XPHB Ranger: daily-prep true prepared caster with artificer rounding. */
export function makeXphbRangerFixture(overrides: Partial<Class5e> = {}): Class5e {
  return makeClassFixture({
    name: 'Ranger',
    source: 'XPHB',
    hd: { faces: 10, number: 1 },
    casterProgression: 'artificer',
    spellcastingAbility: 'wis',
    preparedSpellsProgression: [
      2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15,
    ],
    preparedSpellsChange: 'restLong',
    ...overrides,
  })
}

/** XPHB Bard: level-only prepared caster. */
export function makeXphbBardFixture(overrides: Partial<Class5e> = {}): Class5e {
  return makeClassFixture({
    name: 'Bard',
    source: 'XPHB',
    hd: { faces: 8, number: 1 },
    casterProgression: 'full',
    spellcastingAbility: 'cha',
    preparedSpellsProgression: [
      4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22,
    ],
    preparedSpellsChange: 'level',
    cantripProgression: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
    ...overrides,
  })
}
