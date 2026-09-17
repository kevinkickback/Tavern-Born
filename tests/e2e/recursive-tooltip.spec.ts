import { expect, test } from '@playwright/test'
import type { GameData, Spell5e } from '@/types/5etools'
import { MINIMAL_GAME_DATA, seedAppState } from './helpers/startup'

const greaterRestoration = {
  name: 'Greater Restoration',
  source: 'PHB',
  level: 5,
  school: 'A',
  time: [{ number: 1, unit: 'action' }],
  range: { type: 'point', distance: { type: 'touch' } },
  components: { v: true, s: true },
  duration: [{ type: 'instant' }],
  entries: [
    'The spell can end the {@condition Petrified|PHB} condition.',
    ...Array.from(
      { length: 24 },
      (_, index) => `Additional restoration guidance paragraph ${index + 1}.`,
    ),
  ],
} as Spell5e

const TOOLTIP_GAME_DATA: GameData = {
  ...MINIMAL_GAME_DATA,
  spells: [greaterRestoration],
  conditions: [
    {
      name: 'Root Condition',
      source: 'PHB',
      entries: ['This condition references {@spell Greater Restoration|PHB}.'],
    },
    {
      name: 'Petrified',
      source: 'PHB',
      entries: [
        'A petrified creature is transformed into a solid inanimate substance and may become {@condition Restrained|PHB}.',
        ...Array.from({ length: 24 }, (_, index) => `Petrification guidance ${index + 1}.`),
      ],
    },
    {
      name: 'Restrained',
      source: 'PHB',
      entries: ['A restrained creature may also become {@condition Blinded|PHB}.'],
    },
    { name: 'Blinded', source: 'PHB', entries: ['A blinded creature cannot see.'] },
  ],
}

