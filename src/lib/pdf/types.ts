export type CharacterSheetEdition = '2014' | '2024'
type CharacterSheetVariant = 'official' | 'custom'

export type ResolvedCharacterSheetTemplateId = `${CharacterSheetEdition}-${CharacterSheetVariant}`

/**
 * The edition-only values remain accepted as compatibility aliases while callers and saved links
 * migrate to explicit edition-and-variant IDs. They always resolve to the custom template that the
 * old route represented.
 */
export type CharacterSheetTemplateId = ResolvedCharacterSheetTemplateId | CharacterSheetEdition

type CharacterSheetMappingId = ResolvedCharacterSheetTemplateId
export type CharacterSheetCleanupProfile = 'standard' | 'mpmb-2014'

type OptionalCharacterSheetPageId = 'spells' | 'companion' | 'notes'
export type CharacterSheetPageOptions = Partial<Record<OptionalCharacterSheetPageId, boolean>>

export type SheetContentChoices = Partial<Record<string, string[]>>
export interface SheetTextOptions {
  descriptions?: 'full' | 'names'
  overflow?: 'notes' | 'ellipsis'
}
export const DEFAULT_SHEET_TEXT_OPTIONS = {
  descriptions: 'full',
  overflow: 'ellipsis',
} as const satisfies Required<SheetTextOptions>
export interface SheetOverflowSection {
  id: string
  title: string
  text: string
  groupId?: string
}
export interface SheetExportReport {
  notesPageCount: number
  preserved: SheetOverflowSection[]
  omitted: SheetOverflowSection[]
}

interface CharacterSheetAttribution {
  credit: string
  creatorName?: string
  creatorUrl?: string
  notice?: string
}

export interface CharacterSheetTemplate {
  id: ResolvedCharacterSheetTemplateId
  edition: CharacterSheetEdition
  variant: CharacterSheetVariant
  editionLabel: string
  name: string
  assetPath: string
  routePath: string
  mappingId: CharacterSheetMappingId
  cleanupProfile: CharacterSheetCleanupProfile
  portraitFieldName?: string
  organizationImageFieldName?: string
  optionalPages?: readonly {
    id: OptionalCharacterSheetPageId
    label: string
  }[]
  attribution: CharacterSheetAttribution
}

export interface CharacterSheetFieldMap {
  textFields: Record<string, string>
  checkboxFields: Record<string, boolean>
}
