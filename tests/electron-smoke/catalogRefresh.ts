import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { _electron as electron, expect, type Page, test } from '@playwright/test'
import { HAS_WINDOWS_ELECTRON_SANDBOX_REGRESSION } from '../helpers/electronEnvironment'

const source = 'https://catalog-refresh.example.test/rules'
const characterName = 'Saved Catalog Worker Hero'

interface RefreshFixture {
  start: () => void
  requested: Promise<void>
  release: () => void
}
const fixtureKey = '__catalogRefreshFixture'

function catalogStamp(page: Page, damage = false) {
  return page.evaluate(
    (damage) =>
      new Promise<{
        generation: string
        contentFingerprint: string
        hasLookups: boolean
      }>((resolve, reject) => {
        const open = indexedDB.open('keyval-store')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const database = open.result
          const transaction = database.transaction('keyval', damage ? 'readwrite' : 'readonly')
          const store = transaction.objectStore('keyval')
          const key = 'tb:game-data-cache'
          const read = store.get(key)
          read.onsuccess = () => {
            const entry = read.result
            if (!entry) {
              reject(new Error('No accepted catalog cache.'))
              return
            }
            const { generation, contentFingerprint } = entry
            const { lookups, ...data } = entry.data
            if (damage) {
              store.put(
                { ...entry, data, generation: undefined, contentFingerprint: undefined },
                key,
              )
              store.delete('tb:game-data-cache-generation')
            }
            transaction.oncomplete = () =>
              resolve({ generation, contentFingerprint, hasLookups: Boolean(lookups) })
          }
          transaction.onabort = () => reject(transaction.error)
          transaction.addEventListener('complete', () => database.close())
        }
      }),
    damage,
  )
}

test.skip(!existsSync(resolve('resources/srd/core/manifest.json')), 'requires the Included SRD')
test.skip(
  HAS_WINDOWS_ELECTRON_SANDBOX_REGRESSION && process.env.TAVERN_BORN_RUN_CATALOG_SMOKE !== '1',
  'Windows build has upstream Electron sandbox crash 0x80000003',
)

