import type { z } from 'zod';
import { SOURCE_FALLBACKS } from './sourceFallbacks';

function _validateData<T>(
  data: unknown,
  schema: z.ZodType<T>,
  resourceName: string,
): T[] {
  try {
    if (Array.isArray(data)) {
      return data.map((item, index) => {
        try {
          return schema.parse(item);
        } catch (error) {
          console.warn(`Validation error in ${resourceName}[${index}]:`, error);
          return item;
        }
      });
    }
    return [];
  } catch (error) {
    console.warn(`Failed to validate ${resourceName}:`, error);
    return [];
  }
}

type ParsedObject = Record<string, unknown>;

function asObject(data: unknown): ParsedObject {
  return typeof data === 'object' && data !== null
    ? (data as ParsedObject)
    : {};
}

function asArray(data: unknown): unknown[] {
  return Array.isArray(data) ? data : [];
}

export function parseRaces(data: unknown): unknown[] {
  const obj = asObject(data);
  const races: unknown[] = obj.race
    ? [...asArray(obj.race)]
    : Array.isArray(data)
      ? [...data]
      : [];
  const subraceEntries: unknown[] = asArray(obj.subrace);

  if (subraceEntries.length === 0) return races;

  // Group subraces by parent race. The parent is identified by raceName + raceSource.
  // Some subraces store this directly; others use _copy.raceName / _copy.raceSource.
  const subraceMap = new Map<string, unknown[]>();
  for (const sr of subraceEntries) {
    const srObj = asObject(sr);
    const copyObj = asObject(srObj._copy);
    const raceName: string | undefined =
      typeof srObj.raceName === 'string'
        ? srObj.raceName
        : (copyObj.raceName as string | undefined);
    const raceSource: string | undefined =
      (typeof srObj.raceSource === 'string' ? srObj.raceSource : undefined) ??
      (typeof copyObj.raceSource === 'string'
        ? copyObj.raceSource
        : undefined) ??
      (typeof srObj.source === 'string' ? srObj.source : undefined);
    if (!raceName) continue;
    const key = `${raceName}|${raceSource ?? ''}`;
    if (!subraceMap.has(key)) subraceMap.set(key, []);
    subraceMap.get(key)?.push(sr);
  }

  return races.map((race) => {
    const raceObj = asObject(race);
    const key = `${String(raceObj.name ?? '')}|${String(raceObj.source ?? '')}`;
    const nested = subraceMap.get(key);
    if (!nested || nested.length === 0) return race;
    return { ...raceObj, subraces: nested };
  });
}

export function parseClasses(data: unknown): unknown[] {
  const obj = asObject(data);
  const classes: unknown[] = obj.class
    ? [...asArray(obj.class)]
    : Array.isArray(data)
      ? [...data]
      : [];
  const subclassEntries: unknown[] = asArray(obj.subclass);

  if (subclassEntries.length === 0) return classes;

  // Build maps for intro entries and per-level features from subclassFeature records.
  // XPHB-style subclasses have an intro record whose name === shortName (e.g. "Abjurer").
  // PHB-style subclasses have an intro record whose name === the full subclass name (e.g.
  // "School of Abjuration"), which never matches the shortName ("Abjuration").
  // We capture both patterns: introEntriesMap keyed by shortName, fullNameIntroMap keyed
  // by feature name, so that the lookup below can fall back for PHB-style entries.
  const introEntriesMap = new Map<string, unknown[]>();
  const fullNameIntroMap = new Map<string, unknown[]>();
  const levelFeaturesMap = new Map<
    string,
    { level: number; features: unknown[] }[]
  >();
  const subclassFeatureRecords: unknown[] = asArray(obj.subclassFeature);
  for (const scf of subclassFeatureRecords) {
    const scfObj = asObject(scf);
    if (!scfObj.subclassShortName || !scfObj.className || !scfObj.entries)
      continue;
    const key = `${String(scfObj.subclassShortName)}|${String(scfObj.className)}|${String(scfObj.classSource ?? '')}`;
    if (scfObj.name === scfObj.subclassShortName) {
      // XPHB-style intro: name === shortName — capture for shortName-keyed lookup
      if (!introEntriesMap.has(key))
        introEntriesMap.set(key, asArray(scfObj.entries));
    } else {
      // PHB-style: feature name is the full subclass name (e.g. "School of Abjuration").
      // Index by feature name so the lookup below can find it via sc.name.
      const nameKey = `${String(scfObj.name ?? '')}|${String(scfObj.className)}|${String(scfObj.classSource ?? '')}`;
      if (!fullNameIntroMap.has(nameKey))
        fullNameIntroMap.set(nameKey, asArray(scfObj.entries));

      // Content feature — group by level for the rich detail pane
      if (!levelFeaturesMap.has(key)) levelFeaturesMap.set(key, []);
      const levels = levelFeaturesMap.get(key);
      if (!levels) continue;
      const level = typeof scfObj.level === 'number' ? scfObj.level : 0;
      const existing = levels.find((l) => l.level === level);
      if (existing) {
        existing.features.push(scf);
      } else {
        levels.push({ level, features: [scf] });
      }
    }
  }

  // Group subclasses by parent class (by className + classSource)
  const subclassMap = new Map<string, unknown[]>();
  for (const sc of subclassEntries) {
    const scObj = asObject(sc);
    const className =
      typeof scObj.className === 'string' ? scObj.className : undefined;
    const classSource =
      typeof scObj.classSource === 'string' ? scObj.classSource : undefined;
    if (!className) continue;
    const parentKey = `${className}|${classSource ?? ''}`;
    if (!subclassMap.has(parentKey)) subclassMap.set(parentKey, []);
    const introKey = `${String(scObj.shortName ?? '')}|${className}|${classSource ?? ''}`;
    // Fallback: PHB-style subclasses where shortName != feature name; look up by sc.name
    const fullNameKey = `${String(scObj.name ?? '')}|${className}|${classSource ?? ''}`;
    const entries =
      introEntriesMap.get(introKey) ?? fullNameIntroMap.get(fullNameKey) ?? [];
    const levelFeatures = levelFeaturesMap.get(introKey) ?? [];
    subclassMap.get(parentKey)?.push({ ...scObj, entries, levelFeatures });
  }

  return classes.map((cls) => {
    const clsObj = asObject(cls);
    const key = `${String(clsObj.name ?? '')}|${String(clsObj.source ?? '')}`;
    const nested = subclassMap.get(key);
    if (!nested || nested.length === 0) return cls;
    return { ...clsObj, subclasses: nested };
  });
}

