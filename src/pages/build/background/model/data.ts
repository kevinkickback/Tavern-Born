import { extractProficiencyBlockNames } from '@/lib/5etools/parsers';
import type { Background5e } from '@/types/5etools';

type BackgroundEntry = {
  type?: string;
  name?: string;
  entries?: unknown[];
};

export function getBackgroundEntries(
  background: Background5e,
): { name?: string; entries: unknown[] }[] {
  return ((background.entries as unknown[]) ?? [])
    .filter((entry) => {
      const typedEntry = entry as BackgroundEntry;
      return typeof entry === 'object' && typedEntry.type === 'entries';
    })
    .map((entry) => {
      const typedEntry = entry as BackgroundEntry;
      return {
        name: typedEntry.name,
        entries: typedEntry.entries ?? [],
      };
    });
}

export function getBackgroundSkillNames(background?: Background5e): string[] {
  if (!background) return [];
  return extractProficiencyBlockNames(background.skillProficiencies ?? []);
}

export function getBackgroundLanguageNames(
  background?: Background5e,
): string[] {
  if (!background) return [];
  return extractProficiencyBlockNames(background.languageProficiencies ?? []);
}

export function getBackgroundToolNames(background?: Background5e): string[] {
  if (!background) return [];
  return extractProficiencyBlockNames(background.toolProficiencies ?? []);
}

export function getBackgroundEquipmentPackages(
  background?: Background5e,
): { label: string; entries: unknown[] }[] {
  const packages: { label: string; entries: unknown[] }[] = [];

  for (const block of background?.startingEquipment ?? []) {
    if (Array.isArray(block)) continue;
    const equipmentBlock = block as { A?: unknown[]; B?: unknown[] };
    if (typeof block === 'object' && equipmentBlock.A) {
      packages.push({
        label: 'Option A',
        entries: equipmentBlock.A ?? [],
      });
      if (equipmentBlock.B) {
        packages.push({
          label: 'Option B',
          entries: equipmentBlock.B ?? [],
        });
      }
    }
  }

  return packages;
}
