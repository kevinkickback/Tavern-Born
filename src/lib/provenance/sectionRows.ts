import type { SourceRow, SourceType } from '@/lib/provenance/types';

interface ProficiencyRows {
  skills: SourceRow[];
  savingThrows: SourceRow[];
  armor: SourceRow[];
  weapons: SourceRow[];
  tools: SourceRow[];
  languages: SourceRow[];
  pendingChoices: SourceRow[];
}

interface SectionRowsInput {
  sectionId: string;
  proficiencyRows: ProficiencyRows;
  abilityBonusRows: SourceRow[];
  featRows: SourceRow[];
  featureRows: SourceRow[];
  spellRows: SourceRow[];
  equipmentRows: SourceRow[];
}

function excludeSources(rows: SourceRow[], blocked: SourceType[]): SourceRow[] {
  return rows.filter(
    (row) => !row.sourceTypes.some((t) => blocked.includes(t)),
  );
}

export function getSourcesRowsBySectionId({
  sectionId,
  proficiencyRows,
  abilityBonusRows,
  featRows,
  featureRows,
  spellRows,
  equipmentRows,
}: SectionRowsInput): SourceRow[] {
  switch (sectionId) {
    case 'build-proficiencies':
    case 'proficiencies':
      return excludeSources(
        [
          ...proficiencyRows.skills,
          ...proficiencyRows.savingThrows,
          ...proficiencyRows.armor,
          ...proficiencyRows.weapons,
          ...proficiencyRows.tools,
          ...proficiencyRows.languages,
          ...proficiencyRows.pendingChoices,
        ],
        ['manual'],
      );
    case 'build-race':
      return excludeSources(
        [
          ...abilityBonusRows,
          ...proficiencyRows.skills,
          ...proficiencyRows.languages,
          ...proficiencyRows.pendingChoices,
        ],
        ['race', 'subrace'],
      );
    case 'build-background':
      return excludeSources(
        [
          ...proficiencyRows.skills,
          ...proficiencyRows.languages,
          ...proficiencyRows.tools,
          ...proficiencyRows.pendingChoices,
        ],
        ['background'],
      );
    case 'build-class':
      return excludeSources(
        [
          ...proficiencyRows.skills,
          ...proficiencyRows.savingThrows,
          ...proficiencyRows.armor,
          ...proficiencyRows.weapons,
          ...proficiencyRows.tools,
          ...featureRows,
          ...spellRows,
          ...proficiencyRows.pendingChoices,
        ],
        ['class', 'subclass'],
      );
    case 'build-ability-scores':
    case 'ability-scores':
      return excludeSources(abilityBonusRows, ['manual']);
    case 'feats':
      return excludeSources(featRows, ['feat']);
    case 'features':
      return excludeSources(featureRows, ['optionalFeature']);
    case 'spells':
      return excludeSources(spellRows, ['manual']);
    case 'equipment':
      return excludeSources(equipmentRows, ['manual']);
    default:
      return [];
  }
}
