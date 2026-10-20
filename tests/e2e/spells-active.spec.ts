import { expect, test } from '@playwright/test'
import { addSpellToCharacter } from '@/lib/character/commands/spellCommands'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeManagedClassSpellBrowserFixtures } from '../fixtures/managedClassSpellBrowserFixtures'
import { authorManagedClassSpellFixture } from '../fixtures/managedClassSpellFixtures'
import {
  ensureStartupPromptResolved,
  readPersistedCharacters,
  seedAppState,
  selectCharacterFromHome,
} from './helpers/startup'

test('@focused active-character spell workflow: profile switch, independent removal, prepared toggle', async ({
  page,
}) => {
  const fixture = makeManagedClassSpellBrowserFixtures()
  let initial = makeCharacterFixture({
    id: 'spell-e2e-1',
    name: 'Spell E2E',
    allowedSources: ['PHB'],
    classProgression: [
      { name: 'Wizard', source: 'PHB', levels: 2 },
      { name: 'Cleric', source: 'PHB', levels: 1 },
      { name: 'Druid', source: 'PHB', levels: 1 },
    ],
    abilityScores: { ...makeCharacterFixture().abilityScores, intelligence: 16, wisdom: 12 },
  })
  // The Bonus UI locks already-known names; this independent grant precedes class learning.
  const bonus = addSpellToCharacter(
    initial,
    initial.provenance,
    'Magic Missile|PHB',
    'spell',
    'special:unrestricted',
  )
  initial = { ...initial, ...bonus.characterPatch, provenance: bonus.provenanceUpdate }
  const character = authorManagedClassSpellFixture(initial, fixture, [
    {
      owner: initial.classProgression[0],
      domain: 'class-spellbook',
      gain: 1,
      targets: [{ name: 'Magic Missile', source: 'PHB' }],
    },
  ])
  await page.goto('/')
  await ensureStartupPromptResolved(page, 'e2e-spell-seed', fixture.gameData)
  await seedAppState(page, {
    sourcePath: 'e2e-spell-seed',
    gameData: fixture.gameData,
    characters: [character],
    activeCharacterId: character.id,
  })
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  await page.getByRole('link', { name: 'Spells' }).click()
  await expect(page).toHaveURL(/\/spells$/)
  await expect(page.getByRole('heading', { name: 'Spells', exact: true })).toBeVisible()
  const spellViewTabs = page.getByRole('tablist', { name: 'Spell view' })
  const wizardTab = spellViewTabs.getByRole('tab', { name: /Wizard/ })
  const clericTab = spellViewTabs.getByRole('tab', { name: /Cleric/ })
  const druidTab = spellViewTabs.getByRole('tab', { name: /Druid/ })
  await expect(wizardTab).toBeVisible()
  await expect(clericTab).toBeVisible()
  await expect(druidTab).toBeVisible()
  await expect(spellViewTabs.getByRole('tab', { name: /^Class(?:\s+\d+)?$/ })).toHaveCount(0)
  await clericTab.click()
  await expect(clericTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('main').getByText('Cleric (Lv 1)')).toBeVisible()
  await expect(page.locator('main').getByText('Wizard (Lv 2)')).toHaveCount(0)
  await druidTab.click()
  await expect(druidTab).toHaveAttribute('aria-selected', 'true')
  const druidSpells = page.getByRole('region', { name: /Druid/ })
  const entangle = druidSpells
    .getByRole('button', { name: 'Entangle', exact: true })
    .locator('xpath=../..')
  await expect(entangle).toBeVisible()
  await entangle.getByTitle('Not prepared — click to prepare').click()
  await expect(entangle.getByTitle('Prepared — click to unprepare')).toBeVisible()
  await wizardTab.click()
  await expect(wizardTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('main').getByText('Wizard (Lv 2)')).toBeVisible()
  await expect(page.locator('main').getByText('Cleric (Lv 1)')).toHaveCount(0)
  const wizardSpells = page.getByRole('region', { name: /Wizard/ })
  const spellName = wizardSpells.getByRole('button', { name: 'Magic Missile', exact: true })
  const grid = wizardSpells.locator('[data-slot="spell-level-grid"]')
  const columns = () =>
    grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)
  await expect.poll(columns).toBe(1)
  const geometry = await spellName.evaluate((element) => {
    const button = element.getBoundingClientRect()
    const allocated = element.parentElement!.getBoundingClientRect()
    const row = element.closest('.min-h-11')!
    const badge = row.querySelector('span.shrink-0')!.getBoundingClientRect()
    return {
      buttonRight: button.right,
      allocatedRight: allocated.right,
      badgeLeft: badge.left,
      buttonWidth: button.width,
    }
  })
  expect(geometry.buttonRight).toBeLessThanOrEqual(geometry.allocatedRight + 0.5)
  expect(geometry.buttonRight).toBeLessThanOrEqual(geometry.badgeLeft)
  expect(geometry.buttonWidth).toBeGreaterThan(60)
  await spellName.hover()
  const spellPreview = page.getByRole('dialog', { name: 'Magic Missile preview' })
  await expect(spellPreview).toBeVisible()
  await page.waitForTimeout(300)
  await expect(spellPreview).toBeVisible()
  await page.getByRole('heading', { name: 'Spells', exact: true }).hover()
  await expect(spellPreview).toBeHidden()
  await page.setViewportSize({ width: 1536, height: 900 })
  await expect.poll(columns).toBe(2)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await expect.poll(columns).toBe(3)
  await page.setViewportSize({ width: 1280, height: 720 })
  await expect.poll(columns).toBe(1)
  await wizardSpells.getByTitle('Not prepared', { exact: true }).click()
  await expect(wizardSpells.getByTitle('Prepared', { exact: true })).toBeVisible()
  const bonusTab = spellViewTabs.getByRole('tab', { name: /Bonus/ })
  await bonusTab.click()
  const bonusSpells = page.getByRole('region', { name: /Bonus Spells/ })
  await bonusSpells.getByRole('button', { name: 'Remove Magic Missile' }).click()
  await expect(bonusSpells.getByText('Magic Missile')).toHaveCount(0)
  await wizardTab.click()
  await expect(wizardSpells.getByText('Magic Missile', { exact: true })).toBeVisible()
  await expect(wizardSpells.getByTitle('Prepared', { exact: true })).toBeVisible()
  await druidTab.click()
  await expect(entangle.getByTitle('Prepared — click to unprepare')).toBeVisible()
  await page.getByRole('button', { name: 'Save character', exact: true }).click()
  await expect
    .poll(async () => {
      const saved = characterPersistenceSchema.parse(
        (await readPersistedCharacters(page)).find((row) => (row as Character).id === character.id),
      )
      return [
        saved.managedClassSpellChoices?.[0]?.prepare,
        saved.spells.spellProfiles.find((profile) => profile.className === 'Druid')?.preparedSpells,
        saved.spells.spellProfiles.find((profile) => profile.type === 'special')?.spellsKnown,
      ]
    })
    .toEqual([true, ['Entangle|PHB'], []])
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  await page.getByRole('link', { name: 'Spells' }).click()
  await wizardTab.click()
  await expect(wizardSpells.getByTitle('Prepared', { exact: true })).toBeVisible()
  await druidTab.click()
  await expect(entangle.getByTitle('Prepared — click to unprepare')).toBeVisible()
})
