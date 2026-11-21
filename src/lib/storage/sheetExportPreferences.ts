import {
  type CharacterSheetPageOptions,
  DEFAULT_SHEET_PRESENTATION_OPTIONS,
  type SheetContentChoices,
  type SheetPresentationOptions,
} from '@/lib/pdf/types'

const KEY = 'tb:sheet-export-preferences:v1'
export interface SheetExportPreferences {
  pages: CharacterSheetPageOptions
  content: SheetContentChoices
  text?: SheetPresentationOptions
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
        const text: SheetPresentationOptions = {
          descriptions: value.text?.descriptions === 'names' ? 'names' : 'full',
          overflow:
            value.text?.overflow === 'notes'
              ? 'notes'
              : DEFAULT_SHEET_PRESENTATION_OPTIONS.overflow,
          images:
            value.text?.images === 'grayscale' || value.text?.images === 'none'
              ? value.text.images
              : 'color',
          spellLayout: value.text?.spellLayout === 'combined' ? 'combined' : 'standard',
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
