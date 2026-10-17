import type { Item5e, ItemEntry5e } from '@/types/5etools'

export const itemTextTypes = [
  'LA',
  'MA',
  'HA',
  'S',
  'M',
  'R',
  'A',
  'G',
  'AT',
  'GS',
  'INS',
  'T',
  'P',
  'SC',
  'WD',
  'RD',
  'RG',
].map((abbreviation) => ({ abbreviation, name: abbreviation }))

/** Literal source-declared itemEntry producer forms, independent of the adapter. */
export const firePotion: Item5e = {
  name: 'Potion of Fire Resistance',
  source: 'DMG',
  type: 'P',
  rarity: 'uncommon',
  srd: true,
  resist: ['fire'],
  weight: 0.5,
  entries: ['{#itemEntry Potion of Resistance}'],
}

export const resistanceFragments: ItemEntry5e[] = [
  {
    name: 'Potion of Resistance',
    source: 'DMG',
    entriesTemplate: [
      'When you drink this potion, you gain resistance to {{item.resist}} damage for 1 hour.',
    ],
  },
  {
    name: 'Potion of Resistance',
    source: 'XDMG',
    entriesTemplate: [
      'When you drink this potion, you have {@variantrule Resistance|XPHB} to {{getFullImmRes item.resist}} damage for 1 hour.',
    ],
  },
]
