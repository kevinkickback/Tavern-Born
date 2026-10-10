import { describe, expect, test } from 'vitest'
import { applyClassProgressionUpdate } from '@/lib/character/commands/classCommands'
import {
  commitFeatOptionsCommand,
  editFeatOptionsCommand,
  removeFeatChoiceCommand,
  replaceClassFeatSelectionsCommand,
  resolveFeatChoiceCommand,
} from '@/lib/character/commands/featCommands'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

function apply(
  character: ReturnType<typeof makeCharacterFixture>,
  result: ReturnType<typeof commitFeatOptionsCommand>,
) {
  return { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
}

function configuredChoice(refs: Array<{ name: string; source?: string }>): Character {
  let character = makeCharacterFixture({ feats: [], specialFeats: [] })
  const sourceTag = makeSourceTag('race', character.race, 'choice', character.raceSource)
  character.provenance.choices = [
    {
      id: 'race-feat-choice',
      domain: 'feats',
      sourceTag,
      chooseCount: refs.length,
      optionPool: [],
      selected: refs.map((ref) => ref.name),
      status: 'resolved',
      selectedRefs: refs,
    },
  ]
  for (const [index, ref] of refs.entries()) {
    character.provenance = addGrant(character.provenance, 'feats', ref.name, sourceTag)
    character = apply(
      character,
      commitFeatOptionsCommand(
        character,
        character.provenance,
        { ...ref, provenanceChoiceId: 'race-feat-choice' },
        { skills: [index ? 'History' : 'Arcana'] },
      ),
    )
  }
  return characterPersistenceSchema.parse(character)
}

describe('feat choice complete identity through removal', () => {
  test('choice setup, replacement and removal preserve another domain sharing the issued ID', () => {
    let character = configuredChoice([{ name: 'Training', source: 'One' }])
    const other = {
      id: 'race-feat-choice',
      domain: 'skills' as const,
      sourceTag: makeSourceTag('manual', 'User Choice', 'placeholder'),
      chooseCount: 1,
      optionPool: ['Nature'],
      selected: [],
      status: 'pending' as const,
    }
    character.provenance.choices.push(other)
    characterPersistenceSchema.parse(character)
    const target = { name: 'Training', source: 'One', provenanceChoiceId: 'race-feat-choice' }
    character = apply(
      character,
      editFeatOptionsCommand(
        character,
        character.provenance,
        target,
        { skills: ['Arcana'] },
        { skills: ['History'] },
      ),
    )
    expect(character.provenance.choices[1]).toEqual(other)
    character = apply(
      character,
      resolveFeatChoiceCommand(character, character.provenance, 'race-feat-choice', {
        name: 'Other Training',
        source: 'Two',
      }),
    )
    expect(character.provenance.choices[1]).toEqual(other)
    character = apply(
      character,
      commitFeatOptionsCommand(
        character,
        character.provenance,
        { ...target, name: 'Other Training', source: 'Two' },
        { skills: ['History'] },
      ),
    )
    expect(character.provenance.choices[1]).toEqual(other)
    character = apply(
      character,
      removeFeatChoiceCommand(
        character,
        character.provenance,
        'race-feat-choice',
        'Other Training',
        'Two',
      ),
    )
    expect(character.provenance.choices[1]).toEqual(other)
    expect(character.proficiencies.skills).toEqual([])
    characterPersistenceSchema.parse(character)
  })

  test('duplicate feat choice IDs reject setup, reselection and removal without choosing an owner', () => {
    const character = configuredChoice([{ name: 'Training', source: 'One' }])
    character.provenance.choices.push(structuredClone(character.provenance.choices[0]))
    for (const result of [
      commitFeatOptionsCommand(
        character,
        character.provenance,
        { name: 'Training', source: 'One', provenanceChoiceId: 'race-feat-choice' },
        { skills: ['History'] },
      ),
      resolveFeatChoiceCommand(character, character.provenance, 'race-feat-choice', {
        name: 'Other',
        source: 'Two',
      }),
      removeFeatChoiceCommand(
        character,
        character.provenance,
        'race-feat-choice',
        'Training',
        'One',
      ),
    ])
      expect(result).toEqual({ characterPatch: {}, provenanceUpdate: character.provenance })
    expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
  })

  test('name-only selections require explicit reselection before configuring a printing', () => {
    const character = makeCharacterFixture({ feats: [], specialFeats: [] })
    const sourceTag = makeSourceTag('race', character.race, 'choice', character.raceSource)
    character.provenance.choices = [
      {
        id: 'race-feat-choice',
        domain: 'feats',
        sourceTag,
        chooseCount: 1,
        optionPool: [],
        selected: ['Training'],
        status: 'resolved',
      },
    ]
    character.provenance = addGrant(character.provenance, 'feats', 'Training', sourceTag)
    characterPersistenceSchema.parse(character)
    const before = structuredClone(character)
    const target = { name: 'Training', source: 'One', provenanceChoiceId: 'race-feat-choice' }
    for (const result of [
      commitFeatOptionsCommand(character, character.provenance, target, { skills: ['History'] }),
      editFeatOptionsCommand(
        character,
        character.provenance,
        target,
        { skills: ['Arcana'] },
        { skills: ['History'] },
      ),
      commitFeatOptionsCommand(
        character,
        character.provenance,
        { ...target, source: undefined },
        {},
      ),
    ])
      expect(result).toEqual({ characterPatch: {}, provenanceUpdate: character.provenance })
    expect(character).toEqual(before)
    const selected = apply(
      character,
      resolveFeatChoiceCommand(character, character.provenance, 'race-feat-choice', {
        name: 'Training',
        source: 'Two',
      }),
    )
    const configured = apply(
      selected,
      commitFeatOptionsCommand(
        selected,
        selected.provenance,
        { ...target, source: 'Two' },
        { skills: ['History'] },
      ),
    )
    expect(configured.provenance.choices[0].selectedRefs).toEqual([
      { name: 'Training', source: 'Two', options: { skills: ['History'] } },
    ])
    expect(configured.proficiencies.skills).toContain('history')
    characterPersistenceSchema.parse(configured)
  })

  test.each([
    undefined,
    '',
  ])('configured name-only reference %s rejects even with empty options', (source) => {
    const character = configuredChoice([{ name: 'Training', source: 'One' }])
    character.provenance.choices[0].selectedRefs = [{ name: 'Training', source, options: {} }]
    character.provenance.proficiencies.skills = {}
    character.proficiencies.skills = []
    expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
  })

  test.each([
    'missing',
    'unconfigured',
    'different',
    'duplicate',
  ])('choice setup ownership rejects an %s saved target', (kind) => {
    const character = configuredChoice([{ name: 'Training', source: 'One' }])
    const choice = character.provenance.choices[0]
    if (kind === 'missing') choice.selectedRefs = undefined
    if (kind === 'unconfigured') choice.selectedRefs = [{ name: 'Training', source: 'One' }]
    if (kind === 'different') choice.selectedRefs![0].source = 'Two'
    if (kind === 'duplicate') choice.selectedRefs!.push({ ...choice.selectedRefs![0] })
    const before = structuredClone(character)
    expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
    expect(character).toEqual(before)
  })

  test.each([
    'Training',
    'Training|HB',
  ])('removes only the literal provenance target %s', (removed) => {
    const character = configuredChoice([
      { name: 'Training|HB', source: 'One' },
      { name: 'Training', source: 'One' },
    ])
    const before = structuredClone(character)
    const result = apply(
      character,
      removeFeatChoiceCommand(character, character.provenance, 'race-feat-choice', removed, 'One'),
    )
    const retained = removed === 'Training' ? 'Training|HB' : 'Training'
    const retainedSkill = removed === 'Training' ? 'arcana' : 'history'
    expect(result.provenance.choices[0].selectedRefs).toEqual([
      {
        name: retained,
        source: 'One',
        options: { skills: [removed === 'Training' ? 'Arcana' : 'History'] },
      },
    ])
    expect(result.proficiencies.skills).toEqual([retainedSkill])
    expect(result.provenance.proficiencies.skills[retainedSkill]).toHaveLength(1)
    expect(result.provenance.feats.training).toHaveLength(1)
    characterPersistenceSchema.parse(result)
    expect(character).toEqual(before)
  })

  test('removal normalizes complete fields and retains another printing in the same bucket', () => {
    const character = configuredChoice([
      { name: 'Training', source: 'One' },
      { name: 'Training', source: 'Two' },
    ])
    const result = apply(
      character,
      removeFeatChoiceCommand(
        character,
        character.provenance,
        'race-feat-choice',
        ' TRAINING ',
        ' one ',
      ),
    )
    expect(result.provenance.choices[0].selectedRefs).toEqual([
      { name: 'Training', source: 'Two', options: { skills: ['History'] } },
    ])
    expect(result.proficiencies.skills).toEqual(['history'])
    expect(result.provenance.feats.training).toHaveLength(1)
    characterPersistenceSchema.parse(result)
  })

  test.each([
    undefined,
    'Three',
  ])('absent or ambiguous printing %s leaves the complete draft intact', (source) => {
    const character = configuredChoice([
      { name: 'Training', source: 'One' },
      { name: 'Training', source: 'Two' },
    ])
    const result = removeFeatChoiceCommand(
      character,
      character.provenance,
      'race-feat-choice',
      'Training',
      source,
    )
    expect(result).toEqual({ characterPatch: {}, provenanceUpdate: character.provenance })
    expect(result.provenanceUpdate).toBe(character.provenance)
  })

  test('omitted source removes a unique literal reference without truncating its name', () => {
    const character = configuredChoice([
      { name: 'Training|HB', source: 'One' },
      { name: 'Training', source: 'Two' },
    ])
    const result = apply(
      character,
      removeFeatChoiceCommand(character, character.provenance, 'race-feat-choice', ' Training|HB '),
    )
    expect(
      result.provenance.choices[0].selectedRefs?.map(({ name, source }) => ({ name, source })),
    ).toEqual([{ name: 'Training', source: 'Two' }])
    expect(result.proficiencies.skills).toEqual(['history'])
    expect(result.provenance.feats.training).toHaveLength(1)
  })

  function classChoices(
    refs = [
      { name: 'A-B', source: 'C' },
      { name: 'A', source: 'B-C' },
    ],
  ) {
    let character = makeCharacterFixture({
      feats: [],
      specialFeats: [],
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 2 }],
    })
    character = apply(
      character,
      replaceClassFeatSelectionsCommand(
        character,
        character.provenance,
        {
          className: 'Fighter',
          classSource: 'PHB',
          progressionName: 'Training',
          categories: ['G'],
          slotLevels: [1, 2],
        },
        refs,
      ),
    )
    const choiceId = character.classFeatChoices![0].id
    for (const [index, ref] of refs.entries())
      character = apply(
        character,
        commitFeatOptionsCommand(
          character,
          character.provenance,
          { ...ref, classFeatChoiceId: choiceId },
          { skills: [index ? 'History' : 'Arcana'] },
        ),
      )
    characterPersistenceSchema.parse(character)
    return character
  }

  test('class choice records have distinct IDs for separate literal fields', () => {
    const character = classChoices()
    const ids = character.classFeatChoices![0].feats.map((feat) => feat.id)
    expect(new Set(ids).size).toBe(2)
  })

  test('class level reduction retracts the removed record even when issued IDs collide', () => {
    const character = classChoices()
    character.classFeatChoices![0].feats.forEach((feat) => {
      feat.id = 'previously-issued-collision'
    })
    characterPersistenceSchema.parse(character)
    const before = structuredClone(character)
    const result = apply(
      character,
      applyClassProgressionUpdate(character, character.provenance, [
        { name: 'Fighter', source: 'PHB', levels: 1 },
      ]),
    )
    expect(result.classFeatChoices![0].feats.map(({ name, source }) => ({ name, source }))).toEqual(
      [{ name: 'A-B', source: 'C' }],
    )
    expect(result.proficiencies.skills).toEqual(['arcana'])
    expect(result.provenance.proficiencies.skills.history).toBeUndefined()
    expect(result.provenance.feats.a).toBeUndefined()
    expect(result.provenance.feats['a-b']).toHaveLength(1)
    characterPersistenceSchema.parse(result)
    expect(character).toEqual(before)
  })

  test.each([
    [
      { name: 'Training', source: 'One' },
      { name: 'Training', source: 'Two' },
    ],
    [
      { name: 'Training|HB', source: 'One' },
      { name: 'Training', source: 'One' },
    ],
  ])('class level reduction preserves the retained aggregate marker: %j', (first, second) => {
    const character = classChoices([first, second])
    const result = apply(
      character,
      applyClassProgressionUpdate(character, character.provenance, [
        { name: 'Fighter', source: 'PHB', levels: 1 },
      ]),
    )
    expect(result.classFeatChoices![0].feats.map(({ name, source }) => ({ name, source }))).toEqual(
      [first],
    )
    expect(result.proficiencies.skills).toEqual(['arcana'])
    expect(result.provenance.feats.training).toHaveLength(1)
    const final = apply(result, applyClassProgressionUpdate(result, result.provenance, []))
    expect(final.classFeatChoices).toEqual([])
    expect(final.proficiencies.skills).toEqual([])
    expect(final.provenance.feats.training).toBeUndefined()
  })

  test('class replacement rejects normalized duplicate references before retracting setup', () => {
    const character = classChoices()
    const choice = character.classFeatChoices![0]
    const result = replaceClassFeatSelectionsCommand(
      character,
      character.provenance,
      { ...choice, slotLevels: [1, 2] },
      [
        { name: 'Training', source: 'One' },
        { name: ' TRAINING ', source: ' one ' },
      ],
    )
    expect(result).toEqual({ characterPatch: {}, provenanceUpdate: character.provenance })
  })
})