test('rules previews preserve their spawning surface in a bounded rolling chain', async ({
  page,
}) => {
  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-recursive-tooltip-seed',
    gameData: TOOLTIP_GAME_DATA,
  })
  await page.reload()
  await page.goto('/#/compendium')

  const search = page.getByRole('searchbox', { name: 'Search compendium' })
  await expect(search).toBeVisible()
  await search.fill('Root Condition')
  await page.getByRole('button').filter({ hasText: 'Root Condition' }).click()

  await page.getByRole('button', { name: 'Greater Restoration', exact: true }).hover()
  const rootPreview = page.getByRole('dialog', { name: 'Greater Restoration preview' })
  await expect(rootPreview).toBeVisible()

  const nestedTrigger = rootPreview.locator('[data-hover-name="Petrified"]')
  await nestedTrigger.hover()
  const nestedPreview = page.getByRole('dialog', { name: 'Petrified preview' })
  await expect(nestedPreview).toBeVisible()
  await expect(rootPreview).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(2)
  const rootSlotBeforeRoll = await rootPreview.boundingBox()
  const nestedSlotBeforeRoll = await nestedPreview.boundingBox()
  expect(rootSlotBeforeRoll).not.toBeNull()
  expect(nestedSlotBeforeRoll).not.toBeNull()

  await nestedPreview.evaluate((element) => element.setAttribute('data-test-preserved', 'true'))
  await nestedPreview.getByRole('button', { name: 'Restrained' }).hover()
  const restrainedPreview = page.getByRole('dialog', { name: 'Restrained preview' })
  await expect(restrainedPreview).toBeVisible()
  await expect(rootPreview).toBeHidden()
  await expect(nestedPreview).toHaveAttribute('data-test-preserved', 'true')
  await expect(page.getByRole('dialog')).toHaveCount(2)
  await expect
    .poll(async () => {
      const nested = await nestedPreview.boundingBox()
      const replacement = await restrainedPreview.boundingBox()
      return nested && replacement
        ? {
            nested: { x: Math.round(nested.x), y: Math.round(nested.y) },
            replacement: { x: Math.round(replacement.x), y: Math.round(replacement.y) },
          }
        : null
    })
    .toEqual(
      rootSlotBeforeRoll && nestedSlotBeforeRoll
        ? {
            nested: {
              x: Math.round(nestedSlotBeforeRoll.x),
              y: Math.round(nestedSlotBeforeRoll.y),
            },
            replacement: {
              x: Math.round(rootSlotBeforeRoll.x),
              y: Math.round(rootSlotBeforeRoll.y),
            },
          }
        : null,
    )

  await nestedPreview.getByTitle('Pin tooltip').click()
  await expect(nestedPreview.getByTitle('Unpin tooltip')).toBeVisible()
  await expect(restrainedPreview).toBeHidden()
  await nestedPreview.evaluate((element) => element.setAttribute('data-pinned-sentinel', 'true'))
  const pinnedBoundsBeforeRecursion = await nestedPreview.boundingBox()
  await nestedPreview.getByRole('button', { name: 'Restrained' }).hover()
  await expect(restrainedPreview).toBeVisible()
  await restrainedPreview.getByRole('button', { name: 'Blinded' }).hover()
  const blindedPreview = page.getByRole('dialog', { name: 'Blinded preview' })
  await expect(blindedPreview).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(3)
  await expect(page.locator('[data-rules-preview-corridor]')).toHaveCount(1)
  await expect(nestedPreview).toHaveAttribute('data-pinned-sentinel', 'true')
  await expect(nestedPreview).toContainText('A petrified creature is transformed')
  await expect
    .poll(async () => {
      const bounds = await nestedPreview.boundingBox()
      return bounds ? { x: bounds.x, y: bounds.y } : null
    })
    .toEqual(
      pinnedBoundsBeforeRecursion
        ? { x: pinnedBoundsBeforeRecursion.x, y: pinnedBoundsBeforeRecursion.y }
        : null,
    )

  expect(
    await restrainedPreview.evaluate((element) => element.parentElement === document.body),
  ).toBe(true)

  const rootBounds = await nestedPreview.boundingBox()
  const previewBounds = await restrainedPreview.boundingBox()
  const deepestPreviewBounds = await blindedPreview.boundingBox()
  expect(rootBounds).not.toBeNull()
  expect(previewBounds).not.toBeNull()
  expect(deepestPreviewBounds).not.toBeNull()
  if (!rootBounds || !previewBounds || !deepestPreviewBounds) return

  const doNotOverlap = (
    first: { x: number; y: number; width: number; height: number },
    second: { x: number; y: number; width: number; height: number },
  ) =>
    first.x >= second.x + second.width ||
    first.x + first.width <= second.x ||
    first.y >= second.y + second.height ||
    first.y + first.height <= second.y

  const horizontalGap = Math.min(
    Math.abs(previewBounds.x + previewBounds.width - rootBounds.x),
    Math.abs(previewBounds.x - (rootBounds.x + rootBounds.width)),
  )
  expect(doNotOverlap(previewBounds, rootBounds)).toBe(true)
  expect(doNotOverlap(deepestPreviewBounds, rootBounds)).toBe(true)
  expect(doNotOverlap(deepestPreviewBounds, previewBounds)).toBe(true)
  expect(horizontalGap).toBeLessThanOrEqual(16)

  const stackingOrder = await Promise.all([
    nestedPreview.evaluate((element) => Number(getComputedStyle(element).zIndex)),
    restrainedPreview.evaluate((element) => Number(getComputedStyle(element).zIndex)),
  ])
  expect(stackingOrder[1]).toBeGreaterThan(stackingOrder[0])

  const scrollArea = nestedPreview.locator('.overflow-y-auto').last()
  await expect(scrollArea).toBeVisible()
  const positionBeforeScroll = await restrainedPreview.boundingBox()
  await scrollArea.evaluate((element) => {
    element.scrollTop = 160
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await expect
    .poll(async () => {
      const bounds = await restrainedPreview.boundingBox()
      return bounds ? { x: bounds.x, y: bounds.y } : null
    })
    .toEqual(positionBeforeScroll ? { x: positionBeforeScroll.x, y: positionBeforeScroll.y } : null)

  await scrollArea.evaluate((element) => {
    element.scrollTop = 0
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await page.mouse.move(4, 4)
  await expect(restrainedPreview).toBeHidden()
  await expect(blindedPreview).toBeHidden()
  await expect(nestedPreview).toBeVisible()
  await expect(nestedPreview.getByTitle('Unpin tooltip')).toBeVisible()

  await nestedPreview.getByRole('button', { name: 'Restrained' }).hover()
  await expect(restrainedPreview).toBeVisible()
  await expect(nestedPreview.getByTitle('Unpin tooltip')).toBeVisible()
  await expect(restrainedPreview.getByTitle('Pin tooltip')).toBeVisible()

  await restrainedPreview.getByTitle('Pin tooltip').click()
  await expect(nestedPreview).toBeHidden()
  await expect(restrainedPreview).toBeVisible()
  await expect(restrainedPreview.getByTitle('Unpin tooltip')).toBeVisible()

  await restrainedPreview.getByTitle('Unpin tooltip').click()
  await expect(restrainedPreview).toBeVisible()
  await expect(nestedPreview).toBeHidden()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  const unpinnedBounds = await restrainedPreview.boundingBox()
  const viewport = page.viewportSize()
  expect(unpinnedBounds).not.toBeNull()
  expect(viewport).not.toBeNull()
  if (!unpinnedBounds || !viewport) return
  await page.mouse.move(unpinnedBounds.x > 16 ? 8 : viewport.width - 8, 48)
  await expect(restrainedPreview).toBeHidden()
})
