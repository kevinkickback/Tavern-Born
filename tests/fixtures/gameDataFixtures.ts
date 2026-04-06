import type { Class5e, Race5e, Spell5e } from '@/types/5etools';

function buildClassFeatureRefs(cls: Class5e) {
  const refs = Array.isArray(cls.classFeatures) ? cls.classFeatures : [];
  return refs
    .map((feature) => {
      if (typeof feature !== 'string') return undefined;
      const [name, className, source, level] = feature.split('|');
      const parsedLevel = Number.parseInt(level ?? '', 10);
      return {
        ref: feature,
        name,
        source,
        className,
        classSource: cls.source,
        level: Number.isNaN(parsedLevel) ? undefined : parsedLevel,
      };
    })
    .filter((feature) => feature !== undefined);
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
  };

  if (!fixture.classFeatureRefs) {
    fixture.classFeatureRefs = buildClassFeatureRefs(fixture);
  }

  return fixture;
}

export function makeRaceFixture(overrides: Partial<Race5e> = {}): Race5e {
  return {
    name: 'Human',
    source: 'PHB',
    ability: [{ str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }],
    ...overrides,
  };
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
  };
}
