export type CharacterSheetEdition = '2014' | '2024'
type CharacterSheetVariant = 'official' | 'custom'

export type ResolvedCharacterSheetTemplateId = `${CharacterSheetEdition}-${CharacterSheetVariant}`

/**
 * The edition-only values remain accepted as compatibility aliases while callers and saved links
 * migrate to explicit edition-and-variant IDs. They always resolve to the custom template that the
 * old route represented.
 */
export type CharacterSheetTemplateId = ResolvedCharacterSheetTemplateId | CharacterSheetEdition

type CharacterSheetMappingId = '2014-custom' | '2014-official' | '2024-shared'
export type CharacterSheetCleanupProfile = 'standard' | 'mpmb-2014'

export type OptionalCharacterSheetPageId = 'spells' | 'companion' | 'notes'
export type CharacterSheetPageOptions = Partial<Record<OptionalCharacterSheetPageId, boolean>>

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
