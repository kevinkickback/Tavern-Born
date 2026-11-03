import { afterEach, expect, test } from 'vitest'
import { composeGameDataLayers } from '@/lib/5etools/contentLayers'
import { createEmptyGameData } from '@/lib/5etools/emptyGameData'
import { parseItems } from '@/lib/5etools/parsers/basic'
import {
  createStartingEquipmentPolicy,
  getStartingEquipmentCandidates,
} from '@/lib/5etools/startingEquipmentPolicy'
import { isMundaneStartingItem } from '@/lib/5etools/startingItemCategory'
import { clearGameDataCache, readGameDataCache, writeGameDataCache } from '@/lib/storage/dataCache'
import type { Item5e } from '@/types/5etools'
import { makeCharacterFixture } from '../../fixtures/characterFixtures'

afterEach(clearGameDataCache)

test('Basic follows the own collection through copy mods, a real cache round trip and winning layers', async () => {
  const layer = createEmptyGameData()
  layer.itemsBase = parseItems({
    baseitem: [{ name: 'Axe', source: 'PHB', type: 'M', weaponCategory: 'simple' }],
  }) as Item5e[]
  layer.items = parseItems({
    item: [
      {
        name: 'Copied Axe',
        source: 'PHB',
        startingEquipmentCategory: 'Basic',
        rarity: 'none',
        _copy: {
          name: 'Axe',
          source: 'PHB',
          _mod: { _: [{ mode: 'setProp', prop: 'startingEquipmentCategory', value: 'Basic' }] },
        },
      },
    ],
  }) as Item5e[]
  const composed = composeGameDataLayers([layer])
  expect(composed.items[0]).toMatchObject({
    name: 'Copied Axe',
    type: 'M',
    startingEquipmentCategory: 'Other',
  })
  expect(isMundaneStartingItem(composed.items[0])).toBe(true)
  await writeGameDataCache(composed, { type: 'local', path: '/starting-items', isValid: true })
  const cached = await readGameDataCache()
  expect(cached?.cacheSchemaVersion).toBe(63)
  const restored = composeGameDataLayers([structuredClone(cached!.data)])
  const all = [...restored.items, ...restored.itemsBase]
  const character = makeCharacterFixture()
  const basic = createStartingEquipmentPolicy(
    character,
    { kind: 'class', name: 'Fighter', source: 'PHB' },
    { default: ['{@filter simple weapon|items|source=PHB|category=Basic|type=simple weapon}'] },
    all,
  )
  expect(
    getStartingEquipmentCandidates(basic, 0, 'weaponSimple', undefined, {
      option: '_',
      entry: 0,
    }).candidates.map((item) => item.name),
  ).toEqual(['Axe'])
  const mundane = {
    ...basic,
    startingEquipment: {
      default: ['{@filter simple weapon|items|miscellaneous=mundane|type=simple weapon}'],
    },
  }
  expect(
    getStartingEquipmentCandidates(mundane, 0, 'weaponSimple', undefined, {
      option: '_',
      entry: 0,
    }).candidates.map((item) => item.name),
  ).toEqual(['Axe', 'Copied Axe'])
  const overlay = createEmptyGameData()
  // The resource collection, rather than the itemsBase property/file name, owns Basic status.
  overlay.itemsBase = parseItems({
    item: [
      {
        name: 'Axe',
        source: 'PHB',
        type: 'M',
        weaponCategory: 'simple',
        rarity: 'none',
        startingEquipmentCategory: 'Basic',
      },
    ],
  }) as Item5e[]
  const winning = composeGameDataLayers([restored, overlay])
  const changed = createStartingEquipmentPolicy(character, basic.owner, basic.startingEquipment, [
    ...winning.items,
    ...winning.itemsBase,
  ])
  expect(
    getStartingEquipmentCandidates(changed, 0, 'weaponSimple', undefined, { option: '_', entry: 0 })
      .candidates,
  ).toEqual([])
})

test('array-only input and duplicate exact identities cannot fabricate Basic authority', () => {
  const array = parseItems([
    {
      name: 'Axe',
      source: 'PHB',
      type: 'M',
      weaponCategory: 'simple',
      startingEquipmentCategory: 'Basic',
    },
  ]) as Item5e[]
  const base = parseItems({
    baseitem: [{ name: 'Axe', source: 'PHB', type: 'M', weaponCategory: 'simple' }],
  }) as Item5e[]
  for (const items of [array, [...base, ...base]]) {
    const policy = createStartingEquipmentPolicy(
      makeCharacterFixture(),
      { kind: 'class', name: 'Fighter', source: 'PHB' },
      { default: ['{@filter simple weapon|items|source=PHB|category=Basic|type=simple weapon}'] },
      items,
    )
    expect(
      getStartingEquipmentCandidates(policy, 0, 'weaponSimple', undefined, {
        option: '_',
        entry: 0,
      }).candidates,
    ).toEqual([])
  }
})
