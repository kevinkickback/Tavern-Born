import { expect, test } from '@playwright/test'
import type { GameData } from '@/types/5etools'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { MINIMAL_GAME_DATA, seedAppState, selectCharacterFromHome } from './helpers/startup'

const GAME_DATA: GameData = {
  ...MINIMAL_GAME_DATA,
  skills: [
    { name: 'Acrobatics', ability: 'dex' },
    { name: 'Arcana', ability: 'int' },
  ],
  languages: [
    { name: 'Common', source: 'PHB', type: 'standard' },
    { name: 'Elvish', source: 'PHB', type: 'standard' },
  ],
  sources: [{ abbreviation: 'PHB', name: "Player's Handbook", group: 'core', year: 2014 }],
}

const sourceTag = {
  sourceType: 'background' as const,
  sourceName: 'Acolyte',
  sourceRef: 'PHB',
  grantType: 'choice' as const,
  label: 'Acolyte',
}

test('a proficiency attention link selects its tab once without overriding later navigation', async ({
  page,
}) => {
  const baseCharacter = makeCharacterFixture({
    id: 'proficiency-attention-character',
    name: 'Proficiency Attention',
  })
  const character = {
    ...baseCharacter,
    provenance: {
      ...baseCharacter.provenance!,
      choices: [
        {
          id: 'acolyte-languages',
          domain: 'languages' as const,
          sourceTag,
          chooseCount: 1,
          optionPool: ['Common', 'Elvish'],
          selected: [],
          status: 'pending' as const,
        },
        {
          id: 'fixture-skill',
          domain: 'skills' as const,
          sourceTag,
          chooseCount: 1,
          optionPool: ['Acrobatics', 'Arcana'],
          selected: [],
          status: 'pending' as const,
        },
      ],
    },
  }

  await page.goto('/')
  await seedAppState(page, {
    sourcePath: 'e2e-proficiency-attention-seed',
    gameData: GAME_DATA,
    characters: [character],
    activeCharacterId: character.id,
  })
  await page.reload()
  await selectCharacterFromHome(page, character.name)
  await page.goto('/#/build/proficiencies?attention=choice%3Aacolyte-languages')

  const categoryTabs = page.getByRole('tablist', { name: 'Proficiency category' })
  const languagesTab = categoryTabs.getByRole('tab', { name: /Languages/ })
  const skillsTab = categoryTabs.getByRole('tab', { name: /Skills/ })
  await expect(languagesTab).toHaveAttribute('aria-selected', 'true')
  await page.getByTitle('Choose Common').click()

  await skillsTab.click()
  await expect(skillsTab).toHaveAttribute('aria-selected', 'true')
  await page.getByTitle('Choose Acrobatics').click()

  await expect(skillsTab).toHaveAttribute('aria-selected', 'true')
  await expect(languagesTab).toHaveAttribute('aria-selected', 'false')
})
