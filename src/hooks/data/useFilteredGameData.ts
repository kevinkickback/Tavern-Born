import { useMemo } from 'react';
import { DataFilter } from '@/lib/5etools/filters';
import { useCharacterStore } from '@/store/characterStore';
import { useGameDataStore } from '@/store/gameDataStore';

export function useFilteredGameData() {
  const gameData = useGameDataStore((state) => state.gameData);
  const activeCharacter = useCharacterStore((state) => state.activeCharacter);

  const filteredData = useMemo(() => {
    if (!gameData) {
      return {
        races: [],
        classes: [],
        backgrounds: [],
        spells: [],
        feats: [],
        items: [],
        itemsBase: [],
        classFeatures: [],
        optionalfeatures: [],
        sources: [],
      };
    }

    const allowedSources = activeCharacter?.allowedSources;
    const firearmsAllowed =
      activeCharacter?.variantRules?.firearmsAllowed ?? false;

    const filterFirearms = <T extends { firearm?: boolean }>(items: T[]) =>
      firearmsAllowed ? items : items.filter((i) => !i.firearm);

    if (!allowedSources || allowedSources.length === 0) {
      return {
        ...gameData,
        items: filterFirearms(gameData.items),
        itemsBase: filterFirearms(gameData.itemsBase ?? []),
      };
    }

    return {
      races: DataFilter.filterRaces(gameData.races, {
        sources: allowedSources,
      }),
      classes: DataFilter.filterClasses(gameData.classes, {
        sources: allowedSources,
      }),
      backgrounds: DataFilter.filterBackgrounds(gameData.backgrounds, {
        sources: allowedSources,
      }),
      spells: DataFilter.filterSpells(gameData.spells, {
        sources: allowedSources,
      }),
      feats: DataFilter.filterFeats(gameData.feats, {
        sources: allowedSources,
      }),
      items: filterFirearms(
        DataFilter.filterItems(gameData.items, { sources: allowedSources }),
      ),
      itemsBase: filterFirearms(
        DataFilter.filterItems(gameData.itemsBase ?? [], {
          sources: allowedSources,
        }),
      ),
      classFeatures: gameData.classFeatures.filter((cf) =>
        allowedSources.includes(cf.source),
      ),
      optionalfeatures: (gameData.optionalfeatures ?? []).filter(
        (of: unknown) =>
          allowedSources.includes((of as { source?: string }).source ?? ''),
      ),
      sources: gameData.sources,
    };
  }, [
    gameData,
    activeCharacter?.allowedSources,
    activeCharacter?.variantRules?.firearmsAllowed,
  ]);

  return filteredData;
}
