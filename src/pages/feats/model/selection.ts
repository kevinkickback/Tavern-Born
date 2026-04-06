import type { Feat5e } from '@/types/5etools';

interface SavedFeatLike {
  name: string;
  source?: string;
}

interface BuildFeatModalFeatsParams {
  availableFeats: Feat5e[];
  selectedFeats: SavedFeatLike[];
  selectedSpecialFeats: SavedFeatLike[];
}

export function buildFeatModalFeats({
  availableFeats,
  selectedFeats,
  selectedSpecialFeats,
}: BuildFeatModalFeatsParams): Feat5e[] {
  const availableIds = new Set(
    availableFeats.map((feat) => `${feat.name}|${feat.source ?? ''}`),
  );

  const savedNotInList = [...selectedFeats, ...selectedSpecialFeats]
    .filter((feat) => !availableIds.has(`${feat.name}|${feat.source ?? ''}`))
    .map(
      (feat) =>
        ({
          name: feat.name,
          source: feat.source ?? '',
          entries: [],
        }) as Feat5e,
    );

  return [...availableFeats, ...savedNotInList];
}

interface PartitionSelectedFeatsParams {
  selectedFeats: Feat5e[];
  existingNormalFeats: SavedFeatLike[];
  existingSpecialFeats: SavedFeatLike[];
  totalNormalSlots: number;
}

export function partitionSelectedFeats({
  selectedFeats,
  existingNormalFeats,
  existingSpecialFeats,
  totalNormalSlots,
}: PartitionSelectedFeatsParams): {
  normalFeats: Feat5e[];
  specialFeats: Feat5e[];
} {
  const existingSpecialKeys = new Set(
    existingSpecialFeats.map((feat) => `${feat.name}|${feat.source ?? ''}`),
  );
  const existingNormalKeys = new Set(
    existingNormalFeats.map((feat) => `${feat.name}|${feat.source ?? ''}`),
  );

  const keptSpecial: Feat5e[] = [];
  const remaining: Feat5e[] = [];

  for (const feat of selectedFeats) {
    const key = `${feat.name}|${feat.source ?? ''}`;
    if (existingSpecialKeys.has(key)) {
      keptSpecial.push(feat);
    } else {
      remaining.push(feat);
    }
  }

  const previouslyNormal = remaining.filter((feat) =>
    existingNormalKeys.has(`${feat.name}|${feat.source ?? ''}`),
  );
  const brandNew = remaining.filter(
    (feat) => !existingNormalKeys.has(`${feat.name}|${feat.source ?? ''}`),
  );
  const fillOrder = [...previouslyNormal, ...brandNew];

  return {
    normalFeats: fillOrder.slice(0, totalNormalSlots),
    specialFeats: [...keptSpecial, ...fillOrder.slice(totalNormalSlots)],
  };
}
