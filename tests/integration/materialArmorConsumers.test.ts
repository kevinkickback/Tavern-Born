import { expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { getItemRulesEntries } from '@/lib/5etools/itemTypeEntries'
import { renderEntriesToText } from '@/lib/entryText'
import { loadMagicTemplates } from '../fixtures/magicVariantFixtures'

const plate = {
  name: 'Plate Armor',
  source: 'XPHB',
  type: 'HA|XPHB',
  edition: 'one',
  rarity: 'none',
  srd52: true,
  ac: 18,
  weight: 65,
  strength: '15',
  stealth: true,
}

const mithral = {
  name: 'Mithral Armor',
  type: 'GV|XDMG',
  requires: [{ type: 'HA|XPHB' }],
  inherits: {
    source: 'XDMG',
    namePrefix: 'Mithral ',
    rarity: 'uncommon',
    strength: null,
    stealth: false,
    entries: ['Remove the armor’s normal penalties.'],
  },
}

test('winning exact bases govern material armor and explicit equipment wins', async () => {
  const data = await loadMagicTemplates([mithral], [], { baseitem: [plate] })
  const find = (catalog: typeof data) =>
    catalog.items.find((item) => item.name === 'Mithral Plate Armor' && item.source === 'XDMG')
  expect(find(data)).toMatchObject({ ac: 18, strength: null, stealth: false })

  const unavailable = await loadMagicTemplates([], [], { baseitem: [{ ...plate, ac: '18' }] })
  expect(find(composeGameDataLayers([data, unavailable]))).toBeUndefined()
  const replacement = await loadMagicTemplates([], [], { baseitem: [{ ...plate, weight: 60 }] })
  expect(find(composeGameDataLayers([data, unavailable, replacement]))).toMatchObject({
    weight: 60,
    strength: null,
    stealth: false,
  })

  const explicit = {
    name: 'Mithral Plate Armor',
    source: 'XDMG',
    type: plate.type,
    entries: ['Exact concrete printing.'],
  }
  const overlay = await loadMagicTemplates([], [explicit])
  const winner = find(composeGameDataLayers([data, overlay]))
  expect(winner?.magicVariantGenerated).toBeUndefined()
  expect(renderEntriesToText(getItemRulesEntries(winner))).toContain('Exact concrete printing.')
})

test('noncanonical material declarations cannot override the supported armor fields', async () => {
  const conflicting = { ...mithral, inherits: { ...mithral.inherits, strength: '10' } }
  const unsupported = {
    ...mithral,
    name: 'Mithral +1 Armor',
    inherits: { ...mithral.inherits, source: 'AI', bonusAc: '+1' },
  }
  const data = await loadMagicTemplates([conflicting, unsupported], [], { baseitem: [plate] })
  expect(data.items.some((item) => item.magicVariantGenerated)).toBe(false)
  expect(data.materialArmorDiagnostics).toEqual([
    expect.objectContaining({ path: 'magicVariants.Mithral Armor|XDMG' }),
  ])
})
