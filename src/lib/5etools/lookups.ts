import type {
  Class5e,
  ClassFeature,
  GameData,
  GameDataLookups,
  Spell5e,
  Subclass5e,
} from '@/types/5etools';

export function getEntityLookupKey(name?: unknown, source?: unknown): string {
  const safeName = typeof name === 'string' ? name.trim() : '';
  const safeSource = typeof source === 'string' ? source.trim() : '';
  return `${safeName}|${safeSource}`;
}

export function getSubclassLookupKey(
  className?: unknown,
  classSource?: unknown,
  subclassName?: unknown,
  subclassSource?: unknown,
): string {
  return [
    typeof className === 'string' ? className.trim() : '',
    typeof classSource === 'string' ? classSource.trim() : '',
    typeof subclassName === 'string' ? subclassName.trim() : '',
    typeof subclassSource === 'string' ? subclassSource.trim() : '',
  ].join('|');
}

export function buildClassFeatureLookup(
  classFeatures: ClassFeature[],
): Record<string, ClassFeature> {
  return classFeatures.reduce<Record<string, ClassFeature>>(
    (lookup, feature) => {
      const key = getEntityLookupKey(feature.name, feature.source);
      if (key !== '|' && !lookup[key]) {
        lookup[key] = feature;
      }
      return lookup;
    },
    {},
  );
}

export function buildClassLookup(classes: Class5e[]): Record<string, Class5e> {
  return classes.reduce<Record<string, Class5e>>((lookup, cls) => {
    const key = getEntityLookupKey(cls.name, cls.source);
    if (key !== '|' && !lookup[key]) {
      lookup[key] = cls;
    }
    return lookup;
  }, {});
}

export function buildSpellLookup(spells: Spell5e[]): Record<string, Spell5e> {
  return spells.reduce<Record<string, Spell5e>>((lookup, spell) => {
    const key = getEntityLookupKey(spell.name, spell.source);
    if (key !== '|' && !lookup[key]) {
      lookup[key] = spell;
    }
    return lookup;
  }, {});
}

export function buildOptionalFeatureLookup(
  optionalFeatures: unknown[],
): Record<string, unknown> {
  return optionalFeatures.reduce<Record<string, unknown>>((lookup, feature) => {
    if (typeof feature !== 'object' || feature === null) return lookup;
    const key = getEntityLookupKey(
      (feature as { name?: unknown }).name,
      (feature as { source?: unknown }).source,
    );
    if (key !== '|' && !lookup[key]) {
      lookup[key] = feature;
    }
    return lookup;
  }, {});
}

export function buildSubclassLookup(
  classes: Class5e[],
): Record<string, Subclass5e> {
  return classes.reduce<Record<string, Subclass5e>>((lookup, cls) => {
    for (const subclass of cls.subclasses ?? []) {
      const key = getSubclassLookupKey(
        cls.name,
        cls.source,
        subclass.name,
        subclass.source,
      );
      if (key !== '|||' && !lookup[key]) {
        lookup[key] = subclass;
      }

      const shortKey = getSubclassLookupKey(
        cls.name,
        cls.source,
        subclass.shortName,
        subclass.source,
      );
      if (shortKey !== '|||' && !lookup[shortKey]) {
        lookup[shortKey] = subclass;
      }
    }
    return lookup;
  }, {});
}

export function buildGameDataLookups(gameData: GameData): GameDataLookups {
  return {
    classesByKey: buildClassLookup(gameData.classes),
    classFeaturesByKey: buildClassFeatureLookup(gameData.classFeatures),
    spellsByKey: buildSpellLookup(gameData.spells),
    optionalFeaturesByKey: buildOptionalFeatureLookup(
      gameData.optionalfeatures,
    ),
    subclassesByKey: buildSubclassLookup(gameData.classes),
  };
}
