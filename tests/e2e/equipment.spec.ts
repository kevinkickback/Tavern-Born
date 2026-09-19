import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  ensureStartupPromptResolved,
  MINIMAL_GAME_DATA,
  seedAppState,
  selectCharacterFromHome,
} from './helpers/startup'

test('equipment page supports equip/attune/quantity and weight updates', async ({ page }) => {
  const fixturePath = path.resolve('tests/fixtures/equipment-e2e.tbc')
  const character = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as {
    id: string
  }
  const characterWithCoreSources = { ...character, allowedSources: ['PHB'] }
  const gameData = {
    ...MINIMAL_GAME_DATA,
    items: [
      {
        name: 'Potion of Healing',
        source: 'DMG',
        type: 'P',
        rarity: 'common',
        srd: true,
      },
      {
        name: 'Spell Scroll (1st Level)',
        source: 'DMG',
        type: 'SC',
        rarity: 'common',
        basicRules: true,
      },
      {
        name: 'Bag of Holding',
        source: 'DMG',
        type: 'W',
        rarity: 'uncommon',
        srd: true,
      },
      {
        name: 'Leather Armor',
        source: 'PHB',
        type: 'LA',
        rarity: 'none',
        ac: 11,
      },
      {
        name: 'Shield',
        source: 'PHB',
        type: 'S',
        rarity: 'none',
        ac: 2,
      },
    ],
  }

  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-equipment-seed',
    gameData,
    characters: [characterWithCoreSources],
    activeCharacterId: character.id,
  })

  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-equipment-seed')

  await selectCharacterFromHome(page, 'Equipment E2E Hero')

  await page.getByRole('link', { name: 'Equipment' }).click()
  await expect(page).toHaveURL(/\/equipment$/)

  await expect(page.getByRole('heading', { name: 'Inventory', exact: true })).toBeVisible()
  await expect(page.getByText('5.0 / 150 lb')).toBeVisible()
  await expect(page.getByText('0 / 3')).toBeVisible()

  await page.getByRole('button', { name: 'Add Item' }).click()
  const addItemDialog = page.getByRole('dialog', { name: 'Add Item' })
  await expect(addItemDialog.getByText('Potion of Healing')).toBeVisible()
  await expect(addItemDialog.getByText('Spell Scroll (1st Level)')).toBeVisible()
  await expect(addItemDialog.getByText('Bag of Holding')).toHaveCount(0)
  const leatherArmorOption = addItemDialog.getByRole('button', { name: /^Leather Armor\b/ })
  await expect(leatherArmorOption.getByText('Light Armor', { exact: true })).toBeVisible()
  await expect(leatherArmorOption.getByText('Armor', { exact: true })).toHaveCount(0)
  await expect(addItemDialog.getByText(/Core potions and spell scrolls are included/)).toHaveCount(
    0,
  )
  await addItemDialog.getByRole('button', { name: /^Potion of Healing\b/ }).click()
  await leatherArmorOption.click()
  await addItemDialog.getByRole('button', { name: /^Shield\b/ }).click()
  await addItemDialog.getByRole('button', { name: 'Confirm' }).click()

  await expect(page.getByRole('button', { name: 'Inspect Potion of Healing' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Inspect Leather Armor' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Inspect Shield' })).toBeVisible()

  const inventoryCategoryTabs = page.getByRole('tablist', { name: 'Inventory category' })
  await inventoryCategoryTabs.getByRole('tab', { name: 'Armor' }).click()
  await expect(
    page.getByRole('button', { name: 'Inspect Leather Armor' }).getByText('Light Armor'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Inspect Shield' }).getByText('Shields'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Inspect Potion of Healing' })).toHaveCount(0)
  await inventoryCategoryTabs.getByRole('tab', { name: 'All', exact: true }).click()

  // Use the same accessible controls a keyboard or assistive-technology user reaches.
  await page.getByRole('button', { name: 'Increase Ring of Testing quantity' }).click()
  await expect(page.getByText('10.0 / 150 lb')).toBeVisible()

  const equipHint = page.getByRole('status').filter({ hasText: 'Toggle Equip' })
  await expect(equipHint).toBeVisible()
  await page.getByRole('switch', { name: 'Equip Ring of Testing' }).click()
  await expect(equipHint).toHaveCount(0)
  await page.getByRole('switch', { name: 'Attune Ring of Testing' }).click()
  await expect(page.getByRole('switch', { name: 'Equip Ring of Testing' })).toBeChecked()
  await expect(page.getByRole('switch', { name: 'Attune Ring of Testing' })).toBeChecked()
  await expect(page.getByText('1 / 3')).toBeVisible()

  await page.setViewportSize({ width: 900, height: 720 })
  await expect(page.getByRole('complementary', { name: 'Builder navigation' })).toBeVisible()

  const paneSwitcher = page.getByRole('tablist', { name: 'Workspace pane' })
  await expect(paneSwitcher).toBeVisible()
  await expect(paneSwitcher.getByRole('tab', { name: 'Inventory' })).toHaveAttribute(
    'aria-selected',
    'true',
  )

  const summary = page.getByRole('region', { name: 'Inventory summary' })
  await expect(summary).toBeVisible()
  const summaryWidth = await summary.evaluate((element) => ({
    client: element.clientWidth,
    scroll: element.scrollWidth,
  }))
  expect(summaryWidth.scroll).toBeLessThanOrEqual(summaryWidth.client)

  const weightBox = await summary.getByText('Weight', { exact: true }).boundingBox()
  const attunementBox = await summary.getByText('Attunement', { exact: true }).boundingBox()
  const currencyBox = await summary.getByText('Currency', { exact: true }).boundingBox()
  expect(weightBox).not.toBeNull()
  expect(attunementBox).not.toBeNull()
  expect(currencyBox).not.toBeNull()
  await expect(summary.getByText('Armor Class', { exact: true })).toHaveCount(0)
  expect(summaryWidth.client).toBeLessThan(820)
  expect(Math.abs((attunementBox?.y ?? 0) - (weightBox?.y ?? 0))).toBeLessThan(2)
  expect(currencyBox?.y).toBeGreaterThan(weightBox?.y ?? 0)

  const categoryTabs = page.getByRole('tablist', { name: 'Inventory category' })
  const scrollsTab = categoryTabs.getByRole('tab', { name: 'Scrolls' })
  await scrollsTab.click()
  await expect(scrollsTab).toHaveAttribute('aria-selected', 'true')
  const categoryBox = await categoryTabs.boundingBox()
  const scrollsBox = await scrollsTab.boundingBox()
  expect(scrollsBox?.x).toBeGreaterThanOrEqual(categoryBox?.x ?? 0)
  expect((scrollsBox?.x ?? 0) + (scrollsBox?.width ?? 0)).toBeLessThanOrEqual(
    (categoryBox?.x ?? 0) + (categoryBox?.width ?? 0) + 1,
  )

  await paneSwitcher.getByRole('tab', { name: 'Item details' }).click()
  await expect(page.getByRole('heading', { name: 'Item details' })).toBeVisible()
  await expect(summary).toBeHidden()
  await paneSwitcher.getByRole('tab', { name: 'Inventory' }).click()
  await expect(summary).toBeVisible()

  await categoryTabs.getByRole('tab', { name: 'All', exact: true }).click()
  await page.getByRole('button', { name: 'Inspect Ring of Testing' }).click()
  await expect(paneSwitcher.getByRole('tab', { name: 'Item details' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('heading', { name: 'Item details' })).toBeVisible()
})
