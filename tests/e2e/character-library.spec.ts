import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { CURRENT_CHARACTER_SCHEMA_VERSION } from '../../src/lib/schema/characterSchemaVersion'
import {
  ensureStartupPromptResolved,
  readPersistedCharacters,
  seedAppState,
} from './helpers/startup'

function loadLibraryCharacters(): Record<string, unknown>[] {
  const fixturePath = path.resolve('tests/fixtures/equipment-e2e.tbc')
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as Record<string, unknown>
  return [
    {
      ...fixture,
      id: 'library-alpha',
      name: 'Alpha Hero',
      lastModified: '2026-01-02T00:00:00.000Z',
    },
    {
      ...fixture,
      id: 'library-bravo',
      name: 'Bravo Mage',
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 1 }],
      initialClass: { name: 'Wizard', source: 'PHB' },
      lastModified: '2026-01-03T00:00:00.000Z',
    },
  ]
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-library-seed',
    characters: loadLibraryCharacters(),
  })
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-library-seed')
})

test('sidebar views, filters, sort and group compose with toolbar search', async ({ page }) => {
  await page.getByRole('button', { name: '2024 0' }).click()
  await expect(
    page.getByRole('heading', { name: 'No characters match this filter.' }),
  ).toBeVisible()

  const [classic, second] = loadLibraryCharacters()
  const revised = {
    ...second,
    id: 'library-revised',
    name: 'Charlie Revised',
    originSystem: '2024',
  }
  await seedAppState(page, {
    sourcePath: 'e2e-library-seed',
    characters: [classic, second, revised],
  })
  await page.reload()
  await page.setViewportSize({ width: 900, height: 700 })

  const sidebar = page.getByRole('complementary', { name: 'Characters navigation' })
  const views = sidebar.getByRole('region', { name: 'View' })
  const filters = sidebar.getByRole('region', { name: 'Filter' })
  const gridView = views.getByRole('button', { name: 'Grid view' })
  const listView = views.getByRole('button', { name: 'List view' })
  const toolbar = page.locator('[data-slot="workspace-toolbar"]')
  const search = toolbar.getByRole('searchbox', { name: 'Search characters' })
  const renderedNames = page.locator('main h3')
  await expect(sidebar.getByRole('heading')).toHaveText(['View', 'Filter', 'Sort', 'Group'])
  await expect(gridView).toHaveAttribute('aria-pressed', 'true')
  await expect(filters.getByRole('button', { name: 'All 3', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(filters.getByRole('button', { name: 'Needs Attention 3' })).toBeVisible()
  await expect(toolbar.getByRole('button', { name: 'Import', exact: true })).toBeVisible()
  await expect(toolbar.getByRole('button', { name: 'Export Library' })).toBeVisible()
  await expect(toolbar.getByRole('button', { name: /^(grid|gallery|list) view$/i })).toHaveCount(0)
  await expect(toolbar.getByRole('combobox')).toHaveCount(0)

  await filters.getByRole('button', { name: '2024 1' }).click()
  await expect(renderedNames).toHaveText(['Charlie Revised'])
  await search.fill('Alpha')
  await expect(renderedNames).toHaveCount(0)
  await expect(toolbar.getByRole('button', { name: 'Import', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New Character', exact: true })).toBeVisible()
  await search.clear()

  await toolbar.getByRole('button', { name: 'Select Multiple' }).click()
  await page.getByRole('button', { name: 'Select visible', exact: true }).click()
  await filters.getByRole('button', { name: '2014 2' }).click()
  await expect(page.getByText('1 selected (1 hidden)')).toBeVisible()
  await toolbar.getByRole('button', { name: 'Cancel Selection' }).click()

  await sidebar.getByRole('combobox', { name: 'Sort', exact: true }).click()
  await page.getByRole('option', { name: 'Name (A–Z)' }).click()
  await expect(renderedNames).toHaveText(['Alpha Hero', 'Bravo Mage'])
  await sidebar.getByRole('combobox', { name: 'Group', exact: true }).click()
  await page.getByRole('option', { name: 'Class', exact: true }).click()
  await expect(page.locator('main section').filter({ hasText: /^Fighter 1/ })).toHaveCount(1)
  await expect(renderedNames).toHaveText(['Alpha Hero', 'Bravo Mage'])

  await listView.focus()
  const gridBox = (await gridView.boundingBox())!
  const listBox = (await listView.boundingBox())!
  expect(listBox.y).toBe(gridBox.y)
  expect(listBox.x).toBeGreaterThan(gridBox.x + gridBox.width)
  await listView.press('Space')
  await expect(listView).toHaveAttribute('aria-pressed', 'true')
  await expect(gridView).toHaveAttribute('aria-pressed', 'false')
  await expect(renderedNames).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Actions for Alpha Hero' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Actions for Charlie Revised' })).toHaveCount(0)
  await gridView.click()
  await expect(renderedNames).toHaveText(['Alpha Hero', 'Bravo Mage'])

  const rows = filters.getByRole('button').or(sidebar.getByRole('combobox'))
  const dimensions = await rows.evaluateAll((controls) =>
    controls.map((el) => {
      const style = getComputedStyle(el)
      return [style.height, style.width, style.fontSize, style.paddingLeft]
    }),
  )
  expect(dimensions).toHaveLength(6)
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  const standardRow = await page
    .getByRole('link', { name: 'General', exact: true })
    .evaluate((el) => {
      const style = getComputedStyle(el)
      return [style.height, style.width, style.fontSize, style.paddingLeft]
    })
  for (const row of dimensions) expect(row).toEqual(standardRow)
})

test('secondary sidebar stays collapsed across workspaces and reloads', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const rail = page.getByRole('navigation', { name: 'Primary workspaces' })
  const toggle = rail.getByRole('button', { name: /^(Collapse|Expand) secondary sidebar$/ })
  const shell = page.locator('#app-interactive-content')
  const sidebar = page.getByRole('complementary', { name: 'Characters navigation' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(toggle.locator('.lucide-panel-left-close')).toBeVisible()
  const filter = sidebar.getByRole('button', { name: '2024 0' })
  await filter.click()
  const content = page.locator('main').locator('..')
  const status = page.getByRole('status', { name: 'Application status' })
  const sidebarWidth = (await sidebar.boundingBox())!.width
  const openContent = (await content.boundingBox())!
  const openStatus = (await status.boundingBox())!
  const shellBounds = (await shell.boundingBox())!
  const railBounds = (await rail.locator('..').boundingBox())!
  const rightGap = shellBounds.x + shellBounds.width - (openContent.x + openContent.width)
  const reclaimedWidth = sidebarWidth - rightGap
  expect(rightGap).toBeGreaterThan(0)
  await shell.evaluate((element) => {
    element.addEventListener('transitionrun', (event) => {
      if (
        !(event instanceof TransitionEvent) ||
        event.target !== element ||
        event.propertyName !== 'grid-template-columns'
      )
        return
      element.dataset.sidebarTransitions = String(
        Number(element.dataset.sidebarTransitions ?? 0) + 1,
      )
    })
  })

  await toggle.focus()
  await toggle.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle.locator('.lucide-panel-left-open')).toBeVisible()
  await expect(sidebar).toHaveCount(0)
  await expect(filter).toHaveCount(0)
  await expect(toggle).toBeFocused()
  await expect(shell).toHaveAttribute('data-sidebar-transitions', '1')
  await expect
    .poll(async () => (await content.boundingBox())!.width - openContent.width)
    .toBeCloseTo(reclaimedWidth)
  await expect
    .poll(async () => (await status.boundingBox())!.width - openStatus.width)
    .toBeCloseTo(reclaimedWidth)
  const closedContent = (await content.boundingBox())!
  expect(closedContent.x - (railBounds.x + railBounds.width)).toBeCloseTo(rightGap)
  expect(shellBounds.x + shellBounds.width - (closedContent.x + closedContent.width)).toBeCloseTo(
    rightGap,
  )
  await expect(page.locator('#secondary-workspace-sidebar')).toHaveCSS('opacity', '0')

  await toggle.press('Space')
  await expect(filter).toHaveAttribute('aria-pressed', 'true')
  await expect(shell).toHaveAttribute('data-sidebar-transitions', '2')
  await expect.poll(async () => (await content.boundingBox())!.width).toBeCloseTo(openContent.width)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(shell).toHaveCSS('transition-property', 'none')
  await toggle.click()
  expect((await content.boundingBox())!.width - openContent.width).toBeCloseTo(reclaimedWidth)
  await rail.getByRole('button', { name: 'Settings', exact: true }).click()
  const settingsSidebar = page.getByRole('complementary', { name: 'Settings navigation' })
  await expect(page.getByRole('region', { name: 'General', exact: true })).toBeVisible()
  await expect(settingsSidebar).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const path = '/src/store/appPreferencesStore.ts'
        const { useAppPreferencesStore } = await import(path)
        const stored = await useAppPreferencesStore.persist
          .getOptions()
          .storage.getItem('app-preferences-storage')
        return stored?.state.secondarySidebarOpen
      }),
    )
    .toBe(false)

  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-library-seed')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(settingsSidebar).toHaveCount(0)
  await toggle.click()
  const appearance = settingsSidebar.getByRole('link', { name: 'Appearance' })
  await appearance.click()
  await expect(appearance).toHaveAttribute('aria-current', 'page')
})