export function parseBackgrounds(data: unknown): unknown[] {
  const obj = asObject(data);
  if (obj.background) return asArray(obj.background);
  if (Array.isArray(data)) return data;
  return [];
}

export function parseSpells(data: unknown): unknown[] {
  const obj = asObject(data);
  if (obj.spell) return asArray(obj.spell);
  if (Array.isArray(data)) return data;
  return [];
}

export function parseFeats(data: unknown): unknown[] {
  const obj = asObject(data);
  if (obj.feat) return asArray(obj.feat);
  if (Array.isArray(data)) return data;
  return [];
}

export function parseItems(data: unknown): unknown[] {
  const obj = asObject(data);
  const items: unknown[] = [];

  if (obj.item) items.push(...asArray(obj.item));
  if (obj.itemGroup) items.push(...asArray(obj.itemGroup));
  if (obj.baseitem) items.push(...asArray(obj.baseitem));
  if (Array.isArray(data)) items.push(...data);

  return items;
}

export function parseClassFeatures(data: unknown): unknown[] {
  const obj = asObject(data);
  if (obj.classFeature) return asArray(obj.classFeature);
  if (Array.isArray(data)) return data;
  return [];
}

export function parseActions(data: unknown): unknown[] {
  const obj = asObject(data);
  if (obj.action) return asArray(obj.action);
  if (Array.isArray(data)) return data;
  return [];
}

export function parseConditions(data: unknown): unknown[] {
  const obj = asObject(data);
  const conditions: unknown[] = [];
  if (obj.condition) conditions.push(...asArray(obj.condition));
  if (obj.disease) conditions.push(...asArray(obj.disease));
  if (Array.isArray(data)) conditions.push(...data);
  return conditions;
}

export function parseDeities(data: unknown): unknown[] {
  const obj = asObject(data);
  if (obj.deity) return asArray(obj.deity);
  if (Array.isArray(data)) return data;
  return [];
}

export function parseSkills(data: unknown): unknown[] {
  const obj = asObject(data);
  if (obj.skill) return asArray(obj.skill);
  if (Array.isArray(data)) return data;
  return [];
}

export function parseSenses(data: unknown): unknown[] {
  const obj = asObject(data);
  if (obj.sense) return asArray(obj.sense);
  if (Array.isArray(data)) return data;
  return [];
}

export function parseLanguages(data: unknown): unknown[] {
  const obj = asObject(data);
  if (obj.language) return asArray(obj.language);
  if (Array.isArray(data)) return data;
  return [];
}

export function parseMagicVariants(data: unknown): unknown[] {
  const obj = asObject(data);
  if (obj.variant) return asArray(obj.variant);
  if (obj.magicvariant) return asArray(obj.magicvariant);
  if (Array.isArray(data)) return data;
  return [];
}

export function parseOptionalFeatures(data: unknown): unknown[] {
  const obj = asObject(data);
  if (obj.optionalfeature) return asArray(obj.optionalfeature);
  if (Array.isArray(data)) return data;
  return [];
}

