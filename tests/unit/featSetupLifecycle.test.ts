import { describe, expect, test } from 'vitest'
import {
  clearFeatOptionsCommand,
  commitFeatOptionsCommand,
  editFeatOptionsCommand,
  removeFeatChoiceCommand,
  replaceClassFeatSelectionsCommand,
  resolveFeatChoiceCommand,
  retractFeatOptionsCommand,
} from '@/lib/character/commands/featCommands'
import { getFixedFeatOptionKey } from '@/lib/featGrants'
import { makeSourceTag } from '@/lib/provenance'
import type { Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const reference = { name: 'Training', source: 'One' }
const spells = [{ name: 'Spark', source: 'TEST', level: 0 } as Spell5e]
const firstOptions = { skills: ['Arcana'] }
const activeOptions = {
  skills: ['History'],
  expertiseSkill: 'History',
  languages: ['Elvish'],
  tools: ['Herbalism Kit'],
  spells: ['Spark|TEST'],
  abilityScore: 'intelligence',
  optionalFeature: 'Training Feature',
}

function apply(
  character: Character,
  result: ReturnType<typeof commitFeatOptionsCommand>,
): Character {
  const next = { ...character, ...result.characterPatch, provenance: result.provenanceUpdate }
  return characterPersistenceSchema.parse(next)
}

function choiceFixture(): Character {
  const character = makeCharacterFixture({ feats: [], specialFeats: [] })
  character.provenance.choices = ['first', 'second'].map((id) => ({
    id,
    domain: 'feats',
    sourceTag: makeSourceTag('race', character.race, 'placeholder', character.raceSource),
    chooseCount: 1,
    selected: [],
    optionPool: [],
    status: 'pending',
  }))
  return characterPersistenceSchema.parse(character)
}

function ownerFixture(owner: 'fixed' | 'class' | 'choice') {
  let character = choiceFixture()
  let target = { ...reference, fixedGrant: true } as Parameters<typeof commitFeatOptionsCommand>[2]
  if (owner === 'choice') {
    character = apply(
      character,
      resolveFeatChoiceCommand(character, character.provenance, 'first', reference),
    )
    target = { ...reference, provenanceChoiceId: 'first' }
  }
  if (owner === 'class') {
    character = apply(
      character,
      replaceClassFeatSelectionsCommand(
        character,
        character.provenance,
        {
          className: 'Fighter',
          classSource: 'PHB',
          progressionName: 'Training',
          categories: [],
          slotLevels: [1],
        },
        [reference],
      ),
    )
    target = { ...reference, classFeatChoiceId: character.classFeatChoices?.[0].id }
  }
  return { character, target }
}

describe('active feat setup lifecycle', () => {
  test('class removal followed by stale Finish cannot recreate setup benefits', () => {
    let { character, target } = ownerFixture('class')
    character = apply(
      character,
      commitFeatOptionsCommand(character, character.provenance, target, activeOptions, spells),
    )
    character = apply(
      character,
      replaceClassFeatSelectionsCommand(
        character,
        character.provenance,
        {
          className: 'Fighter',
          classSource: 'PHB',
          progressionName: 'Training',
          categories: [],
          slotLevels: [1],
        },
        [],
      ),
    )
    const before = structuredClone(character)
    const result = commitFeatOptionsCommand(
      character,
      character.provenance,
      target,
      activeOptions,
      spells,
    )
    expect(result).toEqual({ characterPatch: {}, provenanceUpdate: character.provenance })
    expect(character).toEqual(before)
    expect(character.proficiencies.skills).toEqual([])
    expect(character.provenance.spells.spark).toBeUndefined()
  })

  test.each([
    'missing choice',
    'different printing',
    'duplicate choice',
    'duplicate reference',
  ])('stale class target rejects all setup commands atomically: %s', (kind) => {
    const fixture = ownerFixture('class')
    const character = fixture.character
    const target = fixture.target
    if (kind === 'missing choice') character.classFeatChoices = []
    if (kind === 'different printing') target.source = 'Other'
    if (kind === 'duplicate choice') {
      character.classFeatChoices?.push(structuredClone(character.classFeatChoices[0]))
    }
    if (kind === 'duplicate reference') {
      const choice = character.classFeatChoices?.[0]
      if (choice) choice.feats.push(structuredClone(choice.feats[0]))
    }
    const before = structuredClone(character)
    const results = [
      commitFeatOptionsCommand(character, character.provenance, target, firstOptions),
      editFeatOptionsCommand(character, character.provenance, target, {}, firstOptions),
      clearFeatOptionsCommand(character, character.provenance, target, firstOptions),
      retractFeatOptionsCommand(character, character.provenance, target, firstOptions),
    ]
    for (const result of results) {
      expect(result).toEqual({ characterPatch: {}, provenanceUpdate: character.provenance })
    }
    expect(character).toEqual(before)
  })

  test.each([
    'fixed',
    'class',
    'choice',
  ] as const)('%s Commit replaces active saved choices and stale Clear retracts every active benefit', (owner) => {
    let { character, target } = ownerFixture(owner)
    character = apply(
      character,
      commitFeatOptionsCommand(character, character.provenance, target, firstOptions),
    )
    character = apply(
      character,
      commitFeatOptionsCommand(character, character.provenance, target, activeOptions, spells),
    )
    expect(character.proficiencies.skills).toEqual(['history'])
    character = apply(
      character,
      clearFeatOptionsCommand(character, character.provenance, target, firstOptions),
    )
    expect(character.proficiencies.skills).toEqual([])
    expect(character.proficiencies.expertise).toEqual([])
    expect(character.proficiencies.languages).toEqual([])
    expect(character.proficiencies.tools).toEqual([])
    expect(character.provenance.abilityBonuses).toEqual([])
    expect(character.provenance.features['training feature']).toBeUndefined()
    expect(character.provenance.spells.spark).toBeUndefined()
    expect(
      character.spells.spellProfiles.find((entry) => entry.type === 'special')?.cantrips,
    ).toEqual([])
    const options =
      owner === 'fixed'
        ? character.fixedFeatOptions?.[getFixedFeatOptionKey(reference.name, reference.source)]
        : owner === 'class'
          ? character.classFeatChoices?.[0].feats[0].options
          : character.provenance.choices[0].selectedRefs?.[0].options
    expect(options).toEqual({})
  })

  test.each([
    'fixed',
    'class',
    'choice',
  ] as const)('%s stale Edit removes current setup while retaining independent ownership', (owner) => {
    let { character, target } = ownerFixture(owner)
    character = apply(
      character,
      commitFeatOptionsCommand(character, character.provenance, target, firstOptions),
    )
    character = apply(
      character,
      editFeatOptionsCommand(
        character,
        character.provenance,
        target,
        firstOptions,
        activeOptions,
        spells,
      ),
    )
    const independent = { ...reference, source: 'Other', fixedGrant: true }
    character = apply(
      character,
      commitFeatOptionsCommand(character, character.provenance, independent, {
        skills: ['History'],
      }),
    )
    character = apply(
      character,
      editFeatOptionsCommand(character, character.provenance, target, firstOptions, {
        skills: ['Nature'],
      }),
    )
    expect(character.proficiencies.skills).toEqual(['history', 'nature'])
    expect(character.proficiencies.expertise).toEqual([])
    expect(character.proficiencies.languages).toEqual([])
    expect(character.proficiencies.tools).toEqual([])
    expect(character.provenance.proficiencies.skills.history).toHaveLength(1)
    expect(character.provenance.abilityBonuses).toEqual([])
    expect(character.provenance.features['training feature']).toBeUndefined()
    expect(character.provenance.spells.spark).toBeUndefined()
  })

  test.each([
    'replace',
    'remove',
  ] as const)('shared source choice marker survives %s until the last choice leaves', (operation) => {
    let character = choiceFixture()
    for (const id of ['first', 'second']) {
      character = apply(
        character,
        resolveFeatChoiceCommand(character, character.provenance, id, reference),
      )
      character = apply(
        character,
        commitFeatOptionsCommand(
          character,
          character.provenance,
          { ...reference, provenanceChoiceId: id },
          { skills: ['History'] },
        ),
      )
    }
    const second = structuredClone(character.provenance.choices[1])
    character = apply(
      character,
      operation === 'replace'
        ? resolveFeatChoiceCommand(character, character.provenance, 'first', {
            name: 'Other',
            source: 'Two',
          })
        : removeFeatChoiceCommand(
            character,
            character.provenance,
            'first',
            reference.name,
            reference.source,
          ),
    )
    expect(character.provenance.choices[1]).toEqual(second)
    expect(character.provenance.feats.training).toHaveLength(1)
    expect(character.proficiencies.skills).toEqual(['history'])
    expect(character.provenance.proficiencies.skills.history).toHaveLength(1)
    character = apply(
      character,
      removeFeatChoiceCommand(
        character,
        character.provenance,
        'second',
        reference.name,
        reference.source,
      ),
    )
    expect(character.provenance.feats.training).toBeUndefined()
    expect(character.provenance.proficiencies.skills.history).toBeUndefined()
    expect(character.proficiencies.skills).toEqual([])
  })
})
