import { getEntityLookupKey } from '@/lib/5etools/lookups';
import { normalizeAbilityName } from '@/lib/calculations/abilityScores';
import type { Class5e } from '@/types/5etools';
import type { Character, CharacterClassEntry } from '@/types/character';

interface BuildClassSelectionPatchParams {
  character: Character;
  className: string;
  classSource?: string;
  classLookup: Record<string, Class5e | undefined>;
  fallbackClassByName: Map<string, Class5e>;
}

export function buildClassSelectionPatch({
  character,
  className,
  classSource,
  classLookup,
  fallbackClassByName,
}: BuildClassSelectionPatchParams): {
  classEntity?: Class5e;
  patch: Partial<Character>;
} {
  const classEntity = classSource
    ? classLookup[getEntityLookupKey(className, classSource)]
    : fallbackClassByName.get(className);

  return {
    classEntity,
    patch: {
      class: className,
      classSource: classSource ?? undefined,
      subclass: undefined,
      proficiencies: {
        ...character.proficiencies,
        armor: [
          ...new Set([
            ...character.proficiencies.armor,
            ...(classEntity?.startingProficiencies?.armor ?? []),
          ]),
        ],
        weapons: [
          ...new Set([
            ...character.proficiencies.weapons,
            ...(classEntity?.startingProficiencies?.weapons ?? []),
          ]),
        ],
        tools: [
          ...new Set([
            ...character.proficiencies.tools,
            ...(classEntity?.startingProficiencies?.tools ?? []),
          ]),
        ],
      },
      spells: {
        ...character.spells,
        spellcastingAbility: classEntity?.spellcastingAbility
          ? (normalizeAbilityName(classEntity.spellcastingAbility) ??
            classEntity.spellcastingAbility.toLowerCase())
          : character.spells?.spellcastingAbility,
      },
    },
  };
}

interface BuildSubclassSelectionPatchParams {
  character: Character;
  classProgression: CharacterClassEntry[];
  viewingEntry?: CharacterClassEntry;
  subclassName: string;
  subclassSource?: string;
}

export function buildSubclassSelectionPatch({
  character,
  classProgression,
  viewingEntry,
  subclassName,
  subclassSource,
}: BuildSubclassSelectionPatchParams): Record<string, unknown> {
  if (classProgression.length > 0 && viewingEntry) {
    const nextClassProgression = classProgression.map((entry) =>
      entry.name === viewingEntry.name &&
      (entry.source ?? '') === (viewingEntry.source ?? '')
        ? {
            ...entry,
            subclass: subclassName,
            subclassSource: subclassSource ?? undefined,
          }
        : entry,
    );

    const updates: Record<string, unknown> = {
      classProgression: nextClassProgression,
    };

    if (viewingEntry.name === character.class) {
      updates.subclass = subclassName;
      updates.subclassSource = subclassSource ?? undefined;
    }

    return updates;
  }

  return {
    subclass: subclassName,
    subclassSource: subclassSource ?? undefined,
  };
}
