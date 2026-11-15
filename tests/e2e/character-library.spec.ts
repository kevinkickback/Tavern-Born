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
      const revealedDetails = [version, date, actions]

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
      const hoveredCardBox = (await card.boundingBox())!
      const hoveredLevelBox = (await level.boundingBox())!
      expect(hoveredLevelBox.y - hoveredCardBox.y).toBe(levelBox.y - cardBox.y)
      const actionsBox = (await actions.boundingBox())!
      expect(actionsBox.x + actionsBox.width).toBeLessThanOrEqual((await classes.boundingBox())!.x)
      await page.mouse.move(0, 0)
      for (const detail of revealedDetails) await expect(detail).toHaveCSS('opacity', '0')
      await page.getByRole('button', { name: `Duplicate ${name}` }).focus()
      for (const detail of revealedDetails) await expect(detail).toHaveCSS('opacity', '1')
      await page.getByRole('searchbox', { name: 'Search characters' }).focus()
    }
    expect(badgeColors[0]).not.toBe(badgeColors[1])
  }
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
