export interface CompendiumEntry {
  name: string;
  type: string;
  source: string;
  description?: string;
  data: Record<string, unknown>;
}

interface CompendiumGameData {
  races?: unknown;
  classes?: unknown;
  spells?: unknown;
  items?: unknown[];
  backgrounds?: unknown;
  feats?: unknown;
  skills?: unknown;
  actions?: unknown[];
  conditions?: unknown[];
  languages?: unknown;
  deities?: unknown[];
}

function asObj(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

export function buildCompendiumEntries(
  gameData: CompendiumGameData | null | undefined,
): CompendiumEntry[] {
  if (!gameData) return [];

  const entries: CompendiumEntry[] = [];

  if (gameData.races) {
    Object.values(gameData.races).forEach((race) => {
      const raceObj = asObj(race);
      const entriesList = Array.isArray(raceObj.entries) ? raceObj.entries : [];
      entries.push({
        name: String(raceObj.name ?? ''),
        type: 'Race',
        source: String(raceObj.source ?? 'Unknown'),
        description: String(entriesList[0] ?? ''),
        data: raceObj,
      });
    });
  }

  if (gameData.classes) {
    Object.values(gameData.classes).forEach((cls) => {
      const clsObj = asObj(cls);
      const fluffEntries = Array.isArray(asObj(clsObj.fluff).entries)
        ? (asObj(clsObj.fluff).entries as unknown[])
        : [];
      entries.push({
        name: String(clsObj.name ?? ''),
        type: 'Class',
        source: String(clsObj.source ?? 'Unknown'),
        description: String(fluffEntries[0] ?? ''),
        data: clsObj,
      });
    });
  }

  if (gameData.spells) {
    Object.values(gameData.spells).forEach((spell) => {
      const spellObj = asObj(spell);
      entries.push({
        name: String(spellObj.name ?? ''),
        type: 'Spell',
        source: String(spellObj.source ?? 'Unknown'),
        description: `Level ${String(spellObj.level ?? '?')} ${String(spellObj.school ?? '')}`,
        data: spellObj,
      });
    });
  }

  if (gameData.items) {
    gameData.items.forEach((item) => {
      const itemObj = asObj(item);
      const itemEntries = Array.isArray(itemObj.entries) ? itemObj.entries : [];
      entries.push({
        name: String(itemObj.name ?? ''),
        type: 'Item',
        source: String(itemObj.source ?? 'Unknown'),
        description: String(itemEntries[0] ?? itemObj.type ?? ''),
        data: itemObj,
      });
    });
  }

  if (gameData.backgrounds) {
    Object.values(gameData.backgrounds).forEach((bg) => {
      const bgObj = asObj(bg);
      const bgEntries = Array.isArray(bgObj.entries) ? bgObj.entries : [];
      entries.push({
        name: String(bgObj.name ?? ''),
        type: 'Background',
        source: String(bgObj.source ?? 'Unknown'),
        description: String(bgEntries[0] ?? ''),
        data: bgObj,
      });
    });
  }

  if (gameData.feats) {
    Object.values(gameData.feats).forEach((feat) => {
      const featObj = asObj(feat);
      const featEntries = Array.isArray(featObj.entries) ? featObj.entries : [];
      entries.push({
        name: String(featObj.name ?? ''),
        type: 'Feat',
        source: String(featObj.source ?? 'Unknown'),
        description: String(featEntries[0] ?? ''),
        data: featObj,
      });
    });
  }

  if (gameData.skills) {
    Object.values(gameData.skills).forEach((skill) => {
      const skillObj = asObj(skill);
      const skillEntries = Array.isArray(skillObj.entries)
        ? skillObj.entries
        : [];
      entries.push({
        name: String(skillObj.name ?? ''),
        type: 'Skill',
        source: String(skillObj.source ?? 'Unknown'),
        description: String(skillEntries[0] ?? ''),
        data: skillObj,
      });
    });
  }

  if (gameData.actions) {
    gameData.actions.forEach((action) => {
      const actionObj = asObj(action);
      const actionEntries = Array.isArray(actionObj.entries)
        ? actionObj.entries
        : [];
      entries.push({
        name: String(actionObj.name ?? ''),
        type: 'Action',
        source: String(actionObj.source ?? 'Unknown'),
        description: String(actionEntries[0] ?? ''),
        data: actionObj,
      });
    });
  }

  if (gameData.conditions) {
    gameData.conditions.forEach((condition) => {
      const conditionObj = asObj(condition);
      const conditionEntries = Array.isArray(conditionObj.entries)
        ? conditionObj.entries
        : [];
      entries.push({
        name: String(conditionObj.name ?? ''),
        type: 'Condition',
        source: String(conditionObj.source ?? 'Unknown'),
        description: String(conditionEntries[0] ?? ''),
        data: conditionObj,
      });
    });
  }

  if (gameData.languages) {
    Object.values(gameData.languages).forEach((language) => {
      const languageObj = asObj(language);
      const languageEntries = Array.isArray(languageObj.entries)
        ? languageObj.entries
        : [];
      entries.push({
        name: String(languageObj.name ?? ''),
        type: 'Language',
        source: String(languageObj.source ?? 'Unknown'),
        description: String(languageEntries[0] ?? languageObj.type ?? ''),
        data: languageObj,
      });
    });
  }

  if (gameData.deities) {
    gameData.deities.forEach((deity) => {
      const deityObj = asObj(deity);
      entries.push({
        name: String(deityObj.name ?? ''),
        type: 'Deity',
        source: String(deityObj.source ?? 'Unknown'),
        description: String(deityObj.title ?? deityObj.alignment ?? ''),
        data: deityObj,
      });
    });
  }

  return entries;
}

export function filterCompendiumEntries(
  entries: CompendiumEntry[],
  searchQuery: string,
  activeTypes: Set<string>,
  activeSources: Set<string>,
): CompendiumEntry[] {
  let filtered = entries;

  if (activeTypes.size > 0) {
    filtered = filtered.filter((entry) => activeTypes.has(entry.type));
  }

  if (activeSources.size > 0) {
    filtered = filtered.filter((entry) => activeSources.has(entry.source));
  }

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (entry) =>
        entry.name.toLowerCase().includes(query) ||
        entry.type.toLowerCase().includes(query) ||
        entry.source.toLowerCase().includes(query),
    );
  }

  return filtered.sort((a, b) => a.name.localeCompare(b.name));
}
