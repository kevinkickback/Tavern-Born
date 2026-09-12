import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
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
      class: 'Fighter',
      lastModified: '2026-01-02T00:00:00.000Z',
    },
    {
      ...fixture,
      id: 'library-bravo',
      name: 'Bravo Mage',
      class: 'Wizard',
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

  await test.step('filter the library by character metadata', async () => {
    await search.fill('wizard')
    await expect(main.getByText('Bravo Mage').first()).toBeVisible()
    await expect(main.getByText('Alpha Hero')).toHaveCount(0)
    await expect(search.locator('xpath=..')).toContainText('1 / 2')
    await search.clear()
  })

  await test.step('cancel leaves the character untouched', async () => {
    await main.getByRole('button', { name: 'Delete Bravo Mage' }).click()
    const dialog = page.getByRole('alertdialog', { name: 'Delete character?' })
    await expect(dialog.getByText('This action cannot be undone.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(main.getByText('Bravo Mage').first()).toBeVisible()
  })

  await test.step('confirm removes only the target and survives reload', async () => {
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
          version: '6.0.0',
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
