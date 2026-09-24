import type { PDFFont } from '@cantoo/pdf-lib'
import { fitPdfText } from './pdfTextLayout'

export type Official2024FontBounds = { min: number; max: number; multiline?: boolean }

/** Conservative thresholds for warning before visually abbreviated prose is exported. */
export const OFFICIAL_2024_PROSE_WARNING_LIMITS = {
  Text_55: { label: 'Weapon training', maxChars: 200 },
  Text_56: { label: 'Tool training', maxChars: 130 },
  Text_57: { label: 'Class features (left)', maxChars: 850 },
  Text_58: { label: 'Class features (right)', maxChars: 850 },
  Text_59: { label: 'Species traits', maxChars: 700 },
  Text_60: { label: 'Feats', maxChars: 700 },
  Text_88: { label: 'Appearance', maxChars: 220 },
  Text_89: { label: 'Backstory', maxChars: 600 },
  Text_90: { label: 'Equipment', maxChars: 350, maxLines: 18 },
  Text_91: { label: 'Languages', maxChars: 120 },
} as const

/** The official 2024 artwork has much larger printed cells than the overlaid form's defaults. */
export function getOfficial2024FontBounds(name: string): Official2024FontBounds | null {
  if (/^SpellRange_\d+$/.test(name)) return { min: 7, max: 8.5, multiline: true }
  const id = Number(/^Text_(\d+)$/.exec(name)?.[1])
  if (!Number.isInteger(id) || id < 1 || id > 230) return null
  if (id === 1) return { min: 8.5, max: 9.5 }
  if (id <= 3) return { min: 8, max: 8.5 }
  if (id <= 5) return { min: 7.5, max: 9 }
  if (id === 7) return { min: 6.5, max: 8.5 } // Six-digit XP in a narrow oval.
  if (id === 8) return { min: 10.5, max: 11.5 } // Armor Class shield.
  if (id === 9) return { min: 9.5, max: 10.5 } // Current Hit Points.
  if (id <= 13) return { min: 8.5, max: 9.5 }
  if (id <= 30) return { min: 9.5, max: 11.5 }
  if (id <= 54) return { min: 7.5, max: 8.5 }
  if (id <= 60) return { min: 7.5, max: 9, multiline: true }
  if (id <= 84) return { min: 7.5, max: 9 }
  if (id <= 87) return { min: 10, max: 12 }
  if (id <= 90) return { min: 7.5, max: 9, multiline: true }
  if (id === 91) return { min: 8, max: 9, multiline: true }
  if (id <= 211) return { min: 7, max: 8.5, multiline: id >= 122 }
  if (id <= 214) return { min: 8, max: 9.5 }
  if (id <= 219) return { min: 8.5, max: 10 }
  if (id <= 228) return { min: 8, max: 9.5 }
  return { min: 8, max: 10 }
}

/** Fit each AcroForm appearance to its printed cell, retaining a readable floor. */
export function fitOfficial2024Text(
  name: string,
  value: string,
  font: PDFFont,
  width: number,
  height: number,
  borderWidth = 0,
  scale = 1,
): { text: string; fontSize: number; truncated: boolean } | null {
  const bounds = getOfficial2024FontBounds(name)
  if (!bounds || !value) return null
  const id = Number(name.slice(5))
  // These are lists, not paragraphs; spare blank lines otherwise hide later entries.
  const normalized = [57, 58, 59, 60, 88, 89, 90].includes(id)
    ? value.replace(/\n{2,}/g, '\n')
    : value

  const fitted = fitPdfText(
    normalized,
    font,
    width / scale,
    height / scale,
    bounds,
    borderWidth / scale,
  )
  return { ...fitted, fontSize: fitted.fontSize * scale }
}

/** Human-readable labels for every field in the two 2024 forms. */
export function get2024FieldLabel(name: string, official: boolean): string {
  const range = /^SpellRange_(\d+)$/.exec(name)
  if (range) return `Spell ${range[1]} range`
  const id = Number(/^Text_(\d+)$/.exec(name)?.[1])
  const labels = [
    'Character name',
    'Background',
    'Species',
    'Class',
    'Subclass',
    'Level',
    'Experience points',
    'Armor Class',
    'Current hit points',
    'Temporary hit points',
    'Maximum hit points',
    'Spent Hit Dice',
    'Maximum Hit Dice',
    'Proficiency bonus',
    'Intelligence modifier',
    'Initiative',
    'Speed',
    'Size',
    'Passive Perception',
    'Wisdom modifier',
    'Charisma modifier',
    'Strength modifier',
    'Dexterity modifier',
    'Constitution modifier',
    'Strength score',
    'Dexterity score',
    'Constitution score',
    'Wisdom score',
    'Charisma score',
    'Intelligence score',
    'Intelligence saving throw',
    'Arcana',
    'History',
    'Investigation',
    'Nature',
    'Religion',
    'Animal Handling',
    'Insight',
    'Medicine',
    'Perception',
    'Survival',
    'Charisma saving throw',
    'Deception',
    'Intimidation',
    'Performance',
    'Persuasion',
    'Wisdom saving throw',
    'Acrobatics',
    'Sleight of Hand',
    'Stealth',
    'Dexterity saving throw',
    'Constitution saving throw',
    'Athletics',
    'Strength saving throw',
  ]
  if (id <= labels.length && id > 0) return labels[id - 1]
  const prose =
    OFFICIAL_2024_PROSE_WARNING_LIMITS[name as keyof typeof OFFICIAL_2024_PROSE_WARNING_LIMITS]
  if (prose) return prose.label
  for (const [start, end, label] of [
    [61, 66, 'Weapon name'],
    [67, 72, 'Weapon attack bonus'],
    [73, 78, 'Weapon damage'],
    [79, 84, 'Weapon notes'],
    [92, 121, 'Spell level'],
    [122, 151, 'Spell name'],
    [152, 181, official ? 'Spell casting time' : 'Spell casting time and duration'],
    [182, 211, 'Spell notes'],
    [212, 214, 'Attuned item'],
    [220, 228, 'Spell slot total'],
  ] as const) {
    if (id >= start && id <= end) return `${label} (row ${id - start + 1})`
  }
  return (
    (
      {
        85: 'Spellcasting modifier',
        86: 'Spell save DC',
        87: 'Spell attack bonus',
        215: 'Copper pieces',
        216: 'Silver pieces',
        217: 'Electrum pieces',
        218: 'Gold pieces',
        219: 'Platinum pieces',
        229: 'Alignment',
        230: 'Spellcasting ability',
      } as Record<number, string>
    )[id] ?? name
  )
}
