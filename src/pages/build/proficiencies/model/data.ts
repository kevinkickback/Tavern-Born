import { normalizeKey } from '@/lib/provenance';
import type { ChoiceRecord } from '@/lib/provenance/types';

type ToolGenericKind = 'musical instrument' | "artisan's tools" | 'gaming set';

export type ToolChoiceSlot = {
  id: string;
  choiceId: string;
  label: string;
  sourceName: string;
  options: string[];
};

interface BuildToolSubtypeParams {
  itemsBase?: unknown[];
  items?: unknown[];
  allowedSources?: string[];
}

export function normalizeGenericToolKind(
  value: string,
): ToolGenericKind | null {
  const key = normalizeKey(value);
  if (
    key.includes('musical instrument') ||
    key === 'anymusicalinstrument' ||
    key === 'instrumentmusical'
  ) {
    return 'musical instrument';
  }
  if (
    key.includes("artisan's tool") ||
    key.includes('artisans tool') ||
    key === 'anyartisanstool' ||
    key === 'anyartisantool'
  ) {
    return "artisan's tools";
  }
  if (
    key.includes('gaming set') ||
    key === 'anygamingset' ||
    key === 'setgaming'
  ) {
    return 'gaming set';
  }
  return null;
}

function getItemTypePrefix(type: unknown): string {
  if (typeof type !== 'string') return '';
  return type.split('|')[0] ?? '';
}

function addUniqueByNorm(list: string[], value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return list;
  const exists = list.some((v) => normalizeKey(v) === normalizeKey(value));
  if (exists) return list;
  return [...list, value];
}

export function hasProfInArray(arr: string[], name: string): boolean {
  const norm = normalizeKey(name);
  return arr.some((value) => normalizeKey(value) === norm);
}

export function buildSkillDescriptions(
  rawSkills: unknown,
): Record<string, unknown[]> {
  const map: Record<string, unknown[]> = {};

  const addSkill = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const maybeSkill = value as { name?: unknown; entries?: unknown };
    if (typeof maybeSkill.name !== 'string') return;
    if (!Array.isArray(maybeSkill.entries)) return;
    map[maybeSkill.name.toLowerCase()] = maybeSkill.entries;
  };

  if (Array.isArray(rawSkills)) {
    for (const skill of rawSkills) addSkill(skill);
  } else if (rawSkills && typeof rawSkills === 'object') {
    for (const skill of Object.values(rawSkills)) addSkill(skill);
  }

  return map;
}

export function buildChoiceCounts(
  choices: ChoiceRecord[],
): Record<'skills' | 'armor' | 'weapons' | 'tools' | 'languages', number> {
  const counts: Record<
    'skills' | 'armor' | 'weapons' | 'tools' | 'languages',
    number
  > = {
    skills: 0,
    armor: 0,
    weapons: 0,
    tools: 0,
    languages: 0,
  };

  for (const choice of choices) {
    if (!(choice.domain in counts)) continue;
    const key = choice.domain as keyof typeof counts;
    counts[key] += Math.max(0, choice.chooseCount - choice.selected.length);
  }

  return counts;
}

export function buildToolSubtypeOptionsByKind({
  itemsBase,
  items,
  allowedSources,
}: BuildToolSubtypeParams): Record<ToolGenericKind, string[]> {
  const fromBase = itemsBase ?? [];
  const fromItems = items ?? [];
  const usableSources = allowedSources ?? [];
  const hasSourceFilter = usableSources.length > 0;

  const filterBySource = (sourceItems: unknown[]) =>
    sourceItems.filter((item) => {
      const typedItem = item as { source?: string };
      if (!hasSourceFilter) return true;
      if (!typedItem?.source) return true;
      return usableSources.includes(typedItem.source);
    });

  const collectByType = (
    sourceItems: unknown[],
    typePrefix: string,
  ): string[] => {
    const filtered = sourceItems.filter(
      (item) =>
        getItemTypePrefix((item as { type?: unknown })?.type) === typePrefix,
    );

    let out: string[] = [];
    for (const item of filtered) {
      out = addUniqueByNorm(out, (item as { name?: unknown })?.name);
    }

    return out.sort((a, b) => a.localeCompare(b));
  };

  const baseItems = filterBySource(fromBase);
  const allItems = filterBySource([...fromBase, ...fromItems]);

  const instruments = collectByType(baseItems, 'INS');
  const artisans = collectByType(baseItems, 'AT');
  const gaming = collectByType(baseItems, 'GS');

  return {
    'musical instrument':
      instruments.length > 0 ? instruments : collectByType(allItems, 'INS'),
    "artisan's tools":
      artisans.length > 0 ? artisans : collectByType(allItems, 'AT'),
    'gaming set': gaming.length > 0 ? gaming : collectByType(allItems, 'GS'),
  };
}

interface BuildToolChoiceSlotsParams {
  choices: ChoiceRecord[];
  selectedTools: string[];
  toolSubtypeOptionsByKind: Record<ToolGenericKind, string[]>;
}

export function buildToolChoiceSlots({
  choices,
  selectedTools,
  toolSubtypeOptionsByKind,
}: BuildToolChoiceSlotsParams): ToolChoiceSlot[] {
  const selectedToolNorms = new Set(
    selectedTools.map((name) => normalizeKey(name)),
  );
  const slots: ToolChoiceSlot[] = [];

  for (const choice of choices) {
    if (choice.domain !== 'tools') continue;

    const kinds = Array.from(
      new Set(
        choice.optionPool
          .map((token) => normalizeGenericToolKind(token))
          .filter((kind): kind is ToolGenericKind => Boolean(kind)),
      ),
    );
    if (kinds.length === 0) continue;

    const remaining = Math.max(0, choice.chooseCount - choice.selected.length);
    if (remaining === 0) continue;

    const pool = Array.from(
      new Set(kinds.flatMap((kind) => toolSubtypeOptionsByKind[kind] ?? [])),
    )
      .filter((name) => !selectedToolNorms.has(normalizeKey(name)))
      .sort((a, b) => a.localeCompare(b));

    const label = kinds.length === 1 ? kinds[0] : 'tool proficiency';

    for (let idx = 0; idx < remaining; idx++) {
      slots.push({
        id: `${choice.id}:${idx}`,
        choiceId: choice.id,
        label,
        sourceName: choice.sourceTag.sourceName,
        options: pool,
      });
    }
  }

  return slots;
}
