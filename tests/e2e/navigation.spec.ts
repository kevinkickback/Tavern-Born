import { readFileSync } from 'node:fs'
import { expect, type Locator, type Page, test } from '@playwright/test'
import { getReleaseHistory } from '@/lib/changelog'
import { makeSpellFixture } from '../fixtures/gameDataFixtures'
import { MINIMAL_GAME_DATA, seedAppState } from './helpers/startup'

function seedBundledCache(page: Page) {
  return seedAppState(page, {
    sourcePath: 'srd/core',
    gameData: { ...MINIMAL_GAME_DATA, spells: [makeSpellFixture()] },
    dataSourceConfig: {
      type: 'bundled',
      path: 'srd/core',
      packId: 'tavern-born-srd-core',
      packVersion: '1.0.0',
      isValid: true,
    },
  })
}

async function holdCharacterLibrary(page: Page) {
  let requested = false
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(/\/src\/pages\/HomePage\.tsx(?:\?|$)/, async (route) => {
    requested = true
    await gate
    await route.continue()
  })
  return { requested: () => requested, release }
}

const startupThemes = [
  {
    appearance: 'light',
    accent: 'radiant',
    background: 'rgb(205, 206, 214)',
    perimeter: 'rgb(219, 182, 92)',
  },
  {
    appearance: 'dark',
    accent: 'rose',
    background: 'rgb(17, 17, 19)',
    perimeter: 'rgb(184, 63, 75)',
  },
] as const

for (const { appearance, accent, background, perimeter } of startupThemes) {
  test(`matches the two startup overlays with web fonts blocked (${appearance})`, async ({
    page,
  }) => {
    await page.addInitScript(
      ({ appearance, accent }) => {
        localStorage.setItem('tb.theme.appearance', appearance)
        localStorage.setItem('tb.theme.accent', accent)
      },
      { appearance, accent },
    )
    await page.route('https://fonts.googleapis.com/**', (route) => route.abort())
    await page.route('https://fonts.gstatic.com/**', (route) => route.abort())

    let releaseRenderer = () => {}
    const rendererGate = new Promise<void>((resolve) => {
      releaseRenderer = resolve
    })
    await page.route('**/src/main.tsx', async (route) => {
      await rendererGate
      await route.continue()
    })
    const home = await holdCharacterLibrary(page)

    async function inspect(screen: Locator) {
      await expect(screen).toBeVisible()
      return screen.evaluate(async (overlay) => {
        await document.fonts.ready
        const heading = overlay.querySelector('h1')!
        const track = overlay.querySelector('.startup-track')!
        const bar = track.querySelector('.startup-indeterminate')!
        const overlayStyle = getComputedStyle(overlay)
        const frameStyle = getComputedStyle(overlay, '::before')
        const headingStyle = getComputedStyle(heading)
        const pixel = new OffscreenCanvas(1, 1).getContext('2d')!
        function luminance(element: Element) {
          pixel.fillStyle = getComputedStyle(element).backgroundColor
          pixel.fillRect(0, 0, 1, 1)
          const channels = [...pixel.getImageData(0, 0, 1, 1).data].map((value) => {
            const srgb = value / 255
            return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
          })
          return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
        }
        const [dim, bright] = [luminance(track), luminance(bar)].sort((a, b) => a - b)
        return {
          background: overlayStyle.backgroundColor,
          frame: frameStyle.borderTopColor,
          frameWidth: frameStyle.borderTopWidth,
          outline: overlayStyle.outlineStyle,
          font: headingStyle.fontFamily,
          fontLoaded: [...document.fonts].some(
            (font) =>
              font.family.replace(/^"|"$/g, '') === 'Cinzel Startup' && font.status === 'loaded',
          ),
          headingTop: heading.getBoundingClientRect().top,
          trackTop: track.getBoundingClientRect().top,
          trackWidth: track.getBoundingClientRect().width,
          indicatorContrast: (bright + 0.05) / (dim + 0.05),
        }
      })
    }

    try {
      await page.goto('/', { waitUntil: 'commit' })
      const first = await inspect(page.locator('#tb-pre-loader'))
      expect(first).toMatchObject({
        background,
        frame: perimeter,
        frameWidth: '1px',
        outline: 'none',
        font: '"Cinzel Startup", serif',
        fontLoaded: true,
      })
      expect(first.indicatorContrast).toBeGreaterThanOrEqual(3)

      releaseRenderer()
      const second = page.getByTestId('app-loading-overlay')
      await expect(second).toBeFocused()
      expect(await inspect(second)).toEqual(first)
      // The saved interface scale is applied after React starts.
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '120%'
      })
      expect(await inspect(second)).toEqual(first)
    } finally {
      releaseRenderer()
      home.release()
    }
  })
}

