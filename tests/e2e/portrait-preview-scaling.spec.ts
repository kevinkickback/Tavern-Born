import fs from 'node:fs'
import path from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import {
  ensureStartupPromptResolved,
  seedAppState,
  selectCharacterFromHome,
} from './helpers/startup'

interface PreviewMeasurements {
  previewWidth: number
  canvasWidth: number
  titleHeight: number
}

function measurePreview(page: Page): Promise<PreviewMeasurements> {
  return page.locator('[data-slot="portrait-card-preview"]').evaluate((preview) => {
    const canvas = preview.querySelector<HTMLElement>('[data-slot="portrait-card-preview-canvas"]')
    const title = preview.querySelector<HTMLElement>('h3')
    if (!canvas || !title) throw new Error('Portrait preview is incomplete')

    return {
      previewWidth: preview.getBoundingClientRect().width,
      canvasWidth: canvas.getBoundingClientRect().width,
      titleHeight: title.getBoundingClientRect().height,
    }
  })
}

test('portrait preview enlarges the complete card when its pane expands', async ({ page }) => {
  const fixturePath = path.resolve('tests/fixtures/equipment-e2e.tbc')
  const character = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as { id: string }

  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-portrait-preview-scaling',
    characters: [character],
    activeCharacterId: character.id,
  })
  await page.reload()
  await ensureStartupPromptResolved(page, 'e2e-portrait-preview-scaling')
  await selectCharacterFromHome(page, 'Equipment E2E Hero')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/details/portrait')
  await ensureStartupPromptResolved(page, 'e2e-portrait-preview-scaling')

  const preview = page.locator('[data-slot="portrait-card-preview"]')
  await expect(preview).toBeVisible()
  await expect
    .poll(async () => {
      const measurements = await measurePreview(page)
      return Math.abs(measurements.canvasWidth - measurements.previewWidth)
    })
    .toBeLessThan(2)
  const before = await measurePreview(page)

  await page.getByRole('button', { name: 'Collapse details panel' }).click()
  await expect
    .poll(async () => {
      const measurements = await measurePreview(page)
      return measurements.previewWidth
    })
    .toBeGreaterThan(before.previewWidth * 1.5)
  await expect
    .poll(async () => {
      const measurements = await measurePreview(page)
      return Math.abs(measurements.canvasWidth - measurements.previewWidth)
    })
    .toBeLessThan(2)

  const after = await measurePreview(page)
  expect(after.titleHeight / before.titleHeight).toBeCloseTo(
    after.previewWidth / before.previewWidth,
    1,
  )

  const resetView = page.getByRole('button', { name: 'Reset View' })
  await expect(resetView).toBeVisible()
  const controls = page.locator('[data-slot="portrait-image-controls"]')
  await expect
    .poll(async () => {
      const [previewBounds, controlsBounds] = await Promise.all([
        preview.boundingBox(),
        controls.boundingBox(),
      ])
      if (!previewBounds || !controlsBounds) return Number.POSITIVE_INFINITY
      return Math.abs(previewBounds.width - controlsBounds.width)
    })
    .toBeLessThan(2)
  const previewContent = page.locator('[data-slot="portrait-preview-content"]')
  expect(
    await previewContent.evaluate((content) => content.scrollHeight <= content.clientHeight + 1),
  ).toBe(true)

  await page.getByRole('button', { name: 'Expand details panel' }).click()
  await expect
    .poll(async () => Math.abs((await measurePreview(page)).previewWidth - before.previewWidth))
    .toBeLessThan(2)

  const [restoredPreviewBounds, restoredControlsBounds, previewContentBounds] = await Promise.all([
    preview.boundingBox(),
    controls.boundingBox(),
    previewContent.boundingBox(),
  ])
  expect(restoredPreviewBounds).not.toBeNull()
  expect(restoredControlsBounds).not.toBeNull()
  expect(previewContentBounds).not.toBeNull()
  expect(
    Math.abs((restoredPreviewBounds?.y ?? 0) - ((previewContentBounds?.y ?? 0) + 16)),
  ).toBeLessThan(2)
  expect(
    Math.abs(
      (restoredControlsBounds?.y ?? 0) -
        ((restoredPreviewBounds?.y ?? 0) + (restoredPreviewBounds?.height ?? 0) + 16),
    ),
  ).toBeLessThan(2)
})