test('character library filters, cancels deletion, then persists a confirmed deletion', async ({
  page,
}) => {
  const main = page.locator('main')
  const search = page.getByRole('searchbox', { name: 'Search characters' })
  const bravoCard = main.locator('[data-slot="card"]').filter({
    has: page.getByRole('heading', { name: 'Bravo Mage', exact: true }),
  })

  await test.step('filter the library by character metadata', async () => {
    await search.fill('wizard')
    await expect(main.getByText('Bravo Mage').first()).toBeVisible()
    await expect(main.getByText('Alpha Hero')).toHaveCount(0)
    await expect(search.locator('xpath=..')).toContainText('1 / 2')
    await search.clear()
  })

  await test.step('cancel leaves the character untouched', async () => {
    await bravoCard.hover()
    await main.getByRole('button', { name: 'Delete Bravo Mage' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Delete character?' })
    await expect(dialog.getByText('This action cannot be undone.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(main.getByText('Bravo Mage').first()).toBeVisible()
  })

  await test.step('confirm removes only the target and survives reload', async () => {
    await bravoCard.hover()
    await main.getByRole('button', { name: 'Delete Bravo Mage' }).click()
    await page.getByRole('button', { name: 'Delete Character' }).click()
    await expect(page.getByText('Character deleted')).toBeVisible()
    await expect(main.getByText('Bravo Mage')).toHaveCount(0)
    await expect(main.getByText('Alpha Hero').first()).toBeVisible()

    await expect
      .poll(async () => {
        const characters = (await readPersistedCharacters(page)) as Array<{ id?: string }>
        return characters.map((character) => character.id)
      })
      .toEqual(['library-alpha'])

    await page.reload()
    await ensureStartupPromptResolved(page, 'e2e-library-seed')
    await expect(page.getByText('Alpha Hero').first()).toBeVisible()
    await expect(page.getByText('Bravo Mage')).toHaveCount(0)
  })
})

test('gallery centers multiclass details and reveals the edition, date, and actions together', async ({
  page,
}) => {
  const names = [
    'Irelia Tisesh of the Ashen Court and Keeper of the Northern Gate',
    'W'.repeat(100),
  ]
  const editions = ['2014', '2024']
  await seedAppState(page, {
    sourcePath: 'e2e-library-seed',
    activeCharacterId: 'library-alpha',
    characters: loadLibraryCharacters().map((character, index) => ({
      ...character,
      name: names[index],
      originSystem: editions[index],
      portrait: 'assets/images/characters/placeholder_char_card.jpg',
      initialClass: { name: 'Fighter', source: 'PHB' },
      classProgression: [
        { name: 'Fighter', source: 'PHB', levels: 3 },
        { name: 'Wizard', source: 'PHB', levels: 2 },
        { name: 'Rogue', source: 'PHB', levels: 1 },
      ],
    })),
  })
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-library-seed')
  await page.evaluate(() => document.fonts.ready.then(() => undefined))

  for (const viewportWidth of [1280, 620]) {
    await page.setViewportSize({ width: viewportWidth, height: 768 })
    const badgeColors = []
    for (const [index, name] of names.entries()) {
      const heading = page.getByRole('heading', { name, exact: true })
      const card = page.locator('[data-slot="card"]').filter({ has: heading })
      const version = card.getByText(editions[index], { exact: true })
      const level = card.getByText('Level 6')
      const classes = card.getByRole('list', { name: 'Class levels' })
      const date = card.locator('[data-slot="character-card-date"]')
      const actions = card.locator('[data-slot="character-card-actions"]')
      const duplicate = actions.getByRole('button', { name: `Duplicate ${name}` })
      const revealedDetails = [version, date, actions]

      await expect(date).toHaveCSS('font-size', '11px')
      await expect(actions).toHaveCSS('transition-duration', '0.2s')
      await expect(card.getByLabel(/Character ready|items? to review/)).toHaveCount(0)
      await expect(level).toBeVisible()
      expect(await classes.getByRole('listitem').allTextContents()).toEqual([
        'Fighter 3',
        'Wizard 2',
        'Rogue 1',
      ])
      await expect(heading).toHaveAttribute('title', name)
      badgeColors.push(await version.evaluate((badge) => getComputedStyle(badge).backgroundColor))

      const cardBox = (await card.boundingBox())!
      const nameBox = (await heading.boundingBox())!
      const badgeBox = (await version.boundingBox())!
      const levelBox = (await level.boundingBox())!
      const classBox = (await classes.boundingBox())!
      const dateBox = (await date.boundingBox())!
      if (viewportWidth === 1280) {
        expect(cardBox.width).toBe(360)
        expect(cardBox.height).toBe(240)
        await expect(duplicate).toHaveCSS('width', '36px')
        await expect(duplicate).toHaveCSS('height', '36px')
      } else {
        expect(cardBox.width).toBeGreaterThan(260)
        expect(cardBox.width).toBeLessThan(360)
        expect(cardBox.height).toBeCloseTo((cardBox.width * 2) / 3, 0)
      }
      expect(badgeBox.x + badgeBox.width).toBeLessThan(nameBox.x)
      expect(badgeBox.x - cardBox.x).toBeLessThanOrEqual(16)
      expect(Math.abs(badgeBox.y - nameBox.y)).toBeLessThan(8)
      expect(nameBox.x + nameBox.width).toBeLessThan(cardBox.x + cardBox.width)
      const gapBelowName = levelBox.y - (nameBox.y + nameBox.height)
      const gapAboveDate = dateBox.y - (classBox.y + classBox.height)
      expect(gapBelowName).toBeGreaterThan(0)
      expect(Math.abs(gapBelowName - gapAboveDate)).toBeLessThanOrEqual(1)
      expect(await classes.evaluate((list) => list.scrollHeight)).toBeLessThanOrEqual(
        Math.ceil(classBox.height),
      )

      await page.mouse.move(0, 0)
      for (const detail of revealedDetails) await expect(detail).toHaveCSS('opacity', '0')
      await card.hover()
      for (const detail of revealedDetails) await expect(detail).toHaveCSS('opacity', '1')
      await expect(card).toHaveCSS('translate', '0px -2px')
      const hoveredCardBox = (await card.boundingBox())!
      const hoveredLevelBox = (await level.boundingBox())!
      expect(hoveredLevelBox.y - hoveredCardBox.y).toBe(levelBox.y - cardBox.y)
      const actionsBox = (await actions.boundingBox())!
      expect(actionsBox.x + actionsBox.width).toBeLessThanOrEqual((await classes.boundingBox())!.x)
      await page.mouse.move(0, 0)
      for (const detail of revealedDetails) await expect(detail).toHaveCSS('opacity', '0')
      await duplicate.focus()
      for (const detail of revealedDetails) await expect(detail).toHaveCSS('opacity', '1')
      await page.getByRole('searchbox', { name: 'Search characters' }).focus()
    }
    expect(badgeColors[0]).not.toBe(badgeColors[1])
  }

  const card = page.locator('[data-slot="card"]').filter({
    has: page.getByRole('heading', { name: names[0], exact: true }),
  })
  const hitArea = page.locator('[data-slot="character-card-hit-area"]').filter({ has: card })
  const actions = card.locator('[data-slot="character-card-actions"]')
  const { width, height } = (await hitArea.boundingBox())!
  await hitArea.hover({ position: { x: width / 2, y: height - 1 } })
  await expect(card).toHaveCSS('translate', '0px -2px')
  await expect(actions).toHaveCSS('opacity', '1')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(card).toHaveCSS('translate', 'none')
  await expect(actions).toHaveCSS('transition-duration', '0s')
  await expect(actions).toHaveCSS('opacity', '1')

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width: 1280, height: 768 })
  await page.getByRole('button', { name: 'Select Multiple' }).click()
  const selectionBox = (await hitArea.boundingBox())!
  const bottomEdge = { x: selectionBox.width / 2, y: selectionBox.height - 1 }
  await hitArea.hover({ position: bottomEdge })
  await expect(card).toHaveCSS('translate', '0px -2px')
  await hitArea.click({ position: bottomEdge })
  await expect(card.getByRole('checkbox', { name: `Select ${names[0]}` })).toBeChecked()
})

test('malformed and schema-invalid imports show distinct errors without changing the library', async ({
  page,
}) => {
  await test.step('malformed JSON reports a parse failure', async () => {
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import' }).first().click()
    await (await chooser).setFiles({
      name: 'malformed.tbc',
      mimeType: 'application/json',
      buffer: Buffer.from('{not-json'),
    })
    await expect(page.getByText(/Failed to import character:/)).toBeVisible()
  })

  await test.step('a current-version character with corrupted nested data is rejected', async () => {
    const [fixture] = loadLibraryCharacters()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import' }).first().click()
    await (await chooser).setFiles({
      name: 'invalid-schema.tbc',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          ...fixture,
          id: 'bad',
          name: 'Corrupted',
          schemaVersion: CURRENT_CHARACTER_SCHEMA_VERSION,
          proficiencies: {
            ...(fixture.proficiencies as Record<string, unknown>),
            weapons: [{ name: 'Not a valid proficiency' }],
          },
        }),
      ),
    })
    await expect(page.getByText(/Invalid character:/)).toBeVisible()
  })

  await expect(page.getByText('Alpha Hero').first()).toBeVisible()
  await expect(page.getByText('Bravo Mage').first()).toBeVisible()
  const persisted = (await readPersistedCharacters(page)) as Array<{ id?: string }>
  expect(persisted.map((character) => character.id).sort()).toEqual([
    'library-alpha',
    'library-bravo',
  ])
})