for (const initialHash of ['', '#/build']) {
  test(`keeps the startup overlay visible until the Character Library is ready (${initialHash || 'home'})`, async ({
    page,
  }) => {
    const reducedMotion = initialHash !== ''
    await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' })
    await page.goto('/')
    await seedBundledCache(page)
    await page.evaluate((hash) => {
      localStorage.setItem('tb:bundled-srd-intro:v1', '1')
      history.replaceState(null, '', hash || '/')
    }, initialHash)

    const home = await holdCharacterLibrary(page)

    try {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect.poll(home.requested).toBe(true)
      await expect(page.getByTestId('game-data-status')).toHaveText('SRD Content Only')
      const overlay = page.getByTestId('app-loading-overlay')
      await expect(overlay).toContainText('Opening your workspace…')
      await expect(page.getByText('Loading page…')).toBeHidden()

      await overlay.evaluate((element) => {
        const observer = new MutationObserver(() => {
          if (element.querySelector('[role="status"]')?.textContent?.trim() !== 'Ready') return
          const { animationDelay, animationDuration } = getComputedStyle(element)
          const check = element.querySelector('[data-testid="startup-ready-check"]')
          Reflect.set(window, 'startupExit', {
            animationDelay,
            animationDuration,
            checkAnimation: check ? getComputedStyle(check).animationName !== 'none' : null,
            busy: element.getAttribute('aria-busy'),
            workspaceInert: document
              .getElementById('app-interactive-content')
              ?.hasAttribute('inert'),
          })
          observer.disconnect()
        })
        observer.observe(element, { childList: true, characterData: true, subtree: true })
      })
      home.release()
      await expect(overlay).toBeHidden()
      expect(await page.evaluate(() => Reflect.get(window, 'startupExit'))).toEqual({
        animationDelay: '0.5s',
        animationDuration: '0.16s',
        checkAnimation: !reducedMotion,
        busy: 'false',
        workspaceInert: true,
      })
      await expect(page.getByRole('button', { name: 'New Character' }).first()).toBeVisible()
    } finally {
      home.release()
    }
  })
}

test('opens source recovery while the first workspace is still loading', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'electronAPI', {
      value: {
        getBundledManifest: () => Promise.reject(new Error('Included SRD is unavailable')),
        getAppVersion: () => Promise.resolve('0.0.0'),
        onConfirmClose: () => () => {},
      },
    })
  })
  const home = await holdCharacterLibrary(page)

  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect.poll(home.requested).toBe(true)
    await page.getByRole('button', { name: 'Change source' }).click()
    await expect(page.getByRole('dialog', { name: 'Choose Game Data' })).toBeVisible()
    await expect(page.getByLabel('Web Address')).toBeEditable()
    await expect(page.getByTestId('app-loading-overlay')).toBeHidden()
  } finally {
    home.release()
  }
})

test('opens an update requested from the toast after the startup overlay clears', async ({
  page,
}) => {
  await page.goto('/')
  await seedBundledCache(page)
  await page.evaluate(() => localStorage.setItem('tb:bundled-srd-intro:v1', '1'))
  await page.addInitScript(() => {
    Object.defineProperty(window, 'electronAPI', {
      value: {
        getAppVersion: () => Promise.resolve('0.0.0'),
        onConfirmClose: () => () => {},
        onUpdateAvailable: (
          callback: (update: {
            version: string
            changelog: string
            useReleaseDownloadPage: boolean
          }) => void,
        ) => {
          queueMicrotask(() =>
            callback({
              version: '1.2.3',
              changelog: 'Notes for the incoming release',
              useReleaseDownloadPage: false,
            }),
          )
          return () => {}
        },
      },
    })
  })
  const home = await holdCharacterLibrary(page)

  try {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect.poll(home.requested).toBe(true)
    const overlay = page.getByTestId('app-loading-overlay')
    await expect(overlay).toContainText('Opening your workspace…')
    await page.getByRole('button', { name: 'View', exact: true }).click()
    const update = page.getByRole('dialog', { name: 'Update Available — v1.2.3' })
    await expect(update).toBeHidden()
    await expect(overlay).toBeVisible()

    home.release()
    await expect(overlay).toBeHidden()
    await expect(update).toBeVisible()
    await expect(update.getByRole('region', { name: 'Release notes' })).toHaveText(
      'Notes for the incoming release',
    )
    await expect(update.getByRole('button', { name: 'Download', exact: true })).toBeVisible()
  } finally {
    home.release()
  }
})

