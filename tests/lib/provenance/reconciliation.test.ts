import { describe, expect, test } from 'vitest';
import { addGrant, emptyProvenance } from '@/lib/provenance/ledger';
import {
  diffProficiencyGrants,
  reconcileBackgroundChange,
  reconcileClassChange,
  reconcileRaceChange,
  reconcileSubraceChange,
} from '@/lib/provenance/reconciliation';
import type { SourceTag } from '@/lib/provenance/types';

const raceTag: SourceTag = {
  sourceType: 'race',
  sourceName: 'Elf',
  grantType: 'fixed',
  label: 'Elf',
};

const subraceTag: SourceTag = {
  sourceType: 'subrace',
  sourceName: 'High Elf',
  grantType: 'fixed',
  label: 'High Elf',
};

const classTag: SourceTag = {
  sourceType: 'class',
  sourceName: 'Wizard',
  grantType: 'fixed',
  label: 'Wizard',
};

const subclassTag: SourceTag = {
  sourceType: 'subclass',
  sourceName: 'Evocation',
  grantType: 'fixed',
  label: 'Evocation',
};

const backgroundTag: SourceTag = {
  sourceType: 'background',
  sourceName: 'Acolyte',
  grantType: 'fixed',
  label: 'Acolyte',
};

describe('provenance/reconciliation', () => {
  test('reconcileRaceChange removes old race and old subrace grants', () => {
    let ledger = emptyProvenance();
    ledger = addGrant(ledger, 'languages', 'Common', raceTag);
    ledger = addGrant(ledger, 'spells', 'Fire Bolt', subraceTag);

    const reconciled = reconcileRaceChange(ledger, 'Elf', 'High Elf');

    expect(reconciled.proficiencies.languages.common).toBeUndefined();
    expect(reconciled.spells['fire bolt']).toBeUndefined();
  });

  test('reconcileSubraceChange removes only subrace grants', () => {
    let ledger = emptyProvenance();
    ledger = addGrant(ledger, 'languages', 'Common', raceTag);
    ledger = addGrant(ledger, 'spells', 'Fire Bolt', subraceTag);

    const reconciled = reconcileSubraceChange(ledger, 'High Elf');

    expect(reconciled.proficiencies.languages.common).toEqual([raceTag]);
    expect(reconciled.spells['fire bolt']).toBeUndefined();
  });

  test('reconcileClassChange removes old class and subclass grants', () => {
    let ledger = emptyProvenance();
    ledger = addGrant(ledger, 'savingThrows', 'intelligence', classTag);
    ledger = addGrant(ledger, 'features', 'sculpt spells', subclassTag);

    const reconciled = reconcileClassChange(ledger, 'Wizard', 'Evocation');

    expect(reconciled.proficiencies.savingThrows.intelligence).toBeUndefined();
    expect(reconciled.features['sculpt spells']).toBeUndefined();
  });

  test('reconcileBackgroundChange removes old background grants', () => {
    let ledger = emptyProvenance();
    ledger = addGrant(ledger, 'skills', 'Insight', backgroundTag);

    const reconciled = reconcileBackgroundChange(ledger, 'Acolyte');

    expect(reconciled.proficiencies.skills.insight).toBeUndefined();
  });

  test('diffProficiencyGrants returns only keys exclusively owned by source', () => {
    let ledger = emptyProvenance();
    ledger = addGrant(ledger, 'skills', 'Arcana', classTag);
    ledger = addGrant(ledger, 'skills', 'History', classTag);
    ledger = addGrant(ledger, 'skills', 'History', raceTag);

    const diff = diffProficiencyGrants(ledger, 'skills', 'class', 'Wizard');

    expect(diff.toRemove).toEqual(['arcana']);
  });
});
