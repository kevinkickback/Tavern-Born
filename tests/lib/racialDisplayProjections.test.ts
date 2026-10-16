import { expect, test } from 'vitest'
import { buildRaceLookup } from '@/lib/5etools/lookups'
import { createCharacterCalculationContext } from '@/lib/calculations/characterCalculationContext'
import { getAllProficiencyRows } from '@/lib/provenance/summaries'
import { getCharacterReadiness } from '@/lib/readiness/characterReadiness'
import { detectSourceConflicts } from '@/lib/sourceConflicts'
import { buildToolChoiceSlots } from '@/pages/build/proficiencies/model/data'
import type { Race5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeNativeRacialCharacter } from '../fixtures/nativeRacialCharacter'

test.each([
  {
    kind: 'suite',
    blocks: [
      { ability: 'int', known: { '1': ['light#c'] } },
      { ability: 'wis', known: { '1': ['mage hand#c'] } },
    ],
    title: 'Choose Elf (High) spell suite',
  },
  {
    kind: 'ability',
    blocks: [{ ability: { choose: ['int', 'wis'] }, known: { '1': ['light#c'] } }],
    title: 'Choose Elf (High) casting ability',
  },
  {
    kind: 'choice',
    blocks: [{ ability: 'int', known: { '1': { _: [{ choose: 'level=0|class=Wizard' }] } } }],
    title: 'Finish Elf (High) spell choices',
  },
])('preserves contextual native $kind readiness across strict reopen and source restoration', ({
  blocks,
  title,
}) => {
  const child = { name: 'High', source: 'PHB', additionalSpells: blocks } as Race5e
  const parent = { name: 'Elf', source: 'PHB', subraces: [child] } as Race5e
  const character = characterPersistenceSchema.parse(makeNativeRacialCharacter(parent, child))
  const profile = character.spells.spellProfiles.find(
    (entry) => entry.racial?.ownerType === 'subrace',
  )!
  const before = JSON.stringify(character)
  let issueId: string | undefined
  for (const races of [[parent], [{ ...parent, subraces: [] }], [], [parent]]) {
    const calculation = createCharacterCalculationContext(character, {
      racesByKey: buildRaceLookup(races),
    })
    const issue = getCharacterReadiness(character, { calculation }).issues.find(
      (entry) => entry.title === title,
    )
    expect(issue).toBeDefined()
    issueId ??= issue!.id
    expect(issue!.id).toBe(issueId)
    expect(JSON.stringify(character)).toBe(before)
  }
  expect(profile.label).toBe('High')
  expect(profile.raceName).toBe('High')
  expect(profile.racial?.context).toEqual({
    parent: { name: 'Elf', source: 'PHB' },
    child: { name: 'High', source: 'PHB' },
  })
  expect(characterPersistenceSchema.parse(JSON.parse(before))).toEqual(character)
})

test('projects saved subrace owners consistently in source and pending-choice messages', () => {
  const child = {
    name: 'High',
    source: 'PHB',
    skillProficiencies: [{ choose: { from: ['arcana', 'history'], count: 1 } }],
    toolProficiencies: [{ anyMusicalInstrument: 1 }],
  } as unknown as Race5e
  const parent = { name: 'Elf', source: 'PHB', subraces: [child] } as Race5e
  const character = characterPersistenceSchema.parse(makeNativeRacialCharacter(parent, child))
  const before = JSON.stringify(character)
  const calculation = createCharacterCalculationContext(character, { racesByKey: {} })
  const issues = getCharacterReadiness(character, { calculation }).issues
  expect(issues.map((issue) => issue.title)).toContain('Restore the source for Elf (High)')
  expect(issues).toContainEqual(
    expect.objectContaining({
      title: 'Finish Elf (High)',
      explanation: expect.stringContaining('Elf (High) offers'),
    }),
  )
  expect(detectSourceConflicts(character, [])).toContainEqual({
    source: 'PHB',
    items: expect.arrayContaining(['Elf (High)']),
  })
  expect(detectSourceConflicts(character, ['PHB'])).toEqual([])
  const rows = getAllProficiencyRows(character.provenance, character)
  expect(rows.pendingChoices.some((row) => row.itemName.includes('from Elf (High) options'))).toBe(
    true,
  )
  const slots = buildToolChoiceSlots({
    choices: character.provenance.choices,
    selection: character,
    selectedTools: [],
    toolSubtypeOptionsByKind: {
      'musical instrument': ['Lute'],
      "artisan's tools": [],
      'gaming set': [],
      tool: ['Lute'],
    },
  })
  expect(slots).toEqual([expect.objectContaining({ sourceName: 'Elf (High)', options: ['Lute'] })])
  expect(slots[0].choiceId).toBe(
    character.provenance.choices.find((choice) => choice.domain === 'tools')!.id,
  )
  expect(JSON.stringify(character)).toBe(before)

  const custom = characterPersistenceSchema.parse(JSON.parse(before))
  const choice = custom.provenance.choices.find((entry) => entry.domain === 'skills')!
  choice.sourceTag.label = 'Ancient knowledge'
  const customBefore = JSON.stringify(custom)
  expect(getCharacterReadiness(custom).issues.map((issue) => issue.title)).toContain(
    'Finish Ancient knowledge',
  )
  expect(JSON.stringify(custom)).toBe(customBefore)
})