test('exports and restores a complete library backup with collision-safe identities', async ({
  page,
}) => {
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export Library' }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toMatch(/\.tbclib$/)
  const backup = JSON.parse(fs.readFileSync(await download.path(), 'utf8')) as {
    kind: string
    version: number
    characters: Array<{ id: string; name: string; raceSource?: string; portrait?: string }>
  }
  expect(backup.kind).toBe('tavern-born-library')
  expect(backup.version).toBe(1)
  expect(backup.characters.map((character) => character.name).sort()).toEqual([
    'Alpha Hero',
    'Bravo Mage',
  ])

  const chooserEvent = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Import' }).first().click()
  await (await chooserEvent).setFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  })
  const dialog = page.getByRole('dialog', { name: 'Character import results' })
  await expect(dialog).toContainText('2 imported · 0 failed')
  await expect(dialog).toContainText('renamed to avoid a name collision')
  await expect(dialog).toContainText('assigned a new ID')
  await dialog.getByRole('button', { name: 'Done' }).click()

  await expect
    .poll(async () => {
      const characters = (await readPersistedCharacters(page)) as Array<{
        id: string
        name: string
        raceSource?: string
        portrait?: string
      }>
      return characters.map((character) => character.name).sort()
    })
    .toEqual(['Alpha Hero', 'Alpha Hero (Imported)', 'Bravo Mage', 'Bravo Mage (Imported)'])
})

