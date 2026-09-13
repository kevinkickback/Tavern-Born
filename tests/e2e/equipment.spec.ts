import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  ensureStartupPromptResolved,
  seedAppState,
  selectCharacterFromHome,
} from './helpers/startup'

test('equipment page supports equip/attune/quantity and weight updates', async ({ page }) => {
  const fixturePath = path.resolve('tests/fixtures/equipment-e2e.tbc')
  const character = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as {
    id: string
  }

  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-equipment-seed',
    characters: [character],
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

  // Use the same accessible controls a keyboard or assistive-technology user reaches.
  await page.getByRole('button', { name: 'Increase Ring of Testing quantity' }).click()
  await expect(page.getByText('10.0 / 150 lb')).toBeVisible()

  await page.getByRole('switch', { name: 'Equip Ring of Testing' }).click()
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
  const armorClassBox = await summary.getByText('Armor Class', { exact: true }).boundingBox()
  const currencyBox = await summary.getByText('Currency', { exact: true }).boundingBox()
  expect(weightBox).not.toBeNull()
  expect(attunementBox).not.toBeNull()
  expect(armorClassBox).not.toBeNull()
  expect(currencyBox).not.toBeNull()
  expect(summaryWidth.client).toBeLessThan(820)
  expect(Math.abs((attunementBox?.y ?? 0) - (weightBox?.y ?? 0))).toBeLessThan(2)
  expect(Math.abs((armorClassBox?.y ?? 0) - (weightBox?.y ?? 0))).toBeLessThan(2)
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
