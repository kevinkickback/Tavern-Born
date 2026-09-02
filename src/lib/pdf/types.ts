export type CharacterSheetTemplateId = '2014' | '2024'

export interface CharacterSheetFieldMap {
  textFields: Record<string, string>
  checkboxFields: Record<string, boolean>
}
