import {
  type CharacterSheetPageOptions,
  DEFAULT_SHEET_TEXT_OPTIONS,
  type SheetContentChoices,
  type SheetTextOptions,
} from '@/lib/pdf/types'

const KEY = 'tb:sheet-export-preferences:v1'
export interface SheetExportPreferences {
  pages: CharacterSheetPageOptions
  content: SheetContentChoices
  text?: SheetTextOptions
}

export function readSheetExportPreferences(): Record<string, SheetExportPreferences> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([context, value]) => {
        if (!value || typeof value !== 'object') return []
        const pages = Object.fromEntries(
          Object.entries(value.pages ?? {}).filter(
            ([key, enabled]) =>
              ['spells', 'companion', 'notes'].includes(key) && typeof enabled === 'boolean',
          ),
        )
        const content = Object.fromEntries(
          Object.entries(value.content ?? {}).filter(
            ([, ids]) => Array.isArray(ids) && ids.every((id) => typeof id === 'string'),
          ),
        ) as SheetContentChoices
        const text: SheetTextOptions = {
          descriptions: value.text?.descriptions === 'names' ? 'names' : 'full',
          overflow:
            value.text?.overflow === 'notes' ? 'notes' : DEFAULT_SHEET_TEXT_OPTIONS.overflow,
        }
        return [[context, { pages, content, text }]]
      }),
    )
  } catch {
    return {}
  }
}

export function writeSheetExportPreferences(preferences: Record<string, SheetExportPreferences>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(preferences))
  } catch {
    /* Export still works when storage is unavailable. */
  }
}
