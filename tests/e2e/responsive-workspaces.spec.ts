import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  ensureStartupPromptResolved,
  seedAppState,
  selectCharacterFromHome,
} from './helpers/startup'

const SPLIT_WORKSPACES = [
  { route: '/build/race', heading: 'Race' },
  { route: '/build/class', heading: 'Class' },
  { route: '/build/background', heading: 'Background' },
  { route: '/build/ability-scores', heading: 'Ability Scores' },
  { route: '/build/proficiencies', heading: 'Proficiencies' },
  { route: '/build/adjustments', heading: 'Actions & Effects' },
  { route: '/feats', heading: 'Feats' },
  { route: '/spells', heading: 'Spells' },
  { route: '/equipment', heading: 'Equipment' },
  { route: '/details/portrait', heading: 'Portrait' },
] as const

test('split workspaces remain usable at the minimum app width', async ({ page }) => {
  test.setTimeout(60000)
  const fixturePath = path.resolve('tests/fixtures/equipment-e2e.tbc')
  const character = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as { id: string }

  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-responsive-workspaces',
    characters: [character],
    activeCharacterId: character.id,
  })
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-responsive-workspaces')
  await selectCharacterFromHome(page, 'Equipment E2E Hero')
  await page.setViewportSize({ width: 900, height: 700 })
  await expect(page.getByRole('complementary', { name: 'Builder navigation' })).toBeVisible()

  for (const workspace of SPLIT_WORKSPACES) {
    await page.goto(`/#${workspace.route}`)
    await ensureStartupPromptResolved(page, 'e2e-responsive-workspaces')
    await expect(
      page.getByRole('banner').getByRole('heading', { name: workspace.heading, exact: true }),
    ).toBeVisible()

    const dismissHint = page.getByRole('button', { name: /Dismiss .*hint/i }).first()
    if (await dismissHint.isVisible().catch(() => false)) {
      await dismissHint.click({ timeout: 2_000 }).catch(() => {
        // The optional hint may finish its exit transition between detection and the click.
      })
    }

    const splitPane = page.locator('[data-slot="split-pane"]')
    const paneSwitcher = splitPane.getByRole('tablist', { name: 'Workspace pane' })
    const paneTabs = paneSwitcher.getByRole('tab')
    await expect(paneSwitcher).toBeVisible()
    await expect(paneTabs).toHaveCount(2)

    const splitBox = await splitPane.boundingBox()
    const leftPane = splitPane.locator('[data-slot="split-pane-left"]')
    const rightPane = splitPane.locator('[data-slot="split-pane-right"]')
    await expect(leftPane).toBeVisible()
    const leftBox = await leftPane.boundingBox()
    expect(leftBox?.width).toBeGreaterThan((splitBox?.width ?? 0) * 0.9)

    await paneTabs.nth(1).click()
    await expect(paneTabs.nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(rightPane).toBeVisible()
    await expect(leftPane).toBeHidden()
    const rightBox = await rightPane.boundingBox()
    expect(rightBox?.width).toBeGreaterThan((splitBox?.width ?? 0) * 0.9)

    await paneTabs.first().click()
    await expect(leftPane).toBeVisible()
  }
})
