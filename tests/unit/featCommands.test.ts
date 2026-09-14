import { describe, expect, test } from 'vitest'
import {
  applyOptionalFeatureSelectionCommand,
  commitFeatOptionsCommand,
  editFeatOptionsCommand,
  replaceBonusFeatSelectionsCommand,
  replaceClassFeatSelectionsCommand,
  replaceFeatSelectionsCommand,
  replaceOptionalFeatureSelectionsCommand,
  resolveFeatChoiceCommand,
  retractFeatOptionsCommand,
} from '@/lib/character/commands/featCommands'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import { emptyProvenance } from '@/store/characterStore'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

function applyResult(
  character: ReturnType<typeof makeCharacterFixture>,
  result: ReturnType<typeof commitFeatOptionsCommand>,
) {
  return {
    ...character,
    ...result.characterPatch,
    provenance: result.provenanceUpdate,
  }
}

describe('feat commands', () => {
  test('replaces optional features and accumulates provenance in one result', () => {
    const character = makeCharacterFixture({
      features: [
        { id: 'old-opt', name: 'Old Invocation', source: 'PHB', description: '' },
        { id: 'race-feature', name: 'Darkvision', source: 'PHB', description: '' },
      ],
    })
    const ledger = applyOptionalFeatureSelectionCommand(
      character.provenance ?? emptyProvenance(),
      'Old Invocation',
      'PHB',
      'Warlock',
      'class',
    ).provenanceUpdate

    const result = replaceOptionalFeatureSelectionsCommand(
      character,
      ledger,
      [{ name: 'Old Invocation', source: 'PHB' }],
      [
        { name: 'Agonizing Blast', source: 'PHB' },
        { name: 'Repelling Blast', source: 'PHB' },
      ],
      'Warlock',
      'class',
    )

    expect(result.characterPatch.features?.map((feature) => feature.name)).toEqual([
      'Darkvision',
      'Agonizing Blast',
      'Repelling Blast',
    ])
    expect(result.provenanceUpdate.features['old invocation']).toBeUndefined()
    expect(result.provenanceUpdate.features['agonizing blast']).toHaveLength(1)
    expect(result.provenanceUpdate.features['repelling blast']).toHaveLength(1)
  })

  test('option grants apply and retract symmetrically', () => {
    const character = makeCharacterFixture({
      specialFeats: [{ id: 'bonus-skilled', name: 'Skilled', source: 'PHB', description: '' }],
    })
    const committed = commitFeatOptionsCommand(
      character,
      emptyProvenance(),
      { name: 'Skilled', source: 'PHB' },
      { skills: ['Arcana'], abilityScore: 'int' },
    )
    const configured = applyResult(character, committed)

    expect(configured.proficiencies.skills).toEqual(['arcana'])
    expect(configured.abilityScores.intelligence).toBe(11)
    expect(configured.provenance.proficiencies.skills.arcana).toHaveLength(1)

    const retracted = retractFeatOptionsCommand(
      configured,
      configured.provenance,
      { name: 'Skilled', source: 'PHB' },
      { skills: ['Arcana'], abilityScore: 'int' },
    )

    expect(retracted.characterPatch.proficiencies?.skills).toEqual([])
    expect(retracted.characterPatch.skills?.arcana).toMatchObject({
      proficient: false,
      expertise: false,
    })
    expect(retracted.characterPatch.abilityScores?.intelligence).toBe(10)
    expect(retracted.provenanceUpdate.proficiencies.skills.arcana).toBeUndefined()
  })

  test('editing options retracts old grants before applying new grants', () => {
    const character = makeCharacterFixture({
      specialFeats: [
        {
          id: 'bonus-skilled',
          name: 'Skilled',
          source: 'PHB',
          description: '',
          options: { skills: ['Arcana'] },
        },
      ],
    })
    const committed = commitFeatOptionsCommand(
      character,
      emptyProvenance(),
      { name: 'Skilled', source: 'PHB' },
      { skills: ['Arcana'] },
    )
    const configured = applyResult(character, committed)
    const edited = editFeatOptionsCommand(
      configured,
      configured.provenance,
      { name: 'Skilled', source: 'PHB' },
      { skills: ['Arcana'] },
      { skills: ['History'] },
    )

    expect(edited.characterPatch.proficiencies?.skills).toEqual(['history'])
    expect(edited.provenanceUpdate.proficiencies.skills.arcana).toBeUndefined()
    expect(edited.provenanceUpdate.proficiencies.skills.history).toHaveLength(1)
  })

  test('committing options preserves same-name choice records from another source', () => {
    const phbChoice = {
      id: 'magic-initiate-phb-options',
      domain: 'featOptions' as const,
      sourceTag: makeSourceTag('feat', 'Magic Initiate', 'choice', 'PHB'),
      chooseCount: 1,
      optionPool: ['Wizard'],
      selected: ['Wizard'],
      status: 'resolved' as const,
    }
    const xphbChoice = {
      ...phbChoice,
      id: 'magic-initiate-xphb-options',
      sourceTag: makeSourceTag('feat', 'Magic Initiate', 'choice', 'XPHB'),
    }
    const ledger = { ...emptyProvenance(), choices: [phbChoice, xphbChoice] }

    const result = commitFeatOptionsCommand(
      makeCharacterFixture(),
      ledger,
      { name: 'Magic Initiate', source: 'PHB' },
      {},
    )

    expect(result.provenanceUpdate.choices).toEqual([xphbChoice])
  })

  test('replaces same-name feats by source without retaining stale options', () => {
    const oldFeat = {
      id: 'magic-initiate-phb',
      name: 'Magic Initiate',
      source: 'PHB',
      description: 'Legacy version',
      options: { skills: ['Arcana'] },
    }
    const character = makeCharacterFixture({
      feats: [oldFeat],
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        skills: ['arcana'],
        languages: [],
        savingThrows: [],
      },
      skills: { arcana: { proficient: true, expertise: false, bonus: 0 } },
    })
    const oldFeatTag = makeSourceTag('manual', 'User Choice', 'choice', 'PHB')
    const fixedFeatTag = makeSourceTag('background', 'Sage', 'fixed', 'XPHB')
    const optionTag = makeSourceTag('feat', 'Magic Initiate', 'choice', 'PHB')
    let ledger = addGrant(emptyProvenance(), 'feats', oldFeat.name, oldFeatTag)
    ledger = addGrant(ledger, 'feats', oldFeat.name, fixedFeatTag)
    ledger = addGrant(ledger, 'skills', 'Arcana', optionTag)

    const result = replaceFeatSelectionsCommand(character, ledger, [
      { name: 'Magic Initiate', source: 'XPHB' },
    ])

    expect(result.characterPatch.feats).toEqual([
      expect.objectContaining({
        name: 'Magic Initiate',
        source: 'XPHB',
        description: '',
        options: undefined,
      }),
    ])
    expect(result.characterPatch.proficiencies?.skills).toEqual([])
    expect(result.provenanceUpdate.proficiencies.skills.arcana).toBeUndefined()
    expect(result.provenanceUpdate.feats['magic initiate']).toEqual([
      fixedFeatTag,
      makeSourceTag('manual', 'User Choice', 'choice', 'XPHB'),
    ])
  })

  test('keeps class progression feats isolated from other classes and bonus feats', () => {
    const character = makeCharacterFixture({
      classProgression: [
        { name: 'Fighter', source: 'XPHB', levels: 1 },
        { name: 'Paladin', source: 'XPHB', levels: 2 },
      ],
      specialFeats: [{ id: 'bonus-alert', name: 'Alert', source: 'XPHB', description: '' }],
    })
    const fighterOwner = {
      className: 'Fighter',
      classSource: 'XPHB',
      progressionName: 'Fighting Style',
      categories: ['FS'],
      slotLevels: [1],
    }
    const fighterResult = replaceClassFeatSelectionsCommand(
      character,
      emptyProvenance(),
      fighterOwner,
      [{ name: 'Defense', source: 'XPHB' }],
    )
    const withFighter = applyResult(character, fighterResult)
    const paladinResult = replaceClassFeatSelectionsCommand(
      withFighter,
      withFighter.provenance,
      {
        className: 'Paladin',
        classSource: 'XPHB',
        progressionName: 'Fighting Style',
        categories: ['FS', 'FS:P'],
        slotLevels: [2],
      },
      [{ name: 'Dueling', source: 'XPHB' }],
    )
    const configured = applyResult(withFighter, paladinResult)

    expect(configured.classFeatChoices).toHaveLength(2)
    expect(configured.classFeatChoices?.map((choice) => choice.feats[0]?.name)).toEqual([
      'Defense',
      'Dueling',
    ])
    expect(configured.specialFeats?.map((feat) => feat.name)).toEqual(['Alert'])

    const paladinChoiceId = configured.classFeatChoices?.[1]?.id
    const withOptionsResult = commitFeatOptionsCommand(
      configured,
      configured.provenance,
      { name: 'Dueling', source: 'XPHB', classFeatChoiceId: paladinChoiceId },
      { skills: ['Athletics'] },
    )
    const withOptions = applyResult(configured, withOptionsResult)
    expect(withOptions.classFeatChoices?.[0]?.feats[0]?.options).toBeUndefined()
    expect(withOptions.classFeatChoices?.[1]?.feats[0]?.options).toEqual({
      skills: ['Athletics'],
    })

    const bonusResult = replaceBonusFeatSelectionsCommand(withOptions, withOptions.provenance, [
      { name: 'Lucky', source: 'PHB' },
    ])
    expect(bonusResult.characterPatch.specialFeats?.map((feat) => feat.name)).toEqual(['Lucky'])
    expect(withOptions.classFeatChoices?.map((choice) => choice.feats[0]?.name)).toEqual([
      'Defense',
      'Dueling',
    ])
  })

  test('persists source-qualified choice options and retracts them when the feat changes', () => {
    const character = makeCharacterFixture()
    const choice = {
      id: 'variant-human-feat',
      domain: 'feats' as const,
      sourceTag: makeSourceTag('race', 'Variant Human', 'placeholder', 'PHB'),
      chooseCount: 1,
      optionPool: [],
      selected: [],
      status: 'pending' as const,
    }
    const ledger = { ...emptyProvenance(), choices: [choice] }
    const selected = resolveFeatChoiceCommand(character, ledger, choice.id, {
      name: 'Skill Expert',
      source: 'TCE',
    })
    const withSelection = applyResult(character, selected)
    const committed = commitFeatOptionsCommand(
      withSelection,
      withSelection.provenance,
      { name: 'Skill Expert', source: 'TCE', provenanceChoiceId: choice.id },
      { skills: ['Arcana'], abilityScore: 'intelligence', expertiseSkill: 'Arcana' },
    )
    const configured = applyResult(withSelection, committed)

    expect(configured.provenance.choices[0]?.selectedRefs).toEqual([
      {
        name: 'Skill Expert',
        source: 'TCE',
        options: {
          skills: ['Arcana'],
          abilityScore: 'intelligence',
          expertiseSkill: 'Arcana',
        },
      },
    ])
    expect(configured.abilityScores.intelligence).toBe(11)
    expect(configured.skills?.arcana?.expertise).toBe(true)

    const replaced = resolveFeatChoiceCommand(configured, configured.provenance, choice.id, {
      name: 'Alert',
      source: 'PHB',
    })
    expect(replaced.characterPatch.abilityScores?.intelligence).toBe(10)
    expect(replaced.characterPatch.proficiencies?.skills).toEqual([])
    expect(replaced.characterPatch.skills?.arcana?.expertise).toBe(false)
    expect(replaced.provenanceUpdate.choices[0]?.selectedRefs).toEqual([
      { name: 'Alert', source: 'PHB' },
    ])
    expect(replaced.provenanceUpdate.feats['skill expert']).toBeUndefined()
    expect(replaced.provenanceUpdate.feats.alert).toHaveLength(1)
  })
})
