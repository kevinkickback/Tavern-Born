import { beforeEach, expect, test } from 'vitest'
import { INITIAL_CHARACTER_DATA } from '@/components/character/wizard/constants'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { useCharacterStore } from '@/store/characterStore'
import { wizardAbilitiesSchema, wizardRulesSchema } from '@/types/characterSchema'
import { makeClassFixture, makeRaceFixture } from '../fixtures/gameDataFixtures'

beforeEach(() => {
  useCharacterStore.setState({
    characters: [],
    activeCharacterId: null,
    activeCharacter: null,
  })
})

test('wizard starts with the 2014 ruleset and minimum Point Buy scores', () => {
  expect(INITIAL_CHARACTER_DATA.originSystem).toBe('2014')
  expect(INITIAL_CHARACTER_DATA.abilityScoreMethod).toBe('point-buy')
  expect(INITIAL_CHARACTER_DATA.abilityScores).toEqual({
    strength: 8,
    dexterity: 8,
    constitution: 8,
    intelligence: 8,
    wisdom: 8,
    charisma: 8,
  })
})

test('Rules validates the edition and Ability Scores validates the method', () => {
  expect(wizardRulesSchema.safeParse(INITIAL_CHARACTER_DATA).success).toBe(true)
  expect(wizardAbilitiesSchema.safeParse(INITIAL_CHARACTER_DATA).success).toBe(true)
  expect(wizardRulesSchema.safeParse({ originSystem: '' }).success).toBe(false)
  const invalidMethod = { ...INITIAL_CHARACTER_DATA, abilityScoreMethod: '' }
  expect(wizardRulesSchema.safeParse(invalidMethod).success).toBe(true)
  expect(wizardAbilitiesSchema.safeParse(invalidMethod).success).toBe(false)
})

test('wizard creation saves class proficiencies as plain strings', async () => {
  const race = makeRaceFixture({ name: 'Elf', ability: [{ dex: 2, int: 1 }] })
  const classEntity = makeClassFixture({
    name: 'Fighter',
    hd: { faces: 10, number: 1 },
    casterProgression: undefined,
    classFeatures: [],
    startingProficiencies: {
      armor: ['light armor', 'shields'],
      weapons: ['simple weapons', '{@item longsword|PHB}'],
    },
  })
  const background = { name: 'Soldier', source: 'PHB' }
  const initial = buildInitialCharacter(
    { initial: { name: 'Haldir' }, race, classEntity, background },
    new Map(),
    () => [],
  )
  const saved = await useCharacterStore.getState().addCharacter(initial)

  expect(saved).toMatchObject({
    name: 'Haldir',
    race: 'Elf',
    classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
    background: 'Soldier',
    proficiencies: {
      armor: ['light armor', 'shields'],
      weapons: ['simple weapons', 'longsword'],
    },
  })
  expect(useCharacterStore.getState().characters).toEqual([saved])
})

test('character persistence rejects non-string weapon proficiencies', async () => {
  const character = createEmptyCharacter({ name: 'Invalid character' })
  // @ts-expect-error Deliberately pass a malformed proficiency through the save boundary.
  character.proficiencies.weapons = [{ name: 'Longsword' }]

  await expect(useCharacterStore.getState().addCharacter(character)).rejects.toThrow(
    /proficiencies\.weapons/,
  )
  expect(useCharacterStore.getState().characters).toEqual([])
})