export function parseVariantRules(data: unknown): unknown[] {
  const obj = asObject(data);
  if (obj.variantrule) return asArray(obj.variantrule);
  if (Array.isArray(data)) return data;
  return [];
}

export function parseBooks(data: unknown): unknown[] {
  const obj = asObject(data);
  if (!data) return [];
  if (obj.book) return asArray(obj.book);
  if (obj.adventure) return asArray(obj.adventure);
  if (Array.isArray(data)) return data;
  return [];
}

/**
 * Extract named proficiencies from a 5etools proficiency/language block array.
 * Returns an array of string labels (name, "choose N", "any N standard").
 * Omits structural keys like `choose` and `anyStandard`.
 *
 * @param blocks  - e.g. `race.languageProficiencies`, `bg.skillProficiencies`, etc.
 * @param includeAnyStandard - include "any N standard" entries (default true)
 */
export function extractProficiencyBlockNames(
  blocks: unknown[],
  { includeAnyStandard = true } = {},
): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    const blockObj = asObject(block);
    for (const [key, val] of Object.entries(blockObj)) {
      if (key !== 'choose' && key !== 'anyStandard' && val === true)
        out.push(key);
    }
    const anyStandard = blockObj.anyStandard;
    if (includeAnyStandard && typeof anyStandard === 'number')
      out.push(`any ${anyStandard} standard`);
    const chooseObj = asObject(blockObj.choose);
    if (typeof chooseObj.count === 'number')
      out.push(`choose ${chooseObj.count}`);
  }
  return out;
}

export function buildSourcesList(
  sourceAbbreviations: string[],
  booksData: unknown,
  adventuresData?: unknown,
): Array<{
  abbreviation: string;
  name: string;
  group: string;
  year?: number;
  hasCharacterOptions: boolean;
}> {
  const booksList = parseBooks(booksData);
  const adventuresList = adventuresData ? parseBooks(adventuresData) : [];
  const allEntries = [...booksList, ...adventuresList];
  // Key by both id AND source so entries like {id:"PS-A", source:"PSA"} resolve under both keys
  const booksMap = new Map<string, ParsedObject>();
  for (const entry of allEntries) {
    const entryObj = asObject(entry);
    const id = typeof entryObj.id === 'string' ? entryObj.id : undefined;
    const source =
      typeof entryObj.source === 'string' ? entryObj.source : undefined;
    if (id) booksMap.set(id, entryObj);
    if (source && source !== id) booksMap.set(source, entryObj);
  }

  const characterRelevantGroups = [
    'core',
    'supplement',
    'supplement-alt',
    'setting',
    'setting-alt',
    'adventure',
    'organized-play',
  ];

  return sourceAbbreviations
    .map((abbr) => {
      const book =
        booksMap.get(abbr) ??
        (SOURCE_FALLBACKS[abbr]
          ? { id: abbr, source: abbr, ...SOURCE_FALLBACKS[abbr] }
          : null);
      if (!book) {
        return {
          abbreviation: abbr,
          name: abbr,
          group: 'other',
          hasCharacterOptions: true,
        };
      }
      const bookObj = asObject(book);
      const group = typeof bookObj.group === 'string' ? bookObj.group : 'other';

      const hasCharacterOptions = characterRelevantGroups.includes(group);
      const published =
        typeof bookObj.published === 'string' ? bookObj.published : undefined;

      return {
        abbreviation:
          typeof bookObj.id === 'string'
            ? bookObj.id
            : typeof bookObj.source === 'string'
              ? bookObj.source
              : abbr,
        name: typeof bookObj.name === 'string' ? bookObj.name : abbr,
        group,
        year: published ? Number.parseInt(published, 10) : undefined,
        hasCharacterOptions,
      };
    })
    .filter((source) => source.hasCharacterOptions !== false)
    .sort((a, b) => {
      const groupOrder = [
        'core',
        'supplement',
        'setting',
        'adventure',
        'playtest',
        'other',
      ];
      const groupDiff =
        groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group);
      if (groupDiff !== 0) return groupDiff;
      // Within core: PHB first, DMG second, MM third
      if (a.group === 'core') {
        const coreSlot = (abbr: string) => {
          if (abbr === 'PHB' || abbr === 'XPHB') return 0;
          if (abbr === 'DMG' || abbr === 'XDMG') return 1;
          if (abbr === 'MM' || abbr === 'XMM') return 2;
          return 3;
        };
        const slotDiff = coreSlot(a.abbreviation) - coreSlot(b.abbreviation);
        if (slotDiff !== 0) return slotDiff;
      }
      if (a.year && b.year && a.year !== b.year) return b.year - a.year;
      return a.name.localeCompare(b.name);
    });
}
