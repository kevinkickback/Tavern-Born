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

  await expect(page.getByText('Inventory', { exact: true })).toBeVisible()
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
})