test('startup downloads all incompatible originals in one library backup', async ({ page }) => {
  const [valid, previous] = loadLibraryCharacters()
  const originals = [
    {
      ...previous,
      schemaVersion: 0,
      retiredFields: { list: ['preserve', null, false], options: { enabled: true } },
    },
    { id: 'incomplete', schemaVersion: CURRENT_CHARACTER_SCHEMA_VERSION, originalValue: 'é' },
  ]
  await seedAppState(page, {
    sourcePath: 'e2e-library-seed',
    characters: [valid, ...originals],
  })
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-library-seed')
  const dialog = page.getByRole('alertdialog', { name: 'Character compatibility issue' })
  await expect(dialog).toContainText('found 2 characters')

  const filenames: string[] = []
  page.on('download', (download) => filenames.push(download.suggestedFilename()))
  const downloadEvent = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download Backup' }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toMatch(
    /^tavern-born-legacy-backup-\d{4}-\d{2}-\d{2}\.tbclib$/,
  )
  const backup = JSON.parse(fs.readFileSync(await download.path(), 'utf8'))
  expect(backup).toEqual({
    kind: 'tavern-born-library',
    version: 1,
    exportedAt: expect.any(String),
    characters: originals,
  })

  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await expect(dialog).toBeHidden()
  expect(filenames).toEqual([download.suggestedFilename()])
  expect(await readPersistedCharacters(page)).toEqual([valid])
})
