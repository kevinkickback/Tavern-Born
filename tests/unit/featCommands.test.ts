import { describe, expect, test } from 'vitest'
import { deriveEffectiveAbilityScores } from '@/lib/calculations/characterCalculationContext'
import {
  commitFeatOptionsCommand,
  editFeatOptionsCommand,
  replaceBonusFeatSelectionsCommand,
  replaceClassFeatSelectionsCommand,
  replaceFeatSelectionsCommand,
  resolveFeatChoiceCommand,
  resolveProficiencyChoiceCommand,
  retractFeatOptionsCommand,
} from '@/lib/character/commands/featCommands'
import { getFixedFeatOptionKey } from '@/lib/featGrants'
import { addGrant, makeSourceTag } from '@/lib/provenance'
import type { ProvenanceLedger } from '@/lib/provenance/types'
import { emptyProvenance } from '@/store/characterStore'
import type { Spell5e } from '@/types/5etools'
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
    expect(configured.abilityScores.intelligence).toBe(10)
    expect(configured.provenance.abilityBonuses).toEqual([
      expect.objectContaining({ ability: 'intelligence', value: 1 }),
    ])
    expect(deriveEffectiveAbilityScores(configured).total.intelligence).toBe(11)
    expect(configured.provenance.proficiencies.skills.arcana).toHaveLength(1)

    const retracted = retractFeatOptionsCommand(
      configured,
      configured.provenance,
      { name: 'Skilled', source: 'PHB' },
      { skills: ['Arcana'], abilityScore: 'int' },
    )

    expect(retracted.characterPatch.proficiencies?.skills).toEqual([])
    expect(retracted.characterPatch.proficiencies?.expertise).toEqual([])
    expect(retracted.characterPatch.abilityScores).toBeUndefined()
    expect(retracted.provenanceUpdate.abilityBonuses).toEqual([])
    expect(retracted.provenanceUpdate.proficiencies.skills.arcana).toBeUndefined()
  })

  test('removing a choice keeps a proficiency granted by another source', () => {
    const classTag = makeSourceTag('class', 'Rogue', 'placeholder', 'PHB')
    const choice = {
      id: 'rogue-skills',
      domain: 'skills' as const,
      sourceTag: classTag,
      chooseCount: 1,
      optionPool: ['Arcana'],
      selected: ['Arcana'],
      status: 'resolved' as const,
    }
    let ledger: ProvenanceLedger = { ...emptyProvenance(), choices: [choice] }
    ledger = addGrant(ledger, 'skills', 'Arcana', makeSourceTag('class', 'Rogue', 'choice', 'PHB'))
    ledger = addGrant(
      ledger,
      'skills',
      'Arcana',
      makeSourceTag('background', 'Sage', 'fixed', 'PHB'),
    )
    const character = makeCharacterFixture({
      proficiencies: {
        ...makeCharacterFixture().proficiencies,
        skills: ['arcana'],
      },
    })

    const result = resolveProficiencyChoiceCommand(
      character,
      ledger,
      'skills',
      'Arcana',
      false,
      choice.id,
    )

    expect(result.characterPatch.proficiencies?.skills).toEqual(['arcana'])
    expect(result.characterPatch.proficiencies?.expertise).toEqual([])
    expect(result.provenanceUpdate.proficiencies.skills.arcana).toEqual([
      makeSourceTag('background', 'Sage', 'fixed', 'PHB'),
    ])
  })

  test('marks feat-granted spells fixed and releases them when the feat grant is retracted', () => {
    const character = makeCharacterFixture()
    const selections = { spells: ['Magic Missile|PHB'] }
    const committed = commitFeatOptionsCommand(
      character,
      emptyProvenance(),
      { name: 'Magic Initiate', source: 'PHB' },
      selections,
      [{ name: 'Magic Missile', source: 'PHB', level: 1 } as Spell5e],
    )
    const configured = applyResult(character, committed)
    const specialProfile = configured.spells.spellProfiles.find(
      (profile) => profile.id === 'special:unrestricted',
    )

    expect(specialProfile?.fixedSpells).toEqual(['Magic Missile'])

    const retracted = retractFeatOptionsCommand(
      configured,
      configured.provenance,
      { name: 'Magic Initiate', source: 'PHB' },
      selections,
    )
    const retractedProfile = retracted.characterPatch.spells?.spellProfiles.find(
      (profile) => profile.id === 'special:unrestricted',
    )
    expect(retractedProfile?.spellsKnown).toEqual([])
    expect(retractedProfile?.fixedSpells).toEqual([])
  })

  test('stores setup for an unparameterized fixed feat grant', () => {
    const result = commitFeatOptionsCommand(
      makeCharacterFixture(),
      emptyProvenance(),
      { name: 'Skilled', source: 'XPHB', fixedGrant: true },
      { skills: ['Arcana'] },
    )

    expect(result.characterPatch.fixedFeatOptions).toEqual({
      [getFixedFeatOptionKey('Skilled', 'XPHB')]: { skills: ['Arcana'] },
    })
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
        expertise: [],
        languages: [],
        savingThrows: [],
      },
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

  test('preserves earlier class feat slots when later selections are catalog-sorted', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Fighter', source: 'XPHB', levels: 1 }],
    })
    const owner = {
      className: 'Fighter',
      classSource: 'XPHB',
      progressionName: 'Fighting Style',
      categories: ['FS'],
    }
    const first = replaceClassFeatSelectionsCommand(
      character,
      emptyProvenance(),
      { ...owner, slotLevels: [1] },
      [{ name: 'Dueling', source: 'XPHB' }],
    )
    const leveled = applyResult(character, first)
    const later = replaceClassFeatSelectionsCommand(
      leveled,
      leveled.provenance,
      { ...owner, slotLevels: [1, 4] },
      [
        { name: 'Defense', source: 'XPHB' },
        { name: 'Dueling', source: 'XPHB' },
      ],
    )

    expect(later.characterPatch.classFeatChoices?.[0]?.feats).toEqual([
      expect.objectContaining({ name: 'Defense', classLevel: 4 }),
      expect.objectContaining({ name: 'Dueling', classLevel: 1 }),
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
    expect(configured.abilityScores.intelligence).toBe(10)
    expect(deriveEffectiveAbilityScores(configured).total.intelligence).toBe(11)
    expect(configured.proficiencies.expertise).toEqual(['arcana'])

    const replaced = resolveFeatChoiceCommand(configured, configured.provenance, choice.id, {
      name: 'Alert',
      source: 'PHB',
    })
    expect(replaced.characterPatch.abilityScores).toBeUndefined()
    expect(replaced.provenanceUpdate.abilityBonuses).toEqual([])
    expect(replaced.characterPatch.proficiencies?.skills).toEqual([])
    expect(replaced.characterPatch.proficiencies?.expertise).toEqual([])
    expect(replaced.provenanceUpdate.choices[0]?.selectedRefs).toEqual([
      { name: 'Alert', source: 'PHB' },
    ])
    expect(replaced.provenanceUpdate.feats['skill expert']).toBeUndefined()
    expect(replaced.provenanceUpdate.feats.alert).toHaveLength(1)
  })

  test('keeps same-source feat grants owned by a different grant variant', () => {
    const firstChoice = {
      id: 'first-choice',
      domain: 'feats' as const,
      sourceTag: {
        ...makeSourceTag('class', 'Test Class', 'placeholder', 'TEST'),
        grantVariant: 'first',
      },
      chooseCount: 1,
      optionPool: [],
      selected: [],
      status: 'pending' as const,
    }
    const secondChoice = {
      ...firstChoice,
      id: 'second-choice',
      sourceTag: { ...firstChoice.sourceTag, grantVariant: 'second' },
    }
    const character = makeCharacterFixture()
    const ledger = { ...emptyProvenance(), choices: [firstChoice, secondChoice] }
    const first = resolveFeatChoiceCommand(character, ledger, firstChoice.id, {
      name: 'Alert',
      source: 'PHB',
    })
    const configured = applyResult(character, first)
    const second = resolveFeatChoiceCommand(configured, configured.provenance, secondChoice.id, {
      name: 'Alert',
      source: 'PHB',
    })
    const twiceGranted = applyResult(configured, second)

    expect(twiceGranted.provenance.feats.alert.map((tag) => tag.grantVariant)).toEqual([
      'first',
      'second',
    ])

    const removed = resolveFeatChoiceCommand(
      twiceGranted,
      twiceGranted.provenance,
      firstChoice.id,
      {
        name: 'Lucky',
        source: 'PHB',
      },
    )
    expect(removed.provenanceUpdate.feats.alert).toEqual([
      expect.objectContaining({ grantVariant: 'second' }),
    ])
  })
})
