import type {
  CharacterSheetEdition,
  CharacterSheetTemplate,
  CharacterSheetTemplateId,
  ResolvedCharacterSheetTemplateId,
} from './types'

export const CHARACTER_SHEET_TEMPLATES = [
  {
    id: '2014-official',
    edition: '2014',
    variant: 'official',
    editionLabel: '5e (2014)',
    name: 'Wizards of the Coast Official Character Sheet (5e 2014)',
    fileName: '2014_Official_Character_Sheet.pdf',
    assetPath: 'pdf/2014_Official_Character_Sheet.pdf',
    routePath: '/character-sheet/2014/official',
    mappingId: '2014-official',
    cleanupProfile: 'standard',
    portraitFieldName: 'CHARACTER IMAGE',
    organizationImageFieldName: 'Faction Symbol Image',
    attribution: {
      credit: 'Official Dungeons & Dragons 5th Edition character sheet by Wizards of the Coast.',
    },
  },
  {
    id: '2014-custom',
    edition: '2014',
    variant: 'custom',
    editionLabel: '5e (2014)',
    name: "MorePurpleMoreBetter's D&D 5th Edition Character Record Sheet (5e 2014)",
    fileName: '2014_MPMB_Character_Sheet.pdf',
    assetPath: 'pdf/2014_MPMB_Character_Sheet.pdf',
    routePath: '/character-sheet/2014/custom',
    mappingId: '2014-custom',
    cleanupProfile: 'mpmb-2014',
    portraitFieldName: 'Portrait',
    organizationImageFieldName: 'Symbol',
    attribution: {
      credit: 'D&D 5th Edition Character Record Sheet by',
      creatorName: 'MorePurpleMoreBetter (Joost Wijnen)',
      creatorUrl: 'https://www.flapkan.com/',
    },
  },
  {
    id: '2024-official',
    edition: '2024',
    variant: 'official',
    editionLabel: '5.5e (2024)',
    name: 'Wizards of the Coast Official Character Sheet (5.5e 2024)',
    fileName: '2024_Official_Character_Sheet.pdf',
    assetPath: 'pdf/2024_Official_Character_Sheet.pdf',
    routePath: '/character-sheet/2024/official',
    mappingId: '2024-shared',
    cleanupProfile: 'standard',
    attribution: {
      credit: 'Official 2024 Dungeons & Dragons character sheet by Wizards of the Coast.',
      notice: 'The source document credits its illustrations to Richard Whitters.',
    },
  },
  {
    id: '2024-custom',
    edition: '2024',
    variant: 'custom',
    editionLabel: '5.5e (2024)',
    name: "Lost Loot's D&D 5.5e Character Sheet (5.5e 2024)",
    fileName: '2024_Beaoudix_Character_Sheet.pdf',
    assetPath: 'pdf/2024_Beaoudix_Character_Sheet.pdf',
    routePath: '/character-sheet/2024/custom',
    mappingId: '2024-shared',
    cleanupProfile: 'standard',
    attribution: {
      credit: 'Free D&D 5E24 character-sheet replica created by',
      creatorName: 'Lost Loot (u/Beaoudix)',
      creatorUrl: 'https://www.reddit.com/r/DnD/comments/1e5apxk/dd_5e24_new_character_sheets/',
    },
  },
] as const satisfies readonly CharacterSheetTemplate[]

const TEMPLATE_BY_ID = Object.fromEntries(
  CHARACTER_SHEET_TEMPLATES.map((template) => [template.id, template]),
) as Record<ResolvedCharacterSheetTemplateId, CharacterSheetTemplate>

function resolveCharacterSheetTemplateId(
  templateId: CharacterSheetTemplateId,
): ResolvedCharacterSheetTemplateId {
  if (templateId === '2014' || templateId === '2024') return `${templateId}-custom`
  return templateId
}

export function getCharacterSheetTemplate(
  templateId: CharacterSheetTemplateId,
): CharacterSheetTemplate {
  return TEMPLATE_BY_ID[resolveCharacterSheetTemplateId(templateId)]
}

export function getDefaultCharacterSheetTemplateId(
  edition: CharacterSheetEdition = '2024',
): ResolvedCharacterSheetTemplateId {
  return `${edition}-custom`
}

export function getCharacterSheetAttributionAnchor(templateId: CharacterSheetTemplateId): string {
  return `character-sheet-pdf-${resolveCharacterSheetTemplateId(templateId)}`
}
