// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { buildClassLookup, buildFeatLookup, buildRaceLookup } from '@/lib/5etools/lookups'
import { buildPrerequisiteSnapshot, checkPrerequisite } from '@/lib/calculations/prerequisites'
import { buildClassChoiceFeatureCatalogs } from '@/lib/character/classChoiceFeatureCatalogs'
import { applyCharacterCommandResult } from '@/lib/character/commands/featCommandSupport'
import { replaceFeatSelectionsCommand } from '@/lib/character/commands/featCommands'
import { mapCharacterSheet2014 } from '@/lib/pdf/characterSheetMapping2014'
import { mapCharacterSheet2024 } from '@/lib/pdf/characterSheetMapping2024'
import type { Feat5e, Race5e } from '@/types/5etools'
import { characterPersistenceSchema } from '@/types/characterSchema'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { makeClassCastingLayer } from '../fixtures/classCastingFixtures'
import { createCurrentCharacterSheetViewModel } from '../fixtures/pdfTemplates'

describe('effective ability score consumers', () => {
  test('the PDF reflects a revised Heavy penalty until the weapon is qualified or waived', () => {
    const base = makeCharacterFixture()
    const actor = makeCharacterFixture({
      abilityScores: { ...base.abilityScores, strength: 12 },
      equipment: [
        {
          id: 'greatsword',
          name: 'Greatsword',
          source: 'XPHB',
          equipped: true,
          quantity: 1,
          type: 'M|XPHB',
          properties: ['H|XPHB'],
          dmg1: '2d6',
          dmgType: 'S',
        },
      ],
    })
    const restricted = createCurrentCharacterSheetViewModel(actor, {})
    expect(mapCharacterSheet2014(restricted).textFields['Attack.1.Description']).toContain(
      'Disadvantage on attack rolls (Heavy requires Strength 13)',
    )
    expect(mapCharacterSheet2024(restricted).textFields.Text_79).toContain(
      'Disadvantage on attack rolls (Heavy requires Strength 13)',
    )
    const qualified = createCurrentCharacterSheetViewModel(
      {
        ...actor,
        manualEffects: [
          {
            id: 'strength-increase',
            label: 'Strength increase',
            target: { kind: 'ability-score', ability: 'strength' },
            operation: { kind: 'add', value: 1 },
            source: { kind: 'manual', name: 'Strength increase' },
          },
        ],
      },
      {},
    )
    const waived = createCurrentCharacterSheetViewModel(
      {
        ...actor,
        variantRules: { ignoreHeavyWeaponRequirements: true },
      },
      {},
    )
    for (const sheet of [qualified, waived]) {
      expect(sheet.weaponRows[0].attackBonus).toBe(restricted.weaponRows[0].attackBonus)
      expect(sheet.weaponRows[0].notes).not.toContain('Disadvantage')
    }
  })

  test('applies the normal cap while retaining custom scores and advancement for a later opt-in', () => {
    const base = makeCharacterFixture({
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 4 }],
      variantRules: { abilityScoreMethod: 'custom' },
    })
    const actor = characterPersistenceSchema.parse({
      ...base,
      abilityScores: { ...base.abilityScores, strength: 23, dexterity: 20, constitution: 29 },
      asiChoices: [
        {
          id: 'fighter-4',
          level: 4,
          className: 'Fighter',
          classSource: 'PHB',
          abilityChanges: { dexterity: 1, constitution: 1 },
        },
      ],
      manualEffects: [
        {
          id: 'temporary-strength',
          label: 'Temporary strength',
          target: { kind: 'ability-score', ability: 'strength' },
          operation: { kind: 'add', value: 1 },
          source: { kind: 'manual', name: 'Temporary strength' },
        },
      ],
    })
    const disabled = createCurrentCharacterSheetViewModel(actor, {})
    expect(disabled.effectiveAbilityScores).toMatchObject({
      strength: 21,
      dexterity: 20,
      constitution: 20,
    })
    const enabled = characterPersistenceSchema.parse({
      ...actor,
      variantRules: { ...actor.variantRules, allowAbilityScoresAbove20: true },
    })
    const sheet = createCurrentCharacterSheetViewModel(enabled, {})
    expect(sheet.effectiveAbilityScores).toMatchObject({
      strength: 24,
      dexterity: 21,
      constitution: 30,
    })
    expect(mapCharacterSheet2014(sheet).textFields).toMatchObject({
      Str: '24',
      Dex: '21',
      Con: '30',
    })
    expect(enabled.abilityScores).toEqual(actor.abilityScores)
    expect(enabled.asiChoices).toEqual(actor.asiChoices)
  })

  test.skipIf(!existsSync('data/feats.json'))(
    'preserves a saved fixed feat grant with a higher source cap',
    () => {
      const form = JSON.parse(readFileSync('data/feats.json', 'utf8')) as {
        feat: Feat5e[]
      }
      const feat = form.feat.find(
        ({ name, source }) => name === 'Boon of Terror' && source === 'FRHoF',
      )!
      const base = makeCharacterFixture()
      const selected = applyCharacterCommandResult(
        base,
        replaceFeatSelectionsCommand(base, base.provenance, [feat]),
      )
      const actor = characterPersistenceSchema.parse({
        ...selected,
        abilityScores: { ...selected.abilityScores, charisma: 20 },
        provenance: {
          ...selected.provenance,
          abilityBonuses: [
            {
              ability: 'charisma',
              value: 1,
              sourceTag: {
                sourceType: 'feat',
                sourceName: feat.name,
                sourceRef: feat.source,
                grantType: 'fixed',
                label: feat.name,
              },
            },
          ],
        },
      })
      const result = createCurrentCharacterSheetViewModel(actor, {
        featsByKey: buildFeatLookup([feat]),
      })
      expect(result.effectiveAbilityScores.charisma).toBe(21)
    },
  )

  test('uses one effective score set for rules, spellcasting, and both PDF projections', () => {
    const elf = {
      name: 'Elf',
      source: 'PHB',
      ability: [{ dex: 2 }],
    } as Race5e
    const data = makeClassCastingLayer('class/class-wizard.json')
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 4 }],
      race: 'Elf',
      raceSource: 'PHB',
      abilityScores: {
        strength: 8,
        dexterity: 14,
        constitution: 13,
        intelligence: 15,
        wisdom: 12,
        charisma: 10,
      },
      asiChoices: [
        {
          id: 'wizard|PHB|4',
          level: 4,
          className: 'Wizard',
          classSource: 'PHB',
          abilityChanges: { intelligence: 1, constitution: 1 },
        },
      ],
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        skills: ['acrobatics'],
        expertise: [],
        languages: [],
        savingThrows: ['intelligence'],
      },
      equipment: [
        {
          id: 'leather',
          name: 'Leather Armor',
          type: 'LA',
          quantity: 1,
          equipped: true,
          ac: 11,
          armorType: 'light',
        },
      ],
      hitPoints: { current: 0, temporary: 0 },
    })
    const lookups = {
      classesByKey: buildClassLookup(data.classes),
      classChoiceClasses: data.classes,
      classChoiceFeatureCatalogs: buildClassChoiceFeatureCatalogs(data),
      racesByKey: buildRaceLookup([elf]),
    }

    const viewModel = createCurrentCharacterSheetViewModel(character, lookups)
    const prerequisiteSnapshot = buildPrerequisiteSnapshot({
      character,
      effectiveAbilityScores: viewModel.effectiveAbilityScores,
    })
    const pdf2014 = mapCharacterSheet2014(viewModel)
    const pdf2024 = mapCharacterSheet2024(viewModel)

    expect(viewModel.effectiveAbilityScores).toMatchObject({
      dexterity: 16,
      constitution: 14,
      intelligence: 16,
    })
    expect(viewModel.abilityModifiers).toMatchObject({
      dexterity: 3,
      constitution: 2,
      intelligence: 3,
    })
    expect(viewModel.effectiveArmorClass).toBe(14)
    expect(viewModel.maxHP).toBe(26)
    expect(viewModel.skillByName.get('acrobatics')?.modifier).toBe(5)
    expect(viewModel.savingThrowByAbility.get('intelligence')?.modifier).toBe(5)
    expect(viewModel.spellcastingDetails[0]).toMatchObject({
      spellSaveDC: 13,
      spellAttackBonus: 5,
      preparedSpellLimit: 7,
    })
    expect(checkPrerequisite({ ability: [{ int: 16 }] }, prerequisiteSnapshot).met).toBe(true)
    expect(pdf2014.textFields).toMatchObject({
      Dex: '16',
      Con: '14',
      Int: '16',
      'Dex Mod': '+3',
      AC: '14',
      'HP Max': '26',
    })
    expect(pdf2024.textFields).toMatchObject({
      Text_26: '16',
      Text_27: '14',
      Text_30: '16',
      Text_23: '+3',
      Text_8: '14',
      Text_11: '26',
    })
  })
})
