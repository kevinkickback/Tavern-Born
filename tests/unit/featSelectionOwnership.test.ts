import { describe, expect, test } from 'vitest'
import type { CharacterCommandResult } from '@/lib/character/commands/commandResult'
import {
  clearFeatOptionsCommand,
  commitFeatOptionsCommand,
  editFeatOptionsCommand,
  type FeatOptionTarget,
  replaceBonusFeatSelectionsCommand,
  replaceClassFeatSelectionsCommand,
  replaceFeatSelectionsCommand,
  resolveFeatChoiceCommand,
} from '@/lib/character/commands/featCommands'
import { buildInitialCharacter } from '@/lib/character/commands/originSelectionCommand'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import type { Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

const ordinary: FeatOptionTarget & { selectionKind: 'ordinary' } = {
  name: 'Skilled',
  source: 'XPHB',
  selectionKind: 'ordinary',
}
const bonus: FeatOptionTarget & { selectionKind: 'bonus' } = {
  name: 'Skilled',
  source: 'XPHB',
  selectionKind: 'bonus',
}

function reopen(character: Character, result: CharacterCommandResult): Character {
  return characterPersistenceSchema.parse(
    JSON.parse(
      JSON.stringify({
        ...character,
        ...result.characterPatch,
        provenance: result.provenanceUpdate,
      }),
    ),
  ) as Character
}

describe('independent selected feat copies', () => {
  function selectCopies() {
    let character = buildInitialCharacter(
      { initial: { name: 'Independent copies' } },
      new Map(),
      () => [],
    )
    character = reopen(
      character,
      replaceFeatSelectionsCommand(character, character.provenance, [ordinary]),
    )
    return reopen(
      character,
      replaceBonusFeatSelectionsCommand(character, character.provenance, [bonus]),
    )
  }

  test.each([
    'ordinary',
    'bonus',
  ] as const)('every setup benefit retains independent copies, manual, fixed, class and choice owners: %s', (removedKind) => {
    let character = selectCopies()
    character = {
      ...character,
      background: 'Scholar',
      backgroundSource: 'TEST',
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 4 }],
    }
    character = reopen(
      character,
      replaceClassFeatSelectionsCommand(
        character,
        character.provenance,
        {
          className: 'Fighter',
          classSource: 'PHB',
          progressionName: 'Training',
          categories: [],
          slotLevels: [4],
        },
        [ordinary],
      ),
    )
    const classId = character.classFeatChoices![0].id
    const choiceId = 'background:scholar:training'
    character.provenance.choices.push({
      id: choiceId,
      domain: 'feats',
      sourceTag: makeSourceTag('background', 'Scholar', 'placeholder', 'TEST'),
      chooseCount: 1,
      optionPool: [],
      selected: [],
      status: 'pending',
    })
    character = reopen(
      character,
      resolveFeatChoiceCommand(character, character.provenance, choiceId, ordinary),
    )
    character.provenance = addGrant(character.provenance, 'feats', ordinary.name, {
      ...makeSourceTag('background', 'Scholar', 'fixed', 'TEST'),
      grantSource: 'XPHB',
    })
    const options = {
      skills: ['Arcana'],
      tools: ['Herbalism Kit'],
      languages: ['Elvish'],
      expertiseSkill: 'History',
      abilityScore: 'int',
      optionalFeature: 'Defense',
      spells: ['Spark|TEST'],
    }
    const spells = [{ name: 'Spark', source: 'TEST', level: 0 }] as Spell5e[]
    for (const target of [
      ordinary,
      bonus,
      { ...ordinary, selectionKind: undefined, fixedGrant: true },
      { ...ordinary, selectionKind: undefined, classFeatChoiceId: classId },
      { ...ordinary, selectionKind: undefined, provenanceChoiceId: choiceId },
    ]) {
      character = reopen(
        character,
        commitFeatOptionsCommand(character, character.provenance, target, options, spells),
      )
    }
    character.provenance = addGrant(
      character.provenance,
      'skills',
      'Arcana',
      makeSourceTag('manual', 'User Choice', 'choice'),
    )
    const target = removedKind === 'ordinary' ? ordinary : bonus
    character = reopen(
      character,
      clearFeatOptionsCommand(character, character.provenance, target, {
        skills: ['Wrong stale dialog skill'],
      }),
    )
    expect(character.proficiencies).toMatchObject({
      skills: ['arcana', 'history'],
      expertise: ['history'],
      tools: ['Herbalism Kit'],
      languages: ['Elvish'],
    })
    expect(character.provenance.abilityBonuses).toHaveLength(4)
    expect(character.provenance.features.defense).toHaveLength(4)
    expect(character.provenance.spells.spark).toHaveLength(4)
    expect(character.provenance.proficiencies.skills.arcana).toHaveLength(5)
    character = reopen(
      character,
      removedKind === 'ordinary'
        ? replaceFeatSelectionsCommand(character, character.provenance, [])
        : replaceBonusFeatSelectionsCommand(character, character.provenance, []),
    )
    expect(character.provenance.feats.skilled.filter((tag) => tag.sourceType === 'manual')).toEqual(
      [
        expect.objectContaining({
          grantVariant: removedKind === 'ordinary' ? 'selection:bonus' : 'selection:ordinary',
        }),
      ],
    )
    expect(character.provenance.spells.spark).toHaveLength(4)
  })

  test('Finish again, source casing refresh, offline Edit and stale Clear replace only their active copy', () => {
    let character = selectCopies()
    character = reopen(
      character,
      commitFeatOptionsCommand(character, character.provenance, bonus, { skills: ['Nature'] }),
    )
    character = reopen(
      character,
      commitFeatOptionsCommand(character, character.provenance, ordinary, { skills: ['Arcana'] }),
    )
    character = reopen(
      character,
      commitFeatOptionsCommand(
        character,
        character.provenance,
        { ...ordinary, name: ' skilled ', source: ' xphb ' },
        { skills: ['History'] },
      ),
    )
    expect(character.proficiencies.skills.sort()).toEqual(['history', 'nature'])
    expect(character.feats[0].options).toEqual({ skills: ['History'] })
    character = reopen(
      character,
      editFeatOptionsCommand(
        character,
        character.provenance,
        ordinary,
        { skills: ['Nature'] },
        { skills: ['Survival'] },
        [],
      ),
    )
    expect(character.proficiencies.skills.sort()).toEqual(['nature', 'survival'])
    character = reopen(
      character,
      clearFeatOptionsCommand(character, character.provenance, ordinary, { skills: ['Nature'] }),
    )
    expect(character.proficiencies.skills).toEqual(['nature'])
    expect(character.specialFeats?.[0].options).toEqual({ skills: ['Nature'] })
  })

  test.each([
    [
      { name: 'Training|One', source: 'HB' },
      { name: 'Training|Two', source: 'HB' },
    ],
    [
      { name: 'Training', source: 'HB|One' },
      { name: 'Training', source: 'HB|Two' },
    ],
    [
      { name: 'Training|HB', source: 'One' },
      { name: 'Training', source: 'HB|One' },
    ],
    [
      { name: 'Training-One', source: 'HB' },
      { name: 'Training', source: 'One-HB' },
    ],
  ])('complete literal printing fields and row identities stay distinct: %j / %j', (first, second) => {
    let character = makeCharacterFixture()
    character = reopen(
      character,
      replaceFeatSelectionsCommand(character, character.provenance, [first, second]),
    )
    expect(character.feats[0].id).not.toBe(character.feats[1].id)
    character = reopen(
      character,
      commitFeatOptionsCommand(
        character,
        character.provenance,
        { ...first, selectionKind: 'ordinary' },
        { skills: ['Arcana'] },
      ),
    )
    character = reopen(
      character,
      commitFeatOptionsCommand(
        character,
        character.provenance,
        { ...second, selectionKind: 'ordinary' },
        { skills: ['History'] },
      ),
    )
    character = reopen(
      character,
      replaceFeatSelectionsCommand(character, character.provenance, [second]),
    )
    expect(character.feats[0].options).toEqual({ skills: ['History'] })
    expect(character.proficiencies.skills).toEqual(['history'])
    expect(Object.values(character.provenance.feats).flat()).toEqual([
      expect.objectContaining({ sourceName: second.name, sourceRef: second.source }),
    ])
  })

  test.each([
    { name: 'Skilled', source: 'XPHB' },
    { ...ordinary, source: 'UNKNOWN' },
    { ...ordinary, fixedGrant: true },
  ])('unqualified, inactive and conflicting owners cannot mutate setup: %j', (target) => {
    const character = selectCopies()
    for (const command of [
      commitFeatOptionsCommand(character, character.provenance, target, { skills: ['Arcana'] }),
      editFeatOptionsCommand(character, character.provenance, target, {}, { skills: ['Arcana'] }),
      clearFeatOptionsCommand(character, character.provenance, target, {}),
    ]) {
      expect(command.characterPatch).toEqual({})
      expect(command.provenanceUpdate).toBe(character.provenance)
    }
  })

  test.each([
    'Spark|TEST|FOREIGN',
    '{@spell Spark|TEST',
    'Spark|TEST#extra',
  ])('malformed selected spell references reject before mutation and strict reopen: %s', (reference) => {
    const metadata = [{ name: 'Spark', source: 'TEST', level: 0 }] as Spell5e[]
    let character = selectCopies()
    character = reopen(
      character,
      commitFeatOptionsCommand(
        character,
        character.provenance,
        ordinary,
        { spells: ['Spark|TEST'] },
        metadata,
      ),
    )
    for (const result of [
      commitFeatOptionsCommand(
        character,
        character.provenance,
        ordinary,
        { spells: [reference] },
        metadata,
      ),
      editFeatOptionsCommand(
        character,
        character.provenance,
        ordinary,
        { spells: ['Spark|TEST'] },
        { spells: [reference] },
        metadata,
      ),
    ]) {
      expect(result.characterPatch).toEqual({})
      expect(result.provenanceUpdate).toBe(character.provenance)
    }
    const malformed = structuredClone(character)
    malformed.feats[0].options = { spells: [reference] }
    const before = structuredClone(malformed)
    expect(characterPersistenceSchema.safeParse(malformed).success).toBe(false)
    expect(malformed).toEqual(before)
  })

  test.each([
    'malformed-cantrip',
    'malformed-fixed',
    'duplicate-cantrip',
    'missing-fixed',
    'wrong-kind',
  ] as const)('selected spell materialization must remain complete and unique: %s', (failure) => {
    let character = selectCopies()
    character = reopen(
      character,
      commitFeatOptionsCommand(
        character,
        character.provenance,
        ordinary,
        { spells: ['Spark|TEST'] },
        [{ name: 'Spark', source: 'TEST', level: 0 }] as Spell5e[],
      ),
    )
    const profile = character.spells.spellProfiles.find((entry) => entry.type === 'special')!
    if (failure === 'malformed-cantrip') profile.cantrips = ['Spark|TEST|FOREIGN']
    if (failure === 'malformed-fixed') profile.fixedSpells = ['Spark|TEST|FOREIGN']
    if (failure === 'duplicate-cantrip') profile.cantrips.push(' spark | test ')
    if (failure === 'missing-fixed') profile.fixedSpells = []
    if (failure === 'wrong-kind') profile.spellsKnown = ['Spark|TEST']
    const before = structuredClone(character)
    expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
    expect(character).toEqual(before)
  })

  test.each([
    ['spells', 'spark', 'spark|TEST|FOREIGN'],
    ['spells', 'spark', ' SPARK '],
    ['spells', 'spark', '{@spell Spark|TEST}'],
    ['skills', 'arcana', ' Arcana '],
    ['skills', 'arcana', 'Arcana|TEST'],
    ['features', 'defense', ' Defense '],
    ['feats', 'skilled', ' Skilled '],
  ] as const)('selected ledger keys must be canonical for reversible removal: %s / %s / %s', (domain, key, malformedKey) => {
    let character = selectCopies()
    character = reopen(
      character,
      commitFeatOptionsCommand(
        character,
        character.provenance,
        ordinary,
        { skills: ['Arcana'], optionalFeature: 'Defense', spells: ['Spark|TEST'] },
        [{ name: 'Spark', source: 'TEST', level: 0 }] as Spell5e[],
      ),
    )
    const map =
      domain === 'skills' ? character.provenance.proficiencies.skills : character.provenance[domain]
    map[malformedKey] = map[key]
    delete map[key]
    const before = structuredClone(character)
    expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
    expect(character).toEqual(before)
  })

  test.each([
    'missing-owner',
    'wrong-kind',
    'duplicate-tag',
    'missing-tag',
    'missing-materialization',
    'extra-benefit',
    'duplicate-printing',
    'duplicate-row',
    'foreign-domain',
  ] as const)('strict admission rejects incoherent selected setup without altering originals: %s', (failure) => {
    let character = selectCopies()
    character = reopen(
      character,
      commitFeatOptionsCommand(character, character.provenance, ordinary, { skills: ['Arcana'] }),
    )
    if (failure === 'missing-owner')
      delete character.provenance.proficiencies.skills.arcana[0].grantVariant
    if (failure === 'wrong-kind')
      character.provenance.proficiencies.skills.arcana[0].grantVariant = 'selection:bonus'
    if (failure === 'duplicate-tag')
      character.provenance.proficiencies.skills.arcana.push({
        ...character.provenance.proficiencies.skills.arcana[0],
        sourceName: ' skilled ',
        sourceRef: ' xphb ',
        label: 'Alternate display',
      })
    if (failure === 'missing-tag') delete character.provenance.proficiencies.skills.arcana
    if (failure === 'missing-materialization') character.proficiencies.skills = []
    if (failure === 'extra-benefit')
      character.provenance.features.defense = [character.provenance.proficiencies.skills.arcana[0]]
    if (failure === 'duplicate-printing')
      character.feats.push({ ...character.feats[0], id: 'duplicate', source: ' xphb ' })
    if (failure === 'duplicate-row')
      character.feats.push({ ...character.feats[0], name: 'Other', options: undefined })
    if (failure === 'foreign-domain')
      character.provenance.proficiencies.skills.arcana.push({
        ...character.provenance.proficiencies.skills.arcana[0],
        sourceType: 'manual',
      })
    const before = structuredClone(character)
    expect(characterPersistenceSchema.safeParse(character).success).toBe(false)
    expect(character).toEqual(before)
  })
  test.each([
    'ordinary',
    'bonus',
  ] as const)('setup, edit, clear and removal preserve the other copy: %s', (firstRemoved) => {
    let character = makeCharacterFixture()
    character = reopen(
      character,
      replaceFeatSelectionsCommand(character, character.provenance, [ordinary]),
    )
    character = reopen(
      character,
      replaceBonusFeatSelectionsCommand(character, character.provenance, [bonus]),
    )
    character = reopen(
      character,
      commitFeatOptionsCommand(character, character.provenance, ordinary, {
        skills: ['Arcana', 'History', 'Nature'],
      }),
    )
    character = reopen(
      character,
      commitFeatOptionsCommand(character, character.provenance, bonus, {
        skills: ['Animal Handling', 'Medicine', 'Survival'],
      }),
    )
    expect(character.feats[0].options).toEqual({ skills: ['Arcana', 'History', 'Nature'] })
    expect(character.specialFeats?.[0].options).toEqual({
      skills: ['Animal Handling', 'Medicine', 'Survival'],
    })
    const target = firstRemoved === 'ordinary' ? ordinary : bonus
    const prior =
      firstRemoved === 'ordinary' ? character.feats[0].options : character.specialFeats?.[0].options
    character = reopen(
      character,
      editFeatOptionsCommand(character, character.provenance, target, prior ?? {}, {
        skills: ['Arcana', 'History', 'Survival'],
      }),
    )
    character = reopen(
      character,
      clearFeatOptionsCommand(character, character.provenance, target, {
        skills: ['Arcana', 'History', 'Survival'],
      }),
    )
    const retainedSkills =
      firstRemoved === 'ordinary'
        ? ['animal handling', 'medicine', 'survival']
        : ['arcana', 'history', 'nature']
    expect(character.proficiencies.skills.sort()).toEqual(retainedSkills.sort())
    expect(
      (firstRemoved === 'ordinary' ? character.feats : character.specialFeats)?.[0].options,
    ).toEqual({})
    character = reopen(
      character,
      firstRemoved === 'ordinary'
        ? replaceFeatSelectionsCommand(character, character.provenance, [])
        : replaceBonusFeatSelectionsCommand(character, character.provenance, []),
    )
    expect(character.proficiencies.skills.sort()).toEqual(retainedSkills.sort())
    character = reopen(
      character,
      firstRemoved === 'ordinary'
        ? replaceBonusFeatSelectionsCommand(character, character.provenance, [])
        : replaceFeatSelectionsCommand(character, character.provenance, []),
    )
    expect(character.proficiencies.skills).toEqual([])
    expect(character.provenance.proficiencies.skills).toEqual({})
  })
})
