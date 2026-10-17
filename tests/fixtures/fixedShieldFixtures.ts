import type { Item5e } from '@/types/5etools'
import { loadMagicTemplates } from './magicVariantFixtures'

// Literal audited producers at upstream b9061583; test expectations do not call the generator.
export const shieldBases = [
  {
    name: 'Shield',
    source: 'PHB',
    type: 'S',
    edition: 'classic',
    rarity: 'none',
    ac: 2,
    weight: 6,
    value: 1000,
    srd: true,
    entries: ['Base shield rules.'],
  },
  {
    name: 'Shield',
    source: 'XPHB',
    type: 'S|XPHB',
    edition: 'one',
    rarity: 'none',
    ac: 2,
    weight: 6,
    value: 1000,
    srd52: true,
  },
]
export const fixedShieldTemplates = [1, 2, 3].flatMap((n) =>
  ['DMG', 'XDMG'].map((source) => ({
    name: `+${n} Shield (*)`,
    type: `GV|${source}`,
    ...(source === 'DMG' ? { edition: 'classic' } : {}),
    requires: source === 'DMG' ? [{ type: 'S' }, { type: 'S|XPHB' }] : [{ type: 'S|XPHB' }],
    entries: ['Generic reference-only rules.'],
    inherits: {
      namePrefix: `+${n} `,
      source,
      bonusAc: `+${n}`,
      rarity: ['uncommon', 'rare', 'very rare'][n - 1],
      ...(source === 'DMG'
        ? { srd: true, reprintedAs: [`+${n} Shield (*)|XDMG`] }
        : { srd52: true }),
      entries: [`While holding this shield, gain {=bonusAc} AC.`],
    },
  })),
)
export function loadFixedShields(
  templates: unknown[] = fixedShieldTemplates,
  bases: unknown[] = shieldBases,
  items: Item5e[] = [],
) {
  return loadMagicTemplates(templates, items, { baseitem: bases })
}
