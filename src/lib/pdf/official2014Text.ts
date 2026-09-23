import type { CharacterSheetViewModel } from './characterSheetViewModel'

/** Limits for the printed 2014 official form's free-text sections. */
export const OFFICIAL_2014_SECTION_LIMITS = {
  Equipment: 260,
  'Features and Traits': 650,
  'Feat+Traits': 700,
  Treasure: 400,
} as const

export type Official2014SectionName = keyof typeof OFFICIAL_2014_SECTION_LIMITS

type FontBounds = { min: number; max: number }

const SECTION_FONT_BOUNDS: Record<Official2014SectionName, FontBounds> = {
  Equipment: { min: 7.5, max: 9 },
  'Features and Traits': { min: 8, max: 10 },
  'Feat+Traits': { min: 8, max: 10 },
  Treasure: { min: 9, max: 11 },
}

const OTHER_FONT_BOUNDS: Record<string, FontBounds> = {
  Speed: { min: 9, max: 18 },
  ClassLevel: { min: 7.5, max: 10 },
  HPMax: { min: 9, max: 9 },
  HDTotal: { min: 7, max: 8 },
  Allies: { min: 8, max: 11 },
  Backstory: { min: 8, max: 10 },
  ProficienciesLang: { min: 8, max: 10 },
  AttacksSpellcasting: { min: 8, max: 10 },
  'PersonalityTraits ': { min: 8, max: 12 },
  Ideals: { min: 8, max: 12 },
  Bonds: { min: 8, max: 12 },
  Flaws: { min: 8, max: 12 },
}

export function getOfficial2014FontBounds(
  fieldName: string,
  widgetWidth: number,
  widgetHeight: number,
): FontBounds | null {
  if (fieldName in SECTION_FONT_BOUNDS) {
    return SECTION_FONT_BOUNDS[fieldName as Official2014SectionName]
  }
  if (fieldName in OTHER_FONT_BOUNDS) return OTHER_FONT_BOUNDS[fieldName]
  if (fieldName.startsWith('Spells ')) return { min: 7.5, max: 8.5 }
  // The save and skill modifier cells share this narrow geometry.
  if (widgetWidth <= 15 && widgetHeight < 10) return { min: 7, max: 7 }
  if (fieldName.startsWith('Wpn')) return { min: 8, max: 10 }
  return null
}

export function getOfficial2014SectionText(
  viewModel: CharacterSheetViewModel,
): Record<Official2014SectionName, string> {
  return {
    Equipment: viewModel.equipmentSummary,
    'Features and Traits': viewModel.featuresSummary,
    // Keep player-selected feats visible when ancestry prose exceeds this fixed box.
    'Feat+Traits': [viewModel.featsSummary, viewModel.racialTraitsSummary]
      .filter(Boolean)
      .join('\n\n'),
    Treasure: viewModel.magicItems.map((item) => item.name).join(', '),
  }
}

export function limitOfficial2014SectionText(name: Official2014SectionName, text: string): string {
  const limit = OFFICIAL_2014_SECTION_LIMITS[name]
  if (text.length <= limit) return text

  const prefix = text.slice(0, limit - 3)
  const lastEntryBoundary = prefix.lastIndexOf('\n')
  const lastWordBoundary = prefix.lastIndexOf(' ')
  const boundary =
    name === 'Equipment' && lastEntryBoundary >= limit * 0.7
      ? lastEntryBoundary
      : lastWordBoundary >= limit * 0.7
        ? lastWordBoundary
        : prefix.length

  return `${prefix.slice(0, boundary).trimEnd()}...`
}
