import { expect, type Page, test } from '@playwright/test'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeKnowledgeFixture } from '../fixtures/knowledgeProficiencyFixtures'
import {
  ensureStartupPromptResolved,
  readPersistedCharacters,
  seedAppState,
  selectCharacterFromHome,
} from './helpers/startup'

async function openLevel(page: Page) {
  await page.getByRole('link', { name: 'Class', exact: true }).click()
  const level = page.getByRole('button', { name: /^Level 3,/ })
  if ((await level.getAttribute('data-state')) === 'closed') await level.click()
}
async function toggle(page: Page, name: string) {
  const modal = page.getByRole('dialog')
  await modal.getByPlaceholder('Search available options').fill(name)
  await modal.getByRole('button', { name: new RegExp('^' + name + '\\b') }).click()
}
test('@focused PSA Knowledge uses shared Class choices with PHB disabled, durable reopen, Edit, Cancel and Clear', async ({
  page,
}) => {
  const f = makeKnowledgeFixture('XPHB', 'PSA', 'Knowledge Domain (PSA)')
  let character = { ...f.character, name: 'PSA source dependency', allowedSources: ['PSA'] }
  const sourcePath = 'e2e-psa-source-dependencies'
  await page.goto('/')
  await ensureStartupPromptResolved(page, sourcePath, f.data)
  await seedAppState(page, {
    sourcePath,
    gameData: f.data,
    characters: [character],
    activeCharacterId: character.id,
  })
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  await openLevel(page)
  for (const [domain, names] of [
    ['expertise', ['Arcana', 'Nature']],
    ['languages', ['Draconic', 'Dwarvish']],
  ] as const) {
    await page
      .getByRole('group', { name: 'Blessings of Knowledge ' + domain, exact: true })
      .getByRole('button', { name: 'Choose', exact: true })
      .click()
    for (const name of names) await toggle(page, name)
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await page.getByRole('button', { name: 'Save character', exact: true }).click()
  await expect
    .poll(
      async () =>
        characterPersistenceSchema.parse(
          (await readPersistedCharacters(page)).find(
            (row) => (row as Character).id === character.id,
          ),
        ).proficiencies.expertise,
    )
    .toEqual(['arcana', 'nature'])
  character = characterPersistenceSchema.parse(
    (await readPersistedCharacters(page)).find((row) => (row as Character).id === character.id),
  )
  expect(character.allowedSources).not.toContain('PHB')
  expect(character.classChoiceSelections?.filter((row) => row.kind === 'proficiency')).toHaveLength(
    2,
  )
  await page.goto('/')
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  await openLevel(page)
  const skills = page.getByRole('group', { name: 'Blessings of Knowledge expertise', exact: true })
  await skills.getByRole('button', { name: 'Edit', exact: true }).click()
  await toggle(page, 'Nature')
  await toggle(page, 'History')
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(skills.getByText('Nature', { exact: true })).toBeVisible()
  await skills.getByRole('button', { name: 'Edit', exact: true }).click()
  await toggle(page, 'Nature')
  await toggle(page, 'History')
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(skills.getByText('History', { exact: true })).toBeVisible()
  await skills.getByRole('button', { name: 'Edit', exact: true }).click()
  await toggle(page, 'Arcana')
  await toggle(page, 'History')
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.getByRole('button', { name: 'Save character', exact: true }).click()
  await expect
    .poll(async () => {
      const saved = characterPersistenceSchema.parse(
        (await readPersistedCharacters(page)).find((row) => (row as Character).id === character.id),
      )
      return {
        skills: saved.proficiencies.skills,
        expertise: saved.proficiencies.expertise,
        languages: saved.proficiencies.languages,
      }
    })
    .toEqual({ skills: [], expertise: [], languages: ['draconic', 'dwarvish'] })
})
