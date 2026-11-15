import { expect, test } from '@playwright/test'
import { ensureStartupPromptResolved, MINIMAL_GAME_DATA, seedAppState } from './helpers/startup'

const CHARACTER_ROUTES = [
  '/build',
  '/build/race',
  '/build/class',
  '/build/background',
  '/build/proficiencies',
  '/build/ability-scores',
  '/build/adjustments',
  '/feats',
  '/spells',
  '/equipment',
  '/rules',
  '/details',
  '/details/portrait',
  '/details/characteristics',
  '/details/conditions',
  '/sources',
  '/character-sheet',
  '/character-sheet/2014',
  '/character-sheet/2014/official',
  '/character-sheet/2014/custom',
  '/character-sheet/2024',
  '/character-sheet/2024/official',
  '/character-sheet/2024/custom',
] as const

const accentSwatches = [
  ['Infernal', 'rose', '#b83f4b'],
  ['Radiant', 'radiant', '#dbb65c'],
  ['Grove', 'green', '#4f9269'],
  ['Arcane', 'blue', '#617cc5'],
  ['Eldritch', 'violet', '#9564b8'],
  ['Chroma', 'chroma', '#8ab9b2'],
] as const

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-route-guard-seed')
})

test('each appearance accent uses its exact swatch and readable light and dark shades', async ({
  page,
}) => {
  await page.evaluate(async () => {
    const path = '/src/store/appPreferencesStore.ts'
    const { useAppPreferencesStore } = await import(path)
    const storage = useAppPreferencesStore.persist.getOptions().storage
    const existing = await storage.getItem('app-preferences-storage')
    await storage.setItem('app-preferences-storage', {
      state: { ...existing?.state, themeAccent: 'rose' },
      version: 0,
    })
    localStorage.setItem('tb.theme.accent', 'rose')
  })
  await page.goto('/#/settings?section=appearance')
  await page.reload()
  const panel = page.getByRole('region', { name: 'Appearance', exact: true })
  const root = page.locator('#root')
  await expect(panel.getByRole('radio', { name: 'Infernal', exact: true })).toBeChecked()

  for (const mode of ['Light', 'Dark'] as const) {
    await panel.getByText(mode, { exact: true }).click()
    await expect(root).toHaveAttribute('data-appearance', mode.toLowerCase())
    for (const [label, id, hex] of accentSwatches) {
      const radio = panel.getByRole('radio', { name: label, exact: true })
      const swatch = panel.locator(`label [data-accent="${id}"]`)
      const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))
      await expect(swatch).toHaveCSS('background-color', `rgb(${channels.join(', ')})`)
      await panel.getByText(label, { exact: true }).click()
      await expect(radio).toBeChecked()
      await expect(root).toHaveAttribute('data-accent', id)

      const colors = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement)
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')!
        const readColor = (value: string, background?: string) => {
          if (!CSS.supports('color', value)) throw new Error(`Invalid color ${value}`)
          context.clearRect(0, 0, 1, 1)
          if (background) {
            context.fillStyle = background
            context.fillRect(0, 0, 1, 1)
          }
          context.fillStyle = value
          context.fillRect(0, 0, 1, 1)
          return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3)
        }
        const read = (name: string) => readColor(style.getPropertyValue(name).trim())
        const preview = document.createElement('span')
        preview.dataset.rulesPreviewActive = 'true'
        document.body.append(preview)
        const previewStyle = getComputedStyle(preview)
        const result = {
          base: read('--color-accent-9'),
          primary: read('--primary'),
          onPrimary: read('--primary-foreground'),
          sidebar: read('--app-shell'),
          surface: read('--surface-raised'),
          ring: read('--ring'),
          previewText: readColor(previewStyle.color),
          previewSurface: readColor(
            previewStyle.backgroundColor,
            style.getPropertyValue('--surface-raised'),
          ),
        }
        preview.remove()
        return result
      })
      const luminance = ([r, g, b]: number[]) => {
        const linear = (channel: number) => {
          const s = channel / 255
          return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
      }
      const contrast = (a: number[], b: number[]) => {
        const [first, second] = [luminance(a), luminance(b)]
        return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
      }
      expect(colors.base).toEqual(channels)
      expect(contrast(colors.primary, colors.onPrimary)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(colors.primary, colors.sidebar)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(colors.primary, colors.surface)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(colors.ring, colors.sidebar)).toBeGreaterThanOrEqual(3)
      expect(contrast(colors.previewText, colors.previewSurface)).toBeGreaterThanOrEqual(4.5)
    }
  }

  await page.route('**/src/main.tsx', (route) => route.abort())
  await page.reload()
  await expect(page.locator('#tb-pre-loader-bar')).toHaveCSS(
    'background-color',
    'rgb(138, 185, 178)',
  )
  await page.unroute('**/src/main.tsx')
  await page.reload()
  await expect(panel.getByRole('radio', { name: 'Chroma', exact: true })).toBeChecked()
})

