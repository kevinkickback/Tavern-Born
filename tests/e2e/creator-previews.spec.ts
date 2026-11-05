import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { associateItemTypeEntries } from '@/lib/5etools/itemTypeEntries'
import { parseItems } from '@/lib/5etools/parsers/basic'
import type { GameData, Item5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { MINIMAL_GAME_DATA, seedAppState } from './helpers/startup'

const longText = Array.from({ length: 24 }, (_, index) => `Reading guidance ${index + 1}.`)
const items = associateItemTypeEntries(
  parseItems({
    baseitem: [
      {
        name: 'Mace',
        source: 'PHB',
        type: 'M',
        weaponCategory: 'simple',
        value: 500,
        weight: 4,
        dmg1: '1d6',
        dmgType: 'B',
        entries: ['The mace has an available description.'],
      },
      {
        name: 'Sling',
        source: 'PHB',
        type: 'R',
        weaponCategory: 'simple',
        value: 10,
        weight: 0,
        dmg1: '1d4',
        dmgType: 'B',
      },
      {
        name: 'Reading Lens',
        source: 'TCE',
        type: 'G',
        entries: ['This detail belongs to the draft books.'],
      },
    ],
  }) as Item5e[],
  [
    {
      name: 'Weapon guidance',
      source: 'TCE',
      appliesTo: 'M|PHB',
      entries: ['Supplemental draft guidance.'],
    },
  ],
  [],
)
const GAME_DATA: GameData = {
  ...MINIMAL_GAME_DATA,
  sources: [
    {
      abbreviation: 'PHB',
      name: "Player's Handbook",
      group: 'core',
      year: 2014,
      hasCharacterOptions: true,
    },
    {
      abbreviation: 'TCE',
      name: "Tasha's Cauldron of Everything",
      group: 'supplement',
      year: 2014,
      hasCharacterOptions: true,
    },
  ],
  races: [
    {
      name: 'Human',
      source: 'PHB',
      size: ['M'],
      speed: 30,
      entries: [
        {
          type: 'entries',
          name: 'Nested Reading',
          entries: ['Read {@condition Petrified|PHB} and {@item Reading Lens|TCE}.', ...longText],
        },
      ],
    },
  ],
  classes: [
    {
      name: 'Fighter',
      source: 'PHB',
      hd: { faces: 10, number: 1 },
      proficiency: ['str', 'con'],
      startingProficiencies: {
        weapons: ['simple weapons', '{@item Mace|PHB}', '{@item Sling|PHB}'],
        skills: [],
      },
      classFeatures: [
        {
          name: 'Combat Reading',
          source: 'PHB',
          entries: ['Read {@condition Petrified|PHB} and {@item Reading Lens|TCE}.'],
        },
      ],
      classFeatureRefs: [],
    },
  ],
  backgrounds: [
    {
      name: 'Acolyte',
      source: 'PHB',
      entries: [
        'Read {@item Reading Lens|TCE}.',
        {
          type: 'entries',
          name: 'Feature: Background Reading',
          entries: ['Also read {@item Reading Lens|TCE}.'],
        },
      ],
    },
  ],
  conditions: [
    {
      name: 'Petrified',
      source: 'PHB',
      entries: [
        'A creature may become {@condition Restrained|PHB}.',
        { type: 'entries', entries: longText },
      ],
    },
    { name: 'Restrained', source: 'PHB', entries: ['A restrained creature has limited movement.'] },
  ],
  itemsBase: items,
}

test.use({ viewport: { width: 1280, height: 900 } })

type PreviewFrame = {
  phase: string
  opacity: number
  animating: boolean
  transform: string
  filter: string
  hostX: number
  hostY: number
  pinX: number
  pinY: number
}
type CaptureWindow = Window & {
  __creatorPreviewCapture?: { stopped: boolean; frames: PreviewFrame[] }
}

async function openRace(page: Page) {
  const existing: Character = {
    ...(JSON.parse(readFileSync('tests/fixtures/equipment-e2e.tbc', 'utf8')) as Character),
    name: 'Existing character',
    allowedSources: [],
    originSystem: '2014',
  }
  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-creator-previews',
    gameData: GAME_DATA,
    characters: [existing],
    activeCharacterId: existing.id,
  })
  await page.reload()
  await page.getByRole('heading', { name: 'Existing character', exact: true }).click()
  await expect(
    page.getByRole('banner').getByText('Existing character', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'New Character' }).first().click()
  const wizard = page.getByRole('dialog', { name: 'Create New Character', exact: true })
  await wizard.getByLabel('Character Name').fill('Preview draft')
  await wizard.getByRole('button', { name: 'Next', exact: true }).click()
  await wizard.getByText('5e Legacy (2014)', { exact: true }).click()
  await wizard.getByRole('button', { name: 'Next', exact: true }).click()
  await wizard.getByRole('button', { name: 'None', exact: true }).click()
  await wizard.getByRole('button', { name: /Tasha's Cauldron/ }).click()
  await wizard.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(wizard.getByPlaceholder('Search races...')).toBeVisible()
  return wizard
}

test('creator features share nested pointer corridors, rolling previews and independent scrolling', async ({
  page,
}) => {
  const wizard = await openRace(page)
  const trigger = wizard.getByRole('button', { name: 'Nested Reading', exact: true })
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await trigger.hover()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const parent = page.getByRole('dialog', { name: 'Nested Reading preview', exact: true })
  const child = page.getByRole('dialog', { name: 'Petrified preview', exact: true })
  await parent.getByRole('button', { name: 'Petrified', exact: true }).hover()
  await expect(child).toBeVisible()
  await child.getByText('Petrified', { exact: true }).hover()
  // Exceed the shared dismissal delay after leaving the original feature trigger.
  await page.waitForTimeout(350)
  await expect(parent).toBeVisible()
  await expect(child).toBeVisible()
  const parentScroll = parent.locator('[data-rules-preview-scroll]')
  const childScroll = child.locator('[data-rules-preview-scroll]')
  expect(await childScroll.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true)
  await childScroll.hover()
  await page.mouse.wheel(0, 400)
  await expect.poll(() => childScroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
  await expect.poll(() => parentScroll.evaluate((node) => node.scrollTop)).toBe(0)
  await parent.getByText('Nested Reading', { exact: true }).hover()
  await expect(child).toBeHidden()
  await expect(parent).toBeVisible()
  await parent.getByRole('button', { name: 'Petrified', exact: true }).hover()
  await child.getByRole('button', { name: 'Restrained', exact: true }).hover()
  await expect(page.getByRole('dialog', { name: 'Restrained preview', exact: true })).toBeVisible()
  await expect(parent).toBeHidden()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('[data-rules-preview-layer="transient"]')).toHaveCount(2)
  await page.mouse.move(5, 5)
  await expect(child).toBeHidden()
  await wizard.getByRole('button', { name: 'Next', exact: true }).click()
  await wizard.getByRole('button', { name: 'Combat Reading', exact: true }).hover()
  const classPreview = page.getByRole('dialog', { name: 'Combat Reading preview', exact: true })
  await classPreview.getByRole('button', { name: 'Petrified', exact: true }).hover()
  await child.getByText('Petrified', { exact: true }).hover()
  await page.waitForTimeout(350)
  await expect(classPreview).toBeVisible()
  await expect(child).toBeVisible()
})

test('keyboard pins remain accessible immutable snapshots through step, discard and modal lifetime', async ({
  page,
}) => {
  const wizard = await openRace(page)
  const trigger = wizard.getByRole('button', { name: 'Nested Reading', exact: true })
  const pin = page.getByRole('dialog', { name: 'Nested Reading preview', exact: true })
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await trigger.focus()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await trigger.press('Enter')
  await expect(pin.getByTitle('Unpin tooltip')).toBeFocused()
  expect(await pin.evaluate((node) => Boolean(node.closest('[aria-hidden="true"]')))).toBe(false)
  await pin.getByTitle('Unpin tooltip').press('Escape')
  await expect(pin).toBeHidden()
  await expect(trigger).toBeFocused()
  await page.waitForTimeout(350)
  await expect(pin).toBeHidden()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await trigger.press('Enter')
  await pin.evaluate((node) => node.setAttribute('data-snapshot-sentinel', 'retained'))
  const scroll = pin.locator('[data-rules-preview-scroll]')
  await scroll.hover()
  await page.mouse.wheel(0, 300)
  await expect.poll(() => scroll.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
  const scrollTop = await scroll.evaluate((node) => node.scrollTop)
  const pinPosition = await pin.boundingBox()
  await wizard.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(pin).toHaveAttribute('data-snapshot-sentinel', 'retained')
  await wizard.getByRole('button', { name: 'Cancel', exact: true }).click()
  const discard = page.getByRole('alertdialog', { name: 'Discard character creation?' })
  await expect(discard.getByRole('button', { name: 'Keep editing' })).toBeFocused()
  await expect(page.getByTitle('Unpin tooltip')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Unpin tooltip' })).toHaveCount(0)
  await discard.getByRole('button', { name: 'Keep editing' }).press('Escape')
  await expect(discard).toBeHidden()
  await expect(pin).toHaveAttribute('data-snapshot-sentinel', 'retained')
  await wizard.getByRole('button', { name: 'Cancel', exact: true }).click()
  // Start before closing/reopening actions so the first painted animation frames count.
  await page.evaluate(() => {
    const capture = { stopped: false, frames: [] as PreviewFrame[] }
    ;(window as CaptureWindow).__creatorPreviewCapture = capture
    let sawClosing = false
    const sample = () => {
      if (capture.stopped) return
      const dialog = document.querySelector<HTMLElement>('.character-wizard-modal')
      const host = dialog
        ?.querySelector('[data-slot="dialog-viewport-portal-host"]')
        ?.getBoundingClientRect()
      const pinned = dialog?.querySelector('[data-preview-pinned]')?.getBoundingClientRect()
      if (dialog && host && pinned) {
        const closing = dialog.dataset.state === 'closed'
        if (closing) sawClosing = true
        const style = getComputedStyle(dialog)
        capture.frames.push({
          phase: closing ? 'closing' : sawClosing ? 'reopening' : 'open',
          opacity: Number(style.opacity),
          animating: dialog.getAnimations().some((animation) => animation.playState === 'running'),
          transform: style.transform,
          filter: style.filter,
          hostX: host.x,
          hostY: host.y,
          pinX: pinned.x,
          pinY: pinned.y,
        })
      }
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  await discard.getByRole('button', { name: 'Discard changes' }).click()
  await expect(wizard).toBeHidden()
  await expect
    .poll(() =>
      pin.evaluate(
        (node) => node.closest('[data-rules-preview-root]')?.parentElement === document.body,
      ),
    )
    .toBe(true)
  await expect(pin).toHaveAttribute('data-snapshot-sentinel', 'retained')
  expect(await scroll.evaluate((node) => node.scrollTop)).toBe(scrollTop)
  await page.getByRole('button', { name: 'New Character' }).first().click()
  await expect(wizard.getByLabel('Character Name')).toHaveValue('')
  await wizard.evaluate(async () => {
    for (let frame = 0; frame < 6; frame++) {
      await new Promise(requestAnimationFrame)
    }
  })
  const animationFrames = await page.evaluate(() => {
    const capture = (window as CaptureWindow).__creatorPreviewCapture
    if (!capture) throw new Error('Preview animation capture was not started')
    capture.stopped = true
    delete (window as CaptureWindow).__creatorPreviewCapture
    return capture.frames
  })
  expect(
    animationFrames.some(
      (frame) =>
        frame.phase === 'closing' && frame.animating && frame.opacity > 0 && frame.opacity < 1,
    ),
  ).toBe(true)
  expect(
    animationFrames.some(
      (frame) =>
        frame.phase === 'reopening' && frame.animating && frame.opacity > 0 && frame.opacity < 1,
    ),
  ).toBe(true)
  expect(
    animationFrames.map(
      ({ phase: _phase, opacity: _opacity, animating: _animating, ...frame }) => frame,
    ),
  ).toEqual(
    animationFrames.map(() => ({
      transform: 'none',
      filter: 'none',
      hostX: 0,
      hostY: 0,
      pinX: pinPosition?.x,
      pinY: pinPosition?.y,
    })),
  )
  await expect(pin).toHaveAttribute('data-snapshot-sentinel', 'retained')
  expect(await scroll.evaluate((node) => node.scrollTop)).toBe(scrollTop)
  expect(await pin.evaluate((node) => Boolean(node.closest('[aria-hidden="true"]')))).toBe(false)
  const finalReference = pin.getByRole('button', { name: 'Reading Lens', exact: true })
  await finalReference.focus()
  await finalReference.press('Escape')
  await expect(page.locator('[data-rules-preview-layer="transient"]')).toHaveCount(0)
  await expect(finalReference).toBeFocused()
  await finalReference.press('Tab')
  await expect(wizard.getByLabel('Character Name')).toBeFocused()
  await wizard.getByLabel('Character Name').press('Shift+Tab')
  await expect(finalReference).toBeFocused()
  await finalReference.press('Escape')
  await expect(page.locator('[data-rules-preview-layer="transient"]')).toHaveCount(0)
  await pin.getByTitle('Unpin tooltip').focus()
  await pin.getByTitle('Unpin tooltip').press('Escape')
  await expect(pin).toBeHidden()
  await expect
    .poll(() => wizard.evaluate((node) => node.contains(document.activeElement)))
    .toBe(true)
})

test('portaled select and menu own Escape without discarding an independent pin', async ({
  page,
}) => {
  const wizard = await openRace(page)
  const trigger = wizard.getByRole('button', { name: 'Nested Reading', exact: true })
  await trigger.focus()
  await trigger.press('Enter')
  const pin = page.locator('[data-preview-pinned="true"]')
  await wizard.getByRole('button', { name: 'Back', exact: true }).click()
  await wizard.getByRole('button', { name: 'Back', exact: true }).click()
  await wizard.getByRole('button', { name: 'Back', exact: true }).click()
  const gender = wizard.getByRole('combobox', { name: 'Gender' })
  await gender.click()
  await expect(page.getByRole('option', { name: 'Non-binary', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('option', { name: 'Non-binary', exact: true })).toBeHidden()
  await expect(gender).toBeFocused()
  await expect(gender).toHaveText('Female')
  await expect(pin).toHaveCount(1)
  await wizard.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await expect(wizard).toBeHidden()
  await page.getByRole('button', { name: 'List view', exact: true }).click()
  const actions = page.getByRole('button', { name: 'Actions for Existing character', exact: true })
  await actions.click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(actions).toBeFocused()
  await expect(pin).toHaveCount(1)
  const preview = page.getByRole('dialog', { name: 'Nested Reading preview', exact: true })
  await preview.getByTitle('Unpin tooltip').focus()
  await page.keyboard.press('Escape')
  await expect(preview).toBeHidden()
})

test('draft books supply race, class and background details while linked items retain prose and facts', async ({
  page,
}) => {
  const wizard = await openRace(page)
  await wizard.getByRole('button', { name: 'Nested Reading', exact: true }).hover()
  const racePreview = page.getByRole('dialog', { name: 'Nested Reading preview', exact: true })
  await racePreview.getByRole('button', { name: 'Reading Lens', exact: true }).hover()
  const lens = page.getByRole('dialog', { name: 'Reading Lens preview', exact: true })
  await expect(lens).toContainText('This detail belongs to the draft books.')
  await page.mouse.move(5, 5)
  await expect(lens).toBeHidden()
  await wizard.getByRole('button', { name: 'Next', exact: true }).click()
  await wizard.getByRole('button', { name: 'Combat Reading', exact: true }).hover()
  await page
    .getByRole('dialog', { name: 'Combat Reading preview', exact: true })
    .getByRole('button', { name: 'Reading Lens', exact: true })
    .hover()
  await expect(lens).toContainText('This detail belongs to the draft books.')
  await page.mouse.move(5, 5)
  await expect(lens).toBeHidden()
  await wizard.getByRole('button', { name: 'Mace', exact: true }).hover()
  const mace = page.getByRole('dialog', { name: 'Mace preview', exact: true })
  await expect(mace).toContainText('The mace has an available description.')
  await expect(mace).toContainText('Supplemental draft guidance.')
  await expect(mace).toContainText('5 gp')
  await expect(mace).toContainText('1d6 B')
  await page.mouse.move(5, 5)
  await expect(mace).toBeHidden()
  await wizard.getByRole('button', { name: 'Sling', exact: true }).hover()
  const sling = page.getByRole('dialog', { name: 'Sling preview', exact: true })
  await expect(sling).toContainText('1d4 B')
  await expect(sling).toContainText('1 sp')
  await expect(sling).not.toContainText('The mace has an available description.')
  await expect(sling).not.toContainText('Supplemental draft guidance.')
  await expect(wizard.getByText('simple weapons', { exact: false })).toBeVisible()
  await page.mouse.move(5, 5)
  await expect(sling).toBeHidden()
  await wizard.getByRole('button', { name: 'Next', exact: true }).click()
  const backgroundReferences = wizard.getByRole('button', { name: 'Reading Lens', exact: true })
  await expect(backgroundReferences).toHaveCount(2)
  for (const reference of await backgroundReferences.all()) {
    await reference.hover()
    await expect(lens).toContainText('This detail belongs to the draft books.')
    await page.mouse.move(5, 5)
    await expect(lens).toBeHidden()
  }
})