test('opens the wizard and a saved Builder character during catalog refresh', async ({
  browserName: _browserName,
}, testInfo) => {
  test.setTimeout(90_000)
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[0] !== 'ELECTRON_RUN_AS_NODE' && entry[1] !== undefined,
    ),
  )
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${testInfo.outputPath('user-data')}`],
    env: environment,
  })
  const original = { name: 'Catalog Worker Test Spell', source: 'PHB', level: 1 }
  const updated = Array.from({ length: 6000 }, (_, index) => ({
    name: `Catalog Worker Spell ${index}`,
    source: 'PHB',
    level: 1,
    entries: ['Added for the catalog refresh test.'],
  }))

  try {
    const page = await app.firstWindow()
    page.setDefaultTimeout(10_000)
    await app.evaluate(
      ({ session }, { fixtureKey, source, original, updated }) => {
        let changed = false
        let release: () => void = () => {}
        let acknowledge: () => void = () => {}
        const gate = new Promise<void>((resolve) => {
          release = resolve
        })
        const requested = new Promise<void>((resolve) => {
          acknowledge = resolve
        })
        const fixture: RefreshFixture = {
          start: () => {
            changed = true
          },
          requested,
          release,
        }
        Object.assign(globalThis, { [fixtureKey]: fixture })
        session.defaultSession.protocol.handle('https', async (request) => {
          const base = `${source}/data/`
          if (!request.url.startsWith(base)) return new Response(null, { status: 404 })
          const path = request.url.slice(base.length)
          const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' }
          if (path === 'spells/index.json')
            return Response.json({ PHB: 'spells-probe.json' }, { headers })
          if (path === 'spells/spells-probe.json') {
            if (changed) {
              acknowledge()
              await gate
            }
            return Response.json(
              { spell: changed ? [original, ...updated] : [original] },
              { headers },
            )
          }
          return new Response(null, { headers, status: 404 })
        })
      },
      { fixtureKey, source, original, updated },
    )

    await page.getByRole('button', { name: 'Get Started' }).click({ timeout: 30_000 })
    const status = page.getByTestId('game-data-status')
    await expect(status).toHaveText('SRD Content Only')
    expect(
      await app.evaluate(({ app }) =>
        app.getAppMetrics().some(({ name }) => name === 'Tavern Born Catalog'),
      ),
    ).toBe(true)

    const imported = JSON.parse(readFileSync('tests/fixtures/equipment-e2e.tbc', 'utf8'))
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import' }).first().click()
    await (await chooser).setFiles({
      name: 'catalog-refresh-hero.tbc',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({ ...imported, name: characterName, background: 'Acolyte', equipment: [] }),
      ),
    })
    await expect(page.getByRole('heading', { level: 3, name: characterName })).toBeVisible()

    await page.getByRole('button', { name: 'Settings' }).click()
    await page.getByRole('tab', { name: 'Game Data', exact: true }).click()
    await page.getByRole('button', { name: 'Add Additional Content' }).click()
    await page.getByLabel('Web Address').fill(source)
    await expect(page.getByText('Compatible game data found')).toBeVisible()
    await page.getByRole('button', { name: 'Add Additional Content' }).click()
    await expect(status).toHaveText('Additional Content Loaded', { timeout: 30_000 })

    const accepted = await catalogStamp(page)
    await page.getByRole('button', { name: 'Check for Updates' }).click()
    await expect(page.getByText('Game data is up to date')).toBeVisible()
    expect(await catalogStamp(page)).toEqual(accepted)

    await app.evaluate(
      (_electron, key) => (Reflect.get(globalThis, key) as RefreshFixture).start(),
      fixtureKey,
    )
    await page.reload()
    await expect(status).toHaveText('Checking for game data updates')
    await app.evaluate(
      (_electron, key) => (Reflect.get(globalThis, key) as RefreshFixture).requested,
      fixtureKey,
    )
    await page.getByRole('button', { name: 'Characters' }).click()

    const wizardStarted = performance.now()
    await page.getByRole('button', { name: 'New Character' }).first().click()
    const wizard = page.getByRole('dialog', { name: 'Create New Character' })
    await expect(wizard.getByLabel('Character Name')).toBeEditable()
    const wizardMs = performance.now() - wizardStarted
    await expect(status).toHaveText('Checking for game data updates')
    await page.keyboard.press('Escape')
    await expect(wizard).toBeHidden()

    const builderStarted = performance.now()
    await page.getByRole('heading', { level: 3, name: characterName }).click()
    await page.getByRole('button', { name: 'Builder' }).click()
    await expect(page.getByRole('complementary', { name: 'Builder navigation' })).toBeVisible()
    const builderMs = performance.now() - builderStarted
    await expect(page.getByRole('banner').getByText(characterName, { exact: true })).toBeVisible()
    await expect(status).toHaveText('Checking for game data updates')
    await page.evaluate(() => {
      let previous = performance.now()
      let maximumGap = 0
      const timer = window.setInterval(() => {
        const now = performance.now()
        maximumGap = Math.max(maximumGap, now - previous)
        previous = now
      }, 16)
      Object.assign(window, {
        catalogRefreshFrameGap: () => {
          window.clearInterval(timer)
          return maximumGap
        },
      })
    })
    await app.evaluate(
      (_electron, key) => (Reflect.get(globalThis, key) as RefreshFixture).release(),
      fixtureKey,
    )

    const update = page.getByRole('link', { name: 'Game data update available' })
    await expect(update).toBeVisible({ timeout: 30_000 })
    const maximumTimerGapMs = await page.evaluate(() =>
      Reflect.get(window, 'catalogRefreshFrameGap')(),
    )
    expect(await catalogStamp(page)).toEqual(accepted)
    await expect(page.getByRole('complementary', { name: 'Builder navigation' })).toBeVisible()
    await update.click()
    await page.getByRole('button', { name: 'Apply game data update' }).click()
    await expect(status).toHaveText('Additional Content Loaded')
    await expect(update).toBeHidden()
    const applied = await catalogStamp(page, true)
    expect(applied.contentFingerprint).not.toBe(accepted.contentFingerprint)
    await page.reload()
    await expect(status).toHaveText('Additional Content Loaded')
    const repaired = await catalogStamp(page)
    expect(repaired.hasLookups).toBe(true)
    expect(repaired.contentFingerprint).toBe(applied.contentFingerprint)
    expect(repaired.generation).not.toBe(applied.generation)
    await testInfo.attach('interaction-timings', {
      contentType: 'application/json',
      body: JSON.stringify({ wizardMs, builderMs, maximumTimerGapMs }),
    })
  } finally {
    await app
      .evaluate(
        (_electron, key) => (Reflect.get(globalThis, key) as RefreshFixture | undefined)?.release(),
        fixtureKey,
      )
      .catch(() => undefined)
    await app.close()
  }
})