test('Compendium source search stays above the app footer with a scrollable list', async ({
  page,
}) => {
  const sources = Array.from({ length: 60 }, (_, index) => ({
    abbreviation: `TEST${index}`,
    name: `Source ${index}`,
    group: 'supplement' as const,
  }))
  await seedAppState(page, {
    sourcePath: 'e2e-compendium-sources',
    gameData: {
      ...MINIMAL_GAME_DATA,
      sources,
      conditions: sources.map((source) => ({
        name: `Condition ${source.name}`,
        source: source.abbreviation,
      })),
    },
  })
  await page.reload()
  await page.goto('/#/compendium')
  const button = page.getByRole('button', { name: 'Sources' })
  const picker = page.getByRole('dialog', { name: 'Filter by source' })
  const search = picker.getByRole('textbox', { name: 'Search sources' })
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 900, height: 480 },
  ]) {
    await page.setViewportSize(viewport)
    await button.click()
    await expect(search).toBeFocused()
    await expect
      .poll(async () => {
        const [menu, main] = await Promise.all([
          picker.boundingBox(),
          page.locator('main').boundingBox(),
        ])
        return menu && main ? main.y + main.height - menu.y - menu.height : 0
      })
      .toBeGreaterThanOrEqual(11)
    await search.fill('test59')
    await expect(picker.getByRole('checkbox')).toHaveCount(1)
    await expect(picker.getByRole('checkbox', { name: /Source 59/ })).toBeVisible()
    await search.press('Escape')
    await expect(picker).toBeHidden()
  }
})

test('every character-only route redirects to the empty library without an active character', async ({
  page,
}) => {
  for (const route of CHARACTER_ROUTES) {
    await test.step(route, async () => {
      await page.goto(`/#${route}`)
      await expect(page).toHaveURL(/\/#\/$/)
      await expect(page.getByRole('heading', { name: 'No Characters Yet' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'New Character' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Import' })).toBeVisible()
    })
  }
})

test('public settings and compendium routes remain available without a character', async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await test.step('settings', async () => {
    await page.goto('/#/settings')
    await expect(page).toHaveURL(/\/#\/settings$/)
    const sidebar = page.getByRole('complementary', { name: 'Settings navigation' })
    await expect(sidebar.getByRole('link')).toHaveText([
      'General',
      'Appearance',
      'Game Data',
      'About',
    ])
    await expect(sidebar.getByRole('link', { name: 'General' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByRole('tablist', { name: 'Settings category' })).toHaveCount(0)

    const appearance = sidebar.getByRole('link', { name: 'Appearance' })
    await appearance.click()
    await expect(page).toHaveURL(/\/#\/settings\?section=appearance$/)
    await expect(appearance).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeAttached()
    await expect(page.getByRole('radio', { name: 'Arcane' })).toBeAttached()

    await page.getByText('Light', { exact: true }).click()
    await expect(page.getByRole('radio', { name: 'Light' })).toBeChecked()
    await page.getByText('Eldritch', { exact: true }).click()
    await expect(page.getByRole('radio', { name: 'Eldritch' })).toBeChecked()
    await sidebar.getByRole('link', { name: 'Game Data', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Game Data', exact: true })).toBeVisible()
    await page.goBack()
    await expect(appearance).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('radio', { name: 'Eldritch' })).toBeChecked()
    expect(pageErrors).toEqual([])
  })

  await test.step('compendium', async () => {
    await page.goto('/#/compendium')
    await expect(page).toHaveURL(/\/#\/compendium$/)
    await expect(page.getByRole('searchbox', { name: 'Search compendium' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible()
  })

  await test.step('character-sheet attribution', async () => {
    await page.goto('/#/settings?section=about#character-sheet-pdf-2014-custom')
    await expect(page.getByRole('link', { name: 'About', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(
      page.getByRole('link', { name: 'MorePurpleMoreBetter (Joost Wijnen)' }),
    ).toBeVisible()
  })

  await test.step('settings bookmarks accepted by the router keep their sidebar context', async () => {
    await page.goto('/#/settings/?section=data#game-data-update')
    const sidebar = page.getByRole('complementary', { name: 'Settings navigation' })
    await expect(sidebar.getByRole('link', { name: 'Game Data', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByRole('region', { name: 'Game Data', exact: true })).toBeVisible()

    await page.goto('/#/Settings?section=about#character-sheet-pdf-2014-custom')
    await expect(sidebar.getByRole('link', { name: 'About', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(
      page.getByRole('heading', { name: 'Settings', level: 1, exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'MorePurpleMoreBetter (Joost Wijnen)' }),
    ).toBeVisible()
    await page.goto('/#/sett%69ngs?section=appearance')
    await expect(sidebar.getByRole('link', { name: 'Appearance' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeAttached()
  })
})
