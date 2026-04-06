import { describe, expect, test } from 'vitest';
import {
  buildFeatModalFeats,
  partitionSelectedFeats,
} from '@/pages/feats/model/selection';

describe('feat selection model', () => {
  test('buildFeatModalFeats appends saved feats missing from the available list', () => {
    const result = buildFeatModalFeats({
      availableFeats: [
        { name: 'Alert', source: 'PHB', entries: [] },
        { name: 'Athlete', source: 'PHB', entries: [] },
      ],
      selectedFeats: [{ name: 'Alert', source: 'PHB' }],
      selectedSpecialFeats: [{ name: 'Chef', source: 'TCE' }],
    });

    expect(result.map((feat) => `${feat.name}|${feat.source}`)).toEqual([
      'Alert|PHB',
      'Athlete|PHB',
      'Chef|TCE',
    ]);
  });

  test('partitionSelectedFeats preserves existing special feats and fills normal slots first', () => {
    const result = partitionSelectedFeats({
      selectedFeats: [
        { name: 'Chef', source: 'TCE', entries: [] },
        { name: 'Alert', source: 'PHB', entries: [] },
        { name: 'Skilled', source: 'PHB', entries: [] },
      ],
      existingNormalFeats: [{ name: 'Alert', source: 'PHB' }],
      existingSpecialFeats: [{ name: 'Chef', source: 'TCE' }],
      totalNormalSlots: 1,
    });

    expect(result.normalFeats.map((feat) => feat.name)).toEqual(['Alert']);
    expect(result.specialFeats.map((feat) => feat.name)).toEqual([
      'Chef',
      'Skilled',
    ]);
  });
});
