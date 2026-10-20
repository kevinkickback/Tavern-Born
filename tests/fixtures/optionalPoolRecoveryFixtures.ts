import { getSelectedSubclassData } from '@/lib/5etools/classData'
import { findClassReference } from '@/lib/5etools/classReference'
import { getClassChoiceCandidates } from '@/lib/character/classChoiceOptions'
import { applyClassChoiceSelectionWithGrantsCommand } from '@/lib/character/commands/classChoiceCommands'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from './characterFixtures'
import { makeOptionalDeclarationCatalog } from './optionalClassDeclarationFixtures'
import { makeOptionalClassSectionData } from './optionalClassSectionFixtures'

export const optionalPoolRecoveryCases = [
  [
    'Sorcerer',
    'PHB',
    3,
    undefined,
    'Metamagic',
    'Seeking Spell',
    'class-feature|metamagic options|sorcerer|phb|3|tce',
  ],
  [
    'Fighter',
    'PHB',
    3,
    'Battle Master',
    'Maneuvers',
    'Brace',
    'subclass-feature|maneuver options|fighter|phb|battle master|phb|3|tce',
  ],
  [
    'Fighter',
    'XPHB',
    3,
    'Battle Master',
    'Maneuvers',
    'Brace',
    'subclass-feature|maneuver options|fighter|phb|battle master|phb|3|tce',
  ],
  ['Fighter', 'PHB', 1, undefined, 'Fighting Style', 'Interception', 'book-section|tce|0dc'],
  ['Paladin', 'PHB', 2, undefined, 'Fighting Style', 'Blind Fighting', 'book-section|tce|131'],
  ['Ranger', 'PHB', 2, undefined, 'Fighting Style', 'Blind Fighting', 'book-section|tce|159'],
  ['Warlock', 'PHB', 3, undefined, 'Pact Boon', 'Pact of the Talisman', 'book-section|tce|1a1'],
  ['Warlock', 'PHB', 2, undefined, 'Eldritch Invocations', 'Eldritch Mind', 'book-section|tce|1a4'],
] as const
export function makeOptionalPoolRecoveryFixture(
  row: readonly [string, string, number, string | undefined, string, string, string],
) {
  const [name, source, level, subclass, label, member, target] = row
  const owner = subclass
    ? ([
        'subclass',
        name.toLowerCase(),
        source.toLowerCase(),
        subclass.toLowerCase(),
        'phb',
      ] as const)
    : (['class', name.toLowerCase(), source.toLowerCase()] as const)
  const { data, catalogs } = target.startsWith('book-section|')
    ? makeOptionalClassSectionData()
    : makeOptionalDeclarationCatalog(`class/class-${name.toLowerCase()}.json`, [...owner])
  const character = makeCharacterFixture({
    originSystem: source === 'XPHB' ? '2024' : '2014',
    allowedSources: ['PHB', 'XPHB', 'TCE'],
    classProgression: [
      { name, source, levels: level, ...(subclass ? { subclass, subclassSource: 'PHB' } : {}) },
    ],
    variantRules: { optionalClassFeatures: true },
    optionalClassFeatureAdoptions: [{ owner: [...owner], target, earnedLevel: level }],
  })
  const cls = findClassReference(character.classProgression[0], data.classes)!
  const choice = getClassChoiceCandidates(
    cls,
    getSelectedSubclassData(cls, character.classProgression[0]),
    catalogs,
  ).find((choice) => choice.label === label && choice.level === level)!
  const result = applyClassChoiceSelectionWithGrantsCommand(
    character,
    character.provenance,
    choice,
    [{ entityType: 'optionalFeature', name: member, source: 'TCE' }],
    { classes: data.classes, catalogs },
  )
  const saved = characterPersistenceSchema.parse({
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  })
  return {
    data,
    catalogs,
    character: saved,
    choice,
    selection: saved.classChoiceSelections!.find((selection) => selection.choiceId === choice.id)!,
  }
}