test('browses bundled changelog history offline and fits the viewport', async ({ page }) => {
  await page.goto('/')
  await seedBundledCache(page)
  await page.evaluate(() => localStorage.setItem('tb:bundled-srd-intro:v1', '1'))
  const history = getReleaseHistory(readFileSync('docs/changelog.md', 'utf8'), '0.7.0')
  await page.addInitScript((releases) => {
    Object.defineProperty(window, 'electronAPI', {
      value: {
        getAppVersion: async () => '0.7.0',
        getReleaseHistory: async () => releases,
        onConfirmClose: () => () => {},
      },
    })
  }, history)
  await page.evaluate(() => window.history.replaceState(null, '', '#/settings'))
  await page.reload()
  const openChangelog = page.getByRole('button', { name: 'Changelog (v0.7.0)' })
  await expect(openChangelog).toBeVisible()
  await page.context().setOffline(true)

  await page.setViewportSize({ width: 500, height: 420 })
  await openChangelog.click()
  const dialog = page.getByRole('dialog')
  const notes = dialog.getByRole('region', { name: 'Release notes' })
  const selector = dialog.getByRole('combobox', { name: 'Release version' })
  await expect(dialog).toHaveAccessibleName('Changelog — v0.7.0')
  await expect(notes).toContainText('Significantly expanded level 1–20 progression')
  await expect(notes.getByRole('heading', { name: /Changes/ })).toHaveCSS('font-weight', '600')
  await expect(notes.getByRole('list').first()).toHaveCSS('list-style-type', 'disc')
  await expect(dialog.getByRole('button', { name: 'Close', exact: true }).first()).toBeInViewport()
  await expect.poll(() => notes.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        const { top, bottom } = element.getBoundingClientRect()
        const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
        return {
          clearsTitleBar: top >= rem * 2 + 7.5,
          clearsBottom: window.innerHeight - bottom >= rem - 0.5,
        }
      }),
    )
    .toEqual({ clearsTitleBar: true, clearsBottom: true })
  const compactBounds = (await dialog.boundingBox())!
  const titleBounds = (await dialog
    .getByRole('heading', { name: 'Changelog — v0.7.0' })
    .boundingBox())!
  const selectorBounds = (await selector.boundingBox())!
  const closeBounds = (await dialog
    .getByRole('button', { name: 'Close', exact: true })
    .last()
    .boundingBox())!
  expect(selectorBounds.x).toBeGreaterThan(titleBounds.x)
  expect(selectorBounds.y + selectorBounds.height / 2).toBeCloseTo(
    titleBounds.y + titleBounds.height / 2,
    0,
  )
  expect(selectorBounds.x + selectorBounds.width).toBeLessThan(closeBounds.x)

  await selector.click()
  await expect(page.getByRole('option', { name: 'v0.7.1' })).toHaveCount(0)
  await page.getByRole('option', { name: 'v0.6.0' }).click()
  await expect(dialog).toHaveAccessibleName('Changelog — v0.6.0')
  await expect(notes).toContainText('Added bulk character backup and import')

  await page.setViewportSize({ width: 1440, height: 900 })
  expect((await dialog.boundingBox())?.width).toBeGreaterThan(compactBounds.width)
  await page.keyboard.press('Escape')
  await expect(openChangelog).toBeFocused()
  await openChangelog.click()
  await expect(dialog).toHaveAccessibleName('Changelog — v0.7.0')
})

test('startup data source modal supports remote/local setup flow', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Choose Game Data' }).first()).toBeVisible()
  await seedBundledCache(page)
  await page.evaluate(() => localStorage.removeItem('tb:bundled-srd-intro:v1'))
  await page.reload()

  await expect(page.getByRole('heading', { name: 'Welcome to Tavern Born' })).toBeVisible()
  await expect(page.getByText(/includes the 2014 and 2024 5e SRDs/)).toBeVisible()

  await page.getByRole('button', { name: 'Add Additional Content' }).click()
  await expect(page.getByRole('heading', { name: 'Add Additional Content' })).toBeVisible()
  await expect(page.getByText('Expand your character choices.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Choose a Source' })).toBeVisible()
  await expect(page.getByRole('link', { name: '5etools community wiki' })).toBeVisible()
  await expect(page.getByText(/Select 5etools compatible JSON data/)).toBeVisible()

  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByRole('heading', { name: 'Welcome to Tavern Born' })).toBeVisible()
  await page.getByRole('button', { name: 'Add Additional Content' }).click()

  await expect(page.getByRole('tab', { name: 'Online' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'This Computer' })).toBeVisible()

  await page.getByRole('tab', { name: 'This Computer' }).click()
  await expect(page.getByRole('button', { name: 'Select Folder' })).toBeVisible()

  await page.getByRole('tab', { name: 'Online' }).click()
  await expect(page.getByLabel('Web Address')).toBeVisible()
  await page
    .getByLabel('Web Address')
    .fill('https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/master')
  await expect(page.getByLabel('Web Address')).toHaveValue(
    'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/master',
  )
})
