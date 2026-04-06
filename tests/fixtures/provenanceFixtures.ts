import type { ProvenanceLedger, SourceTag } from '@/lib/provenance/types';

export const raceSourceTagFixture: SourceTag = {
  sourceType: 'race',
  sourceName: 'Elf',
  sourceRef: 'PHB',
  grantType: 'fixed',
  label: 'Elf',
};

export const classSourceTagFixture: SourceTag = {
  sourceType: 'class',
  sourceName: 'Wizard',
  sourceRef: 'PHB',
  grantType: 'fixed',
  label: 'Wizard',
};

export function makeProvenanceLedgerFixture(): ProvenanceLedger {
  return {
    proficiencies: {
      armor: {},
      weapons: {},
      tools: {},
      languages: {},
      skills: {},
      savingThrows: {},
    },
    abilityBonuses: [],
    features: {},
    feats: {},
    spells: {},
    equipment: {},
    choices: [],
  };
}
