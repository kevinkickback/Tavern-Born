import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { buildGameDataLookups } from '@/lib/5etools/lookups'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { BuildReviewPage } from '@/pages/build/review/ReviewPage'
import { useCharacterStore } from '@/store/characterStore'
import { useGameDataStore } from '@/store/gameDataStore'
import type { Class5e, Race5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { resetCharacterStore, setActiveCharacter } from '../fixtures/characterStoreFixtures'
import {
  makeClassFixture,
  makeGameDataFixture,
  makeSpellFixture,
} from '../fixtures/gameDataFixtures'
import { makeNativeRacialCharacter } from '../fixtures/nativeRacialCharacter'

beforeEach(resetCharacterStore)
afterEach(() => {
  cleanup()
  resetCharacterStore()
  useGameDataStore.setState({ gameData: null })
})

async function overview(
  character: Character,
  races: Race5e[],
  classes: Class5e[] = [
    { name: 'Fighter', source: 'PHB', hd: { number: 1, faces: 10 } } as Class5e,
  ],
) {
  const data = makeGameDataFixture({
    races,
    classes,
    spells: ['Light', 'Mage Hand'].map((name) =>
      makeSpellFixture({ name, source: 'PHB', level: 0 }),
    ),
  })
  data.lookups = buildGameDataLookups(data)
  useGameDataStore.setState({ gameData: data })
  setActiveCharacter(characterPersistenceSchema.parse(character))
  render(
    <MemoryRouter initialEntries={['/build/review?section=overview']}>
      <BuildReviewPage />
    </MemoryRouter>,
  )
  await userEvent.setup().click(screen.getByText('Spells & spellcasting'))
  return within(screen.getByText('Spells & spellcasting').closest('details')!)
}

test('actual overview shows independent effect-aware parent/child casting without class limits or slots', async () => {
  const child = {
    name: 'Child',
    source: 'CHILD',
    additionalSpells: [{ ability: 'wis', known: { 1: ['mage hand#c'] } }],
  } as Race5e
  const parent = {
    name: 'Parent',
    source: 'PHB',
    subraces: [child],
    additionalSpells: [{ ability: 'int', known: { 1: ['light#c'] } }],
  } as Race5e
  const character = makeNativeRacialCharacter(parent, child, 5)
  character.allowedSources = ['CHILD']
  character.abilityScores.intelligence = 16
  character.abilityScores.wisdom = 18
  const childId = character.spells.spellProfiles.find((profile) => profile.raceName === 'Child')!.id
  character.manualEffects = [
    {
      id: 'int-boost',
      label: 'Intelligence boost',
      source: { kind: 'manual', name: 'Test' },
      target: { kind: 'ability-score', ability: 'intelligence' },
      operation: { kind: 'add', value: 2 },
    },
    {
      id: 'global-dc',
      label: 'Global casting',
      source: { kind: 'manual', name: 'Test' },
      target: { kind: 'spell-save-dc' },
      operation: { kind: 'add', value: 1 },
    },
    {
      id: 'child-dc',
      label: 'Child casting',
      source: { kind: 'manual', name: 'Test' },
      target: { kind: 'spell-save-dc', profileId: childId },
      operation: { kind: 'add', value: 2 },
    },
    {
      id: 'child-attack',
      label: 'Child attack',
      source: { kind: 'manual', name: 'Test' },
      target: { kind: 'spell-attack', profileId: childId },
      operation: { kind: 'add', value: 3 },
      requirements: [{ kind: 'flag', key: 'active', expected: true }],
    },
  ]
  character.effectFlags = { active: true }
  const section = await overview(character, [parent])
  expect(section.getByText(/intelligence.*Save DC 16.*Spell attack \+7/)).toBeTruthy()
  expect(section.getByText(/wisdom.*Save DC 18.*Spell attack \+10/)).toBeTruthy()
  expect(section.queryByText(/Prepared limit/)).toBeNull()
  expect(section.queryByText('Spell slots')).toBeNull()
  expect(useCharacterStore.getState().activeCharacter).toEqual(character)
})

test('active mandatory suite with no eligible rows still shows its casting summary', async () => {
  const race = {
    name: 'Future caster',
    source: 'PHB',
    additionalSpells: [{ ability: 'int', known: { 5: ['light#c'] } }],
  } as Race5e
  const character = makeNativeRacialCharacter(race)
  character.abilityScores.intelligence = 16
  const section = await overview(character, [race])
  expect(section.getByText('No spells selected.')).toBeTruthy()
  expect(section.getByText(/intelligence.*Save DC 13.*Spell attack \+5/)).toBeTruthy()
})

test('unselected ability remains explicitly unknown despite numeric effects', async () => {
  const race = {
    name: 'Undecided caster',
    source: 'PHB',
    additionalSpells: [{ ability: { choose: ['int', 'wis'] }, known: { 1: ['light#c'] } }],
  } as Race5e
  const character = makeNativeRacialCharacter(race)
  character.manualEffects = [
    {
      id: 'dc',
      label: 'Casting boost',
      source: { kind: 'manual', name: 'Test' },
      target: { kind: 'spell-save-dc' },
      operation: { kind: 'add', value: 10 },
    },
  ]
  const section = await overview(character, [race])
  expect(section.getByText(/Unselected ability.*Save DC —.*Spell attack —/)).toBeTruthy()
})

test('unselected alternative has no active numeric summary', async () => {
  const race = {
    name: 'Alternative caster',
    source: 'PHB',
    additionalSpells: [
      { name: 'First', ability: 'int', known: { 1: ['light#c'] } },
      { name: 'Second', ability: 'wis', known: { 1: ['mage hand#c'] } },
    ],
  } as Race5e
  const section = await overview(makeNativeRacialCharacter(race), [race])
  expect(section.queryByText(/Save DC/)).toBeNull()
})

test('class preparation limits and slot pools remain class-specific beside racial casting', async () => {
  const race = {
    name: 'Racial caster',
    source: 'PHB',
    additionalSpells: [{ ability: 'wis', known: { 1: ['light#c'] } }],
  } as Race5e
  const wizard = makeClassFixture({
    spellcastingAbility: 'int',
    preparedSpells: '<$level$> + <$int_mod$>',
  })
  const character = buildInitialCharacter(
    {
      initial: { name: 'Mixed casters', originSystem: '2014' },
      race,
      classEntity: wizard,
      background: { name: 'Acolyte', source: 'PHB' },
    },
    new Map(),
    () => [],
  )
  character.abilityScores.intelligence = 16
  character.abilityScores.wisdom = 18
  const section = await overview(character, [race], [wizard])
  expect(
    section.getByText(/intelligence.*Save DC 13.*Spell attack \+5.*Prepared limit 4/),
  ).toBeTruthy()
  expect(section.getByText(/wisdom.*Save DC 14.*Spell attack \+6/)).toBeTruthy()
  expect(section.getAllByText(/Prepared limit/)).toHaveLength(1)
  expect(section.getByText('Level 1: 2/2')).toBeTruthy()
})
