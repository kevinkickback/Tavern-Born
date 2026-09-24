import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, PDFName, TextAlignment } from '@cantoo/pdf-lib'
import { describe, expect, test } from 'vitest'
import {
  buildBackgroundLookup,
  buildClassLookup,
  buildFeatLookup,
  buildRaceLookup,
  buildSpellLookup,
} from '@/lib/5etools/lookups'
import { parseClasses } from '@/lib/5etools/parsers'
import { buildItemLookup } from '@/lib/5etools/startingEquipment'
import {
  type CharacterSheetTemplateId,
  createCharacterSheetViewModel,
  buildCharacterSheetFieldMap as mapCharacterSheetViewModel,
} from '@/lib/pdf/characterSheetPdf'
import { OFFICIAL_2014_SECTION_LIMITS } from '@/lib/pdf/official2014Text'
import { getOfficial2024FontBounds } from '@/lib/pdf/official2024Text'
import { asFieldWithInternals, findAttachedWidgetLocation } from '@/lib/pdf/pdfFieldInternals'
import { fillCharacterSheetPdf } from '@/lib/pdf/pdfFormAdapter'
import type { Background5e, Class5e, Race5e, Spell5e } from '@/types/5etools'
import type { Character } from '@/types/character'
import { makeCharacterFixture } from '../fixtures/characterFixtures'
import { sourceTemplateBytes } from '../fixtures/pdfTemplates'

function prepareViewModel(
  character: Character,
  classesData: Class5e[] = [],
  racesData: Race5e[] = [],
  backgroundsData: Background5e[] = [],
  spellsData: Spell5e[] = [],
  itemPropertyByAbbr: Record<string, string> = {},
) {
  return createCharacterSheetViewModel(character, {
    classesByKey: buildClassLookup(classesData),
    racesByKey: buildRaceLookup(racesData),
    backgroundsByKey: buildBackgroundLookup(backgroundsData),
    spellsByKey: buildSpellLookup(spellsData),
    itemPropertyByAbbr,
  })
}

function buildCharacterSheetFieldMap(
  character: Character,
  templateId: CharacterSheetTemplateId = '2024',
  classesData: Class5e[] = [],
  racesData: Race5e[] = [],
  backgroundsData: Background5e[] = [],
) {
  return mapCharacterSheetViewModel(
    prepareViewModel(character, classesData, racesData, backgroundsData),
    templateId,
  )
}

describe('characterSheetPdf', () => {
  test('should map key identity and stat fields for 2024 template', () => {
    const character = makeCharacterFixture({
      name: 'Aria Stormborn',
      race: 'Elf',
      subrace: 'Wood',
      classProgression: [
        { name: 'Ranger', source: 'PHB', levels: 3 },
        { name: 'Fighter', source: 'PHB', levels: 1 },
      ],
      background: 'Outlander',
      details: {
        alignment: 'Chaotic Good',
      },
      abilityScores: {
        strength: 12,
        dexterity: 16,
        constitution: 14,
        intelligence: 10,
        wisdom: 15,
        charisma: 8,
      },
      armorClassOverride: 16,
      movement: { speeds: { walk: 35 }, source: { kind: 'manual', name: 'Test' } },
      hitPoints: {
        current: 24,
        temporary: 5,
      },
      hitDiceUsed: { 'fighter|phb': 1 },
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        languages: ['Common', 'Elvish'],
        skills: [],
        expertise: [],
        savingThrows: [],
      },
      feats: [
        {
          id: 'alert',
          name: 'Alert',
          source: 'PHB',
          description: 'You gain a +5 bonus to initiative.',
        },
      ],
    })

    const map = buildCharacterSheetFieldMap(character, '2024')

    expect(map.textFields.Text_1).toBe('Aria Stormborn')
    expect(map.textFields.Text_2).toBe('Outlander')
    expect(map.textFields.Text_3).toBe('Wood Elf')
    expect(map.textFields.Text_4).toBe('Ranger / Fighter')
    expect(map.textFields.Text_5).toBe('')
    expect(map.textFields.Text_6).toBe('4')
    expect(map.textFields.Text_229).toBe('Chaotic Good')

    expect(map.textFields.Text_25).toBe('12')
    expect(map.textFields.Text_26).toBe('16')
    expect(map.textFields.Text_8).toBe('16')
    expect(map.textFields.Text_17).toBe('35 ft')
    expect(map.textFields.Text_11).toBe('31')
    expect(map.textFields.Text_9).toBe('24')
    expect(map.textFields.Text_10).toBe('5')
    expect(map.textFields.Text_12).toBe('1')
    expect(map.textFields.Text_13).toBe('4')
    expect(map.textFields.Text_91).toBe('Common, Elvish')
    expect(map.textFields.Text_60).toBe('Alert: You gain a +5 bonus to initiative.')
  })

  test('should map inspiration and death saves for 2024 template', () => {
    const character = makeCharacterFixture({
      inspiration: true,
      deathSaves: {
        successes: 2,
        failures: 1,
      },
    })

    const map = buildCharacterSheetFieldMap(character, '2024')

    expect(map.checkboxFields.Checkbox_32).toBe(true)
    expect(map.checkboxFields.Checkbox_1).toBe(false)
    expect(map.checkboxFields.Checkbox_2).toBe(true)
    expect(map.checkboxFields.Checkbox_3).toBe(true)
    expect(map.checkboxFields.Checkbox_4).toBe(false)
    expect(map.checkboxFields.Checkbox_5).toBe(true)
    expect(map.checkboxFields.Checkbox_6).toBe(false)
    expect(map.checkboxFields.Checkbox_7).toBe(false)
  })

  test('should map saving throw and skill proficiency checkboxes', () => {
    const character = makeCharacterFixture({
      proficiencies: {
        armor: ['Light Armor'],
        weapons: ['Simple Weapons'],
        tools: [],
        languages: ['Common'],
        skills: ['stealth', 'perception'],
        expertise: ['stealth'],
        savingThrows: ['dexterity', 'wisdom'],
      },
      abilityScores: {
        strength: 10,
        dexterity: 16,
        constitution: 10,
        intelligence: 10,
        wisdom: 14,
        charisma: 10,
      },
      classProgression: [{ name: 'Rogue', source: 'PHB', levels: 5 }],
    })

    const map = buildCharacterSheetFieldMap(character, '2024')

    expect(map.checkboxFields.Checkbox_10).toBe(true)
    expect(map.checkboxFields.Checkbox_30).toBe(true)
    expect(map.checkboxFields.Checkbox_8).toBe(false)

    expect(map.checkboxFields.Checkbox_13).toBe(true)
    expect(map.checkboxFields.Checkbox_17).toBe(true)
    expect(map.checkboxFields.Checkbox_19).toBe(false)

    expect(map.textFields.Text_50).toBe('+9')
  })

  test('should map key identity and proficiency fields for 2014 template', () => {
    const character = makeCharacterFixture({
      name: 'Bren Ironhand',
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 5 }],
      race: 'Human',
      background: 'Soldier',
      abilityScores: {
        strength: 16,
        dexterity: 14,
        constitution: 14,
        intelligence: 10,
        wisdom: 12,
        charisma: 8,
      },
      proficiencies: {
        armor: ['Light Armor', 'Medium Armor'],
        weapons: ['Simple Weapons', 'Martial Weapons'],
        tools: [],
        languages: ['Common'],
        skills: ['athletics', 'perception'],
        expertise: [],
        savingThrows: ['strength', 'constitution'],
      },
    })

    const map = buildCharacterSheetFieldMap(character, '2014')

    expect(map.textFields['PC Name']).toBe('Bren Ironhand')
    expect(map.textFields['Class and Levels']).toBe('Fighter 5')
    expect(map.textFields.Race).toBe('Human')
    expect(map.textFields.Str).toBe('16')
    expect(map.textFields['Str Mod']).toBe('+3')

    expect(map.checkboxFields['Str ST Prof']).toBe(true)
    expect(map.checkboxFields['Con ST Prof']).toBe(true)
    expect(map.checkboxFields['Dex ST Prof']).toBe(false)

    expect(map.checkboxFields['Ath Prof']).toBe(true)
    expect(map.checkboxFields['Perc Prof']).toBe(true)
    expect(map.checkboxFields['Arc Prof']).toBe(false)
    expect(map.textFields.Ath).toBe('+6')
  })

  test('2014 languages populate dedicated Language fields', () => {
    const character = makeCharacterFixture({
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        languages: ['Common', 'Elvish', 'Dwarvish'],
        skills: [],
        expertise: [],
        savingThrows: [],
      },
    })

    const map = buildCharacterSheetFieldMap(character, '2014')

    expect(map.textFields['Language 1']).toBe('Common')
    expect(map.textFields['Language 2']).toBe('Elvish')
    expect(map.textFields['Language 3']).toBe('Dwarvish')
    expect(map.textFields['Language 4']).toBe('')
  })

  test('2014 tools populate dedicated Tool fields', () => {
    const character = makeCharacterFixture({
      proficiencies: {
        armor: [],
        weapons: [],
        tools: ["Thieves' Tools", 'Dice Set'],
        languages: [],
        skills: [],
        expertise: [],
        savingThrows: [],
      },
    })

    const map = buildCharacterSheetFieldMap(character, '2014')

    expect(map.textFields['Tool 1']).toBe("Thieves' Tools")
    expect(map.textFields['Tool 2']).toBe('Dice Set')
    expect(map.textFields['Tool 3']).toBe('')
  })

  test('2014 armor and weapon proficiency checkboxes', () => {
    const character = makeCharacterFixture({
      proficiencies: {
        armor: ['Light Armor', 'Medium Armor', 'Heavy Armor', 'Shields'],
        weapons: ['Simple Weapons', 'Martial Weapons', 'Hand Crossbows'],
        tools: [],
        languages: [],
        skills: [],
        expertise: [],
        savingThrows: [],
      },
    })

    const map = buildCharacterSheetFieldMap(character, '2014')

    expect(map.checkboxFields['Proficiency Armor Light']).toBe(true)
    expect(map.checkboxFields['Proficiency Armor Medium']).toBe(true)
    expect(map.checkboxFields['Proficiency Armor Heavy']).toBe(true)
    expect(map.checkboxFields['Proficiency Shields']).toBe(true)
    expect(map.checkboxFields['Proficiency Weapon Simple']).toBe(true)
    expect(map.checkboxFields['Proficiency Weapon Martial']).toBe(true)
    expect(map.checkboxFields['Proficiency Weapon Other']).toBe(true)
    expect(map.textFields['Proficiency Weapon Other Description']).toBe('Hand Crossbows')
  })

  test('2014 armor proficiency checkboxes false when not proficient', () => {
    const character = makeCharacterFixture({
      proficiencies: {
        armor: [],
        weapons: ['Simple Weapons'],
        tools: [],
        languages: [],
        skills: [],
        expertise: [],
        savingThrows: [],
      },
    })

    const map = buildCharacterSheetFieldMap(character, '2014')

    expect(map.checkboxFields['Proficiency Armor Light']).toBe(false)
    expect(map.checkboxFields['Proficiency Armor Heavy']).toBe(false)
    expect(map.checkboxFields['Proficiency Weapon Martial']).toBe(false)
    expect(map.checkboxFields['Proficiency Weapon Other']).toBe(false)
  })

  test('2014 AC armor circles reflect worn armor, not armor proficiency', () => {
    const character = makeCharacterFixture({
      proficiencies: {
        armor: ['Heavy Armor'],
        weapons: [],
        tools: [],
        languages: [],
        skills: [],
        expertise: [],
        savingThrows: [],
      },
      equipment: [
        {
          id: 'half-plate',
          name: 'Half Plate Armor',
          type: 'MA',
          quantity: 1,
          equipped: true,
          armorType: 'medium',
          ac: 15,
        },
      ],
    })
    const map = buildCharacterSheetFieldMap(character, '2014')
    expect(map.checkboxFields['Medium Armor']).toBe(true)
    expect(map.checkboxFields['Heavy Armor']).toBe(false)
    expect(map.checkboxFields['Proficiency Armor Heavy']).toBe(true)
    expect(map.checkboxFields['Proficiency Armor Medium']).toBe(false)
  })

  test('2014 groups ammunition packs in the two display boxes', () => {
    const character = makeCharacterFixture({
      equipment: [
        { id: 'arrow', name: 'Arrow', type: 'A', quantity: 1, equipped: false },
        { id: 'arrows', name: 'Arrows (20)', type: 'A', quantity: 2, equipped: false },
        { id: 'bolts', name: 'Crossbow Bolts (20)', type: 'A', quantity: 1, equipped: false },
      ],
    })
    const map = buildCharacterSheetFieldMap(character, '2014')
    expect(map.textFields['AmmoLeftDisplay.Name']).toBe('Arrows')
    expect(map.textFields['AmmoLeftDisplay.Amount']).toBe('41')
    expect(map.textFields['AmmoRightDisplay.Name']).toBe('Crossbow Bolts')
    expect(map.textFields['AmmoRightDisplay.Amount']).toBe('20')
  })

  test('2014 carries long ruled sections onto the notes page', () => {
    const viewModel = prepareViewModel(makeCharacterFixture())
    viewModel.racialTraitsSummary = 'Ancestry detail. '.repeat(35)
    viewModel.organizationDetailsSummary = [
      'Faction: The Harpers',
      'Rank: Watcher',
      'Faction notes: Detailed account. '.repeat(9),
    ].join('\n\n')
    const map = mapCharacterSheetViewModel(viewModel, '2014')
    expect(map.textFields['Racial Traits'].length).toBeLessThanOrEqual(310)
    expect(map.textFields['Background_Organisation.Right']).toBe(
      'Faction: The Harpers\nRank: Watcher',
    )
    expect(map.textFields['P5.ASnotes.Notes.Left']).toContain('RACIAL TRAITS (CONTINUED)')
    expect(map.textFields['P5.ASnotes.Notes.Left']).toContain('ORGANIZATION (CONTINUED)')
  })

  test('2014 fills missing feat and magic-item descriptions from matching sources only', () => {
    const character = makeCharacterFixture({
      feats: [{ id: 'alert', name: 'Alert', source: 'PHB', description: '' }],
      equipment: [
        {
          id: 'staff',
          name: 'Staff of Power',
          source: 'DMG',
          type: 'ST',
          quantity: 1,
          equipped: true,
          rarity: 'very rare',
          description: '',
        },
      ],
    })
    const viewModel = createCharacterSheetViewModel(character, {
      featsByKey: buildFeatLookup([{ name: 'Alert', source: 'PHB', entries: ['Always ready.'] }]),
      itemLookup: buildItemLookup([
        { name: 'Staff of Power', source: 'DMG', type: 'ST', entries: ['A powerful staff.'] },
      ]),
    })
    const map = mapCharacterSheetViewModel(viewModel, '2014')
    expect(map.textFields['Feat Description 1']).toBe('Always ready.')
    expect(map.textFields['Extra.Magic Item Description 1']).toBe('A powerful staff.')
  })

  test('2014 fills the active creature companion but ignores an inactive choice', async () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Ranger', source: 'PHB', levels: 3 }],
      classChoiceSelections: [
        {
          choiceId: 'inactive',
          label: 'Companion',
          kind: 'creature',
          inactive: true,
          className: 'Ranger',
          classSource: 'PHB',
          classLevel: 3,
          selected: [{ entityType: 'creature', name: 'Wolf', source: 'MM', slotLevel: 3 }],
        },
        {
          choiceId: 'active',
          label: 'Primal Companion',
          kind: 'creature',
          className: 'Ranger',
          classSource: 'PHB',
          classLevel: 3,
          selected: [
            { entityType: 'creature', name: 'Beast of the Land', source: 'TCE', slotLevel: 3 },
          ],
        },
      ],
    })
    const viewModel = createCharacterSheetViewModel(character, {
      creaturesByKey: {
        'Beast of the Land|TCE': {
          name: 'Beast of the Land',
          source: 'TCE',
          size: ['M'],
          type: 'beast',
          ac: [{ special: '13 + PB (natural armor)' }],
          hp: { special: '5 + five times your ranger level' },
          speed: { walk: 40 },
          str: 14,
          action: [{ name: 'Maul', entries: ['{@atk mw} {@hitYourSpellAttack} to hit.'] }],
        },
      },
    })
    const map = mapCharacterSheetViewModel(viewModel, '2014')
    expect(map.textFields['P4.AScomp.Comp.Desc.Name']).toBe('Beast of the Land')
    expect(map.textFields['P4.AScomp.Comp.Use.Ability.Str.Score']).toBe('14')
    expect(map.textFields['P4.AScomp.Comp.Use.HP.Max']).toBe('20')
    expect(map.textFields['P4.AScomp.Comp.Use.AC']).toBe('15')
    expect(map.textFields['P4.AScomp.Comp.Use.Attack.1.Weapon Selection']).toBe('Maul')
    expect(map.textFields['P4.AScomp.Comp.Use.Attack.1.Description']).toBe(
      'Melee Weapon Attack: your spell attack modifier to hit.',
    )
    const template = readFileSync(
      join(process.cwd(), 'scripts/pdf-sources/2014_MPMB_Character_Sheet.pdf'),
    )
    const output = await fillCharacterSheetPdf(template, map, { templateId: '2014-custom' })
    const form = (await PDFDocument.load(output)).getForm()
    expect(form.getTextField('P4.AScomp.Comp.Desc.Name').getText()).toBe('Beast of the Land')
    expect(form.getTextField('P4.AScomp.Comp.Use.Ability.Str.Score').getText()).toBe('14')
  }, 15_000)

  test('2014 Vision field from character visions', () => {
    const character = makeCharacterFixture({
      visions: [
        { type: 'Darkvision', range: 60 },
        { type: 'Blindsight', range: 10 },
      ],
    })

    const map = buildCharacterSheetFieldMap(character, '2014')

    expect(map.textFields.Vision).toBe('Darkvision 60 ft., Blindsight 10 ft.')
  })

  test('2014 Vision field empty when no visions', () => {
    const character = makeCharacterFixture({ visions: [] })
    const map = buildCharacterSheetFieldMap(character, '2014')
    expect(map.textFields.Vision).toBe('')
  })

  test('2014 Background Feature and Description from provenance features', () => {
    const character = makeCharacterFixture({
      features: [
        {
          id: 'feat-criminal-contact',
          name: 'Criminal Contact',
          source: 'PHB',
          description: 'You have a reliable contact in the criminal underworld.',
        },
      ],
      provenance: {
        proficiencies: {
          armor: {},
          weapons: {},
          tools: {},
          languages: {},
          skills: {},
          savingThrows: {},
        },
        abilityBonuses: [],
        features: {
          'Criminal Contact': [
            {
              sourceType: 'background',
              sourceName: 'Criminal',
              grantType: 'fixed',
              label: 'Criminal',
            },
          ],
        },
        feats: {},
        spells: {},
        equipment: {},
        choices: [],
      },
    })

    const map = buildCharacterSheetFieldMap(character, '2014')

    expect(map.textFields['Background Feature']).toBe('Criminal Contact')
    expect(map.textFields['Background Feature Description']).toBe(
      'You have a reliable contact in the criminal underworld.',
    )
  })

  test('2014 Background Feature empty when no background provenance', () => {
    const character = makeCharacterFixture()
    const map = buildCharacterSheetFieldMap(character, '2014')
    expect(map.textFields['Background Feature']).toBe('')
    expect(map.textFields['Background Feature Description']).toBe('')
  })

  test('2014 Spell save DC populated for spellcasting class', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 5 }],
      abilityScores: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 18,
        wisdom: 10,
        charisma: 10,
      },
    })
    // Wizard: spell save DC = 8 + prof(3) + INT mod(4) = 15
    const classesData = [
      {
        name: 'Wizard',
        source: 'PHB',
        spellcastingAbility: 'int',
        casterProgression: 'full',
        hd: { faces: 6 },
      } as never,
    ]

    const map = buildCharacterSheetFieldMap(character, '2014', classesData)

    expect(map.textFields['Spell save DC 1']).toBe('15')
    expect(map.textFields['Spell save DC 2']).toBe('')
  })

  test('2014 Spell save DC empty for non-spellcasting class', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 3 }],
    })
    const classesData = [{ name: 'Fighter', source: 'PHB', hd: { faces: 10 } } as never]

    const map = buildCharacterSheetFieldMap(character, '2014', classesData)

    expect(map.textFields['Spell save DC 1']).toBe('')
  })

  test('2014 Class Features populated from provenance class features', () => {
    const character = makeCharacterFixture({
      features: [
        {
          id: 'f1',
          name: 'Second Wind',
          source: 'PHB',
          description: 'Regain hit points as a bonus action.',
        },
        { id: 'f2', name: 'Darkvision', source: 'PHB', description: 'See in darkness 60 ft.' },
      ],
      provenance: {
        proficiencies: {
          armor: {},
          weapons: {},
          tools: {},
          languages: {},
          skills: {},
          savingThrows: {},
        },
        abilityBonuses: [],
        features: {
          'Second Wind': [
            { sourceType: 'class', sourceName: 'Fighter', grantType: 'fixed', label: 'Fighter' },
          ],
          Darkvision: [
            { sourceType: 'race', sourceName: 'Dwarf', grantType: 'fixed', label: 'Dwarf' },
          ],
        },
        feats: {},
        spells: {},
        equipment: {},
        choices: [],
      },
    })

    const map = buildCharacterSheetFieldMap(character, '2014')

    // Only class feature appears in Class Features
    expect(map.textFields['Class Features']).toContain('Second Wind')
    expect(map.textFields['Class Features']).not.toContain('Darkvision')
    // Racial feature appears in Racial Traits
    expect(map.textFields['Racial Traits']).toContain('Darkvision')
    expect(map.textFields['Racial Traits']).not.toContain('Second Wind')
  })

  test('2014 HP Max uses the calculated class and Constitution value', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 3 }],
      abilityScores: {
        strength: 10,
        dexterity: 10,
        constitution: 14,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      hitPoints: { current: 30, temporary: 0 },
    })
    const map = buildCharacterSheetFieldMap(character, '2014')
    expect(map.textFields['HP Max']).toBe('24')
  })

  test('2014 feats populate Feat Name/Description/Note fields', () => {
    const character = makeCharacterFixture({
      feats: [
        {
          id: 'f1',
          name: 'Alert',
          source: 'PHB',
          description: '+5 to initiative.',
          prerequisites: '',
        },
        {
          id: 'f2',
          name: 'War Caster',
          source: 'PHB',
          description: 'Advantage on concentration saves.',
          prerequisites: 'Spellcasting ability',
        },
      ],
    })

    const map = buildCharacterSheetFieldMap(character, '2014')

    expect(map.textFields['Feat Name 1']).toBe('Alert')
    expect(map.textFields['Feat Description 1']).toBe('+5 to initiative.')
    expect(map.textFields['Feat Note 1']).toBe('')
    expect(map.textFields['Feat Name 2']).toBe('War Caster')
    expect(map.textFields['Feat Description 2']).toBe('Advantage on concentration saves.')
    expect(map.textFields['Feat Note 2']).toBe('Spellcasting ability')
    expect(map.textFields['Feat Name 3']).toBe('')
    expect(map.textFields['Feat Name 4']).toBe('')
  })

  test('2014 Size Category mapped from race data', () => {
    const character = makeCharacterFixture({ race: 'Halfling', raceSource: 'PHB' })
    const racesData = [{ name: 'Halfling', source: 'PHB', size: ['S'] } as never]

    const map = buildCharacterSheetFieldMap(character, '2014', undefined, racesData)

    expect(map.textFields['Size Category']).toBe('Small')
  })

  test('2014 Size Category medium when race has M code', () => {
    const character = makeCharacterFixture({ race: 'Human', raceSource: 'PHB' })
    const racesData = [{ name: 'Human', source: 'PHB', size: ['M'] } as never]

    const map = buildCharacterSheetFieldMap(character, '2014', undefined, racesData)

    expect(map.textFields['Size Category']).toBe('Medium')
  })

  test('2014 Size Category empty when no race data provided', () => {
    const character = makeCharacterFixture({ race: 'Human' })
    const map = buildCharacterSheetFieldMap(character, '2014')
    expect(map.textFields['Size Category']).toBe('')
  })

  test('2014 Background_Appearance uses appearance field', () => {
    const character = makeCharacterFixture({
      details: { appearance: 'Tall with silver hair' },
    })

    const map = buildCharacterSheetFieldMap(character, '2014')

    expect(map.textFields.Background_Appearance).toBe('Tall with silver hair')
  })

  test('2014 Background_Appearance falls back to physicalDescription', () => {
    const character = makeCharacterFixture({
      details: { physicalDescription: 'Stocky and scarred' },
    })

    const map = buildCharacterSheetFieldMap(character, '2014')

    expect(map.textFields.Background_Appearance).toBe('Stocky and scarred')
  })

  test('2014 Background_Enemies uses nemesis field', () => {
    const character = makeCharacterFixture({
      details: { nemesis: 'The Iron Circle' },
    })

    const map = buildCharacterSheetFieldMap(character, '2014')

    expect(map.textFields.Background_Enemies).toBe('The Iron Circle')
  })

  test('2014 Racial Traits falls back to game data when provenance has no race features', () => {
    const character = makeCharacterFixture({ race: 'Dwarf', raceSource: 'PHB' })
    const racesData = [
      {
        name: 'Dwarf',
        source: 'PHB',
        entries: [
          {
            type: 'entries',
            name: 'Dwarven Resilience',
            entries: ['You have advantage on saving throws against poison.'],
          },
          {
            type: 'entries',
            name: 'Stonecunning',
            entries: [
              'Whenever you make a History check related to stonework, add double proficiency bonus.',
            ],
          },
        ],
      } as never,
    ]

    const map = buildCharacterSheetFieldMap(character, '2014', undefined, racesData)

    expect(map.textFields['Racial Traits']).toContain('Dwarven Resilience')
    expect(map.textFields['Racial Traits']).toContain('Stonecunning')
    expect(map.textFields['Racial Traits']).not.toBe('Dwarf')
  })

  test('2014 Racial Traits prefers provenance features over game data', () => {
    const character = makeCharacterFixture({
      race: 'Dwarf',
      raceSource: 'PHB',
      features: [
        {
          id: 'f1',
          name: 'Dwarven Resilience',
          source: 'PHB',
          description: 'Advantage on poison saves.',
        },
      ],
      provenance: {
        proficiencies: {
          armor: {},
          weapons: {},
          tools: {},
          languages: {},
          skills: {},
          savingThrows: {},
        },
        abilityBonuses: [],
        features: {
          'Dwarven Resilience': [
            { sourceType: 'race', sourceName: 'Dwarf', grantType: 'fixed', label: 'Dwarf' },
          ],
        },
        feats: {},
        spells: {},
        equipment: {},
        choices: [],
      },
    })
    const racesData = [
      {
        name: 'Dwarf',
        source: 'PHB',
        entries: [
          {
            type: 'entries',
            name: 'Dwarven Resilience',
            entries: ['From game data — should not appear.'],
          },
        ],
      } as never,
    ]

    const map = buildCharacterSheetFieldMap(character, '2014', undefined, racesData)

    expect(map.textFields['Racial Traits']).toContain('Dwarven Resilience')
    expect(map.textFields['Racial Traits']).not.toContain('From game data')
  })

  test('2014 Background Feature and Description from background game data (2014 style)', () => {
    const character = makeCharacterFixture({
      background: 'Soldier',
      backgroundSource: 'PHB',
    })
    const backgroundsData = [
      {
        name: 'Soldier',
        source: 'PHB',
        entries: [
          'You were a soldier.',
          {
            type: 'entries',
            name: 'Feature: Military Rank',
            entries: ['You have a military rank from your career as a soldier.'],
          },
        ],
      } as never,
    ]

    const map = buildCharacterSheetFieldMap(
      character,
      '2014',
      undefined,
      undefined,
      backgroundsData,
    )

    expect(map.textFields['Background Feature']).toBe('Military Rank')
    expect(map.textFields['Background Feature Description']).toContain('military rank')
  })

  test('2014 Background Feature provenance takes priority over game data', () => {
    const character = makeCharacterFixture({
      background: 'Soldier',
      backgroundSource: 'PHB',
      features: [
        {
          id: 'f-rank',
          name: 'Military Rank',
          source: 'PHB',
          description: 'Provenance description.',
        },
      ],
      provenance: {
        proficiencies: {
          armor: {},
          weapons: {},
          tools: {},
          languages: {},
          skills: {},
          savingThrows: {},
        },
        abilityBonuses: [],
        features: {
          'Military Rank': [
            {
              sourceType: 'background',
              sourceName: 'Soldier',
              grantType: 'fixed',
              label: 'Soldier',
            },
          ],
        },
        feats: {},
        spells: {},
        equipment: {},
        choices: [],
      },
    })
    const backgroundsData = [
      {
        name: 'Soldier',
        source: 'PHB',
        entries: [
          {
            type: 'entries',
            name: 'Feature: Military Rank',
            entries: ['Game data description — should not appear.'],
          },
        ],
      } as never,
    ]

    const map = buildCharacterSheetFieldMap(
      character,
      '2014',
      undefined,
      undefined,
      backgroundsData,
    )

    expect(map.textFields['Background Feature']).toBe('Military Rank')
    expect(map.textFields['Background Feature Description']).toBe('Provenance description.')
    expect(map.textFields['Background Feature Description']).not.toContain('Game data description')
  })

  test('2014 Background Feature empty when no background data and no provenance', () => {
    const character = makeCharacterFixture({ background: 'Unknown' })
    const map = buildCharacterSheetFieldMap(character, '2014', undefined, undefined, [])
    expect(map.textFields['Background Feature']).toBe('')
    expect(map.textFields['Background Feature Description']).toBe('')
  })

  test('2014 Vision falls back to race darkvision when character has no visions', () => {
    const character = makeCharacterFixture({ race: 'Half-Elf', raceSource: 'PHB' })
    const racesData = [{ name: 'Half-Elf', source: 'PHB', darkvision: 60 } as never]

    const map = buildCharacterSheetFieldMap(character, '2014', undefined, racesData)

    expect(map.textFields.Vision).toBe('Darkvision 60 ft.')
  })

  test('2014 Vision uses stored visions over race fallback', () => {
    const character = makeCharacterFixture({
      race: 'Half-Elf',
      raceSource: 'PHB',
      visions: [{ type: 'darkvision', range: 120 }],
    })
    const racesData = [{ name: 'Half-Elf', source: 'PHB', darkvision: 60 } as never]

    const map = buildCharacterSheetFieldMap(character, '2014', undefined, racesData)

    expect(map.textFields.Vision).toBe('Darkvision 120 ft.')
  })

  test('2014 HP Max falls back to calculated value when stored max is 0', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 1 }],
      abilityScores: {
        strength: 10,
        dexterity: 10,
        constitution: 14,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
      hitPoints: { current: 0, temporary: 0 },
    })
    // Fighter d10, CON +2, level 1 average = 12
    const classesData = [{ name: 'Fighter', source: 'PHB', hd: { faces: 10 } } as never]
    const map = buildCharacterSheetFieldMap(character, '2014', classesData)
    expect(map.textFields['HP Max']).toBe('12')
  })

  test('should hide interactive 2014 chrome widgets while keeping portrait field', async () => {
    const templateDoc = await PDFDocument.create()
    const page = templateDoc.addPage([600, 800])
    const form = templateDoc.getForm()

    const pcName = form.createTextField('PC Name')
    pcName.addToPage(page, { x: 20, y: 760, width: 180, height: 24 })

    const attackMod = form.createDropdown('Attack.1.Mod')
    attackMod.addOptions(['empty', '+1'])
    attackMod.select('empty')
    attackMod.addToPage(page, { x: 20, y: 720, width: 120, height: 20 })

    const hiddenButton = form.createButton('Print Button')
    hiddenButton.addToPage('Print', page, {
      x: 20,
      y: 680,
      width: 120,
      height: 20,
    })

    const portraitButton = form.createButton('Portrait')
    portraitButton.addToPage('Portrait', page, {
      x: 20,
      y: 640,
      width: 120,
      height: 20,
    })

    const ammo = form.createCheckBox('AmmoLeft.Top.1')
    ammo.addToPage(page, { x: 20, y: 600, width: 18, height: 18 })

    const templateBytes = await templateDoc.save()

    const filledBytes = await fillCharacterSheetPdf(
      templateBytes,
      { textFields: { 'PC Name': 'Hidden UI Test' }, checkboxFields: {} },
      { cleanupProfile: 'mpmb-2014' },
    )

    const outputDoc = await PDFDocument.load(filledBytes)
    const outputForm = outputDoc.getForm()

    const outputAttackMod = outputForm.getDropdown('Attack.1.Mod')
    expect(outputAttackMod.getSelected()).toEqual([])

    const outputHiddenButton = asFieldWithInternals(outputForm.getButton('Print Button'))
    const outputPortraitButton = outputForm.getButton('Portrait') as unknown as {
      acroField: {
        getWidgets: () => Array<{ getRectangle: () => { width: number } }>
      }
    }
    const outputAmmo = outputForm.getCheckBox('AmmoLeft.Top.1') as unknown as {
      acroField: {
        getWidgets: () => Array<{ getRectangle: () => { width: number } }>
      }
    }

    expect(outputHiddenButton?.acroField.getWidgets()[0].getRectangle().width).toBe(0)
    expect(outputHiddenButton?.acroField.getWidgets()[0].dict.has(PDFName.of('AP'))).toBe(false)
    expect(outputAmmo.acroField.getWidgets()[0].getRectangle().width).toBe(0)
    expect(outputPortraitButton.acroField.getWidgets()[0].getRectangle().width).toBe(120)
  })

  test('locates an image widget from its page annotation when its page reference is stale', async () => {
    const document = await PDFDocument.create()
    const wrongPage = document.addPage([600, 800])
    const attachedPage = document.addPage([600, 800])
    const portrait = document.getForm().createButton('Portrait')
    portrait.addToPage('Portrait', attachedPage, {
      x: 20,
      y: 640,
      width: 120,
      height: 100,
    })
    const widget = asFieldWithInternals(portrait)?.acroField.getWidgets()[0]
    expect(widget).toBeDefined()
    widget?.dict.set(PDFName.of('P'), wrongPage.ref)

    const location = widget ? findAttachedWidgetLocation(document, [widget]) : null
    expect(location?.pageIndex).toBe(1)
    expect(location?.widget).toBe(widget)
  })

  test('embeds a custom organization image into the 2014 symbol field', async () => {
    const templateDoc = await PDFDocument.create()
    const page = templateDoc.addPage([600, 800])
    const symbol = templateDoc.getForm().createButton('Symbol')
    symbol.addToPage('Click Here To Change This Icon', page, {
      x: 400,
      y: 500,
      width: 150,
      height: 120,
    })
    const templateBytes = await templateDoc.save()
    const imageBytes = readFileSync(
      join(process.cwd(), 'public', 'assets', 'images', 'ui', 'logo.png'),
    )
    const organizationCustomImage = `data:image/png;base64,${imageBytes.toString('base64')}`
    const character = makeCharacterFixture({
      details: {
        organizationSelectionKey: '__custom__',
        organizationCustomImage,
      },
    })

    const filledBytes = await fillCharacterSheetPdf(
      templateBytes,
      { textFields: {}, checkboxFields: {} },
      {
        cleanupProfile: 'mpmb-2014',
        organizationImageFieldName: 'Symbol',
        organizationImage: character.details.organizationCustomImage,
      },
    )
    const outputDoc = await PDFDocument.load(filledBytes)
    const outputSymbol = asFieldWithInternals(outputDoc.getForm().getButton('Symbol'))

    expect(outputSymbol?.acroField.getWidgets()[0]?.getRectangle().width).toBe(0)
  })

  test('2014 equipment populates Adventuring Gear row fields', () => {
    const character = makeCharacterFixture({
      equipment: [
        { id: 'e1', name: 'Longsword', type: 'M', quantity: 1, equipped: true, weight: 3 },
        { id: 'e2', name: 'Torch', type: 'G', quantity: 5, equipped: false, weight: 1 },
        { id: 'e3', name: 'Backpack', type: 'G', quantity: 1, equipped: false },
      ],
    })
    const map = buildCharacterSheetFieldMap(character, '2014')

    expect(map.textFields['Adventuring Gear Row 1']).toBe('Longsword')
    expect(map.textFields['Adventuring Gear Amount 1']).toBe('1')
    expect(map.textFields['Adventuring Gear Weight 1']).toBe('3')

    expect(map.textFields['Adventuring Gear Row 2']).toBe('Torch')
    expect(map.textFields['Adventuring Gear Amount 2']).toBe('5')
    expect(map.textFields['Adventuring Gear Weight 2']).toBe('1')

    expect(map.textFields['Adventuring Gear Row 3']).toBe('Backpack')
    expect(map.textFields['Adventuring Gear Amount 3']).toBe('1')
    expect(map.textFields['Adventuring Gear Weight 3']).toBe('')

    expect(map.textFields['Adventuring Gear Row 4']).toBeUndefined()
  })

  test('2014 equipment continues onto the 36-row extra gear page', () => {
    const equipment = Array.from({ length: 95 }, (_, i) => ({
      id: `e${i}`,
      name: `Item ${i + 1}`,
      type: 'G',
      quantity: 1,
      equipped: false,
    }))
    const character = makeCharacterFixture({ equipment })
    const map = buildCharacterSheetFieldMap(character, '2014')

    expect(map.textFields['Adventuring Gear Row 54']).toBe('Item 54')
    expect(map.textFields['Adventuring Gear Row 55']).toBeUndefined()
    expect(map.textFields['Extra.Gear Row 1']).toBe('Item 55')
    expect(map.textFields['Extra.Gear Row 36']).toBe('Item 90')
    expect(map.textFields['Extra.Gear Row 37']).toBeUndefined()
  })

  test('2024 maps weapons, spellcasting, spell slots, spells, history, and inventory', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 5 }],
      abilityScores: {
        strength: 8,
        dexterity: 16,
        constitution: 14,
        intelligence: 18,
        wisdom: 12,
        charisma: 10,
      },
      proficiencies: {
        armor: ['Light Armor'],
        weapons: ['Martial Weapons'],
        tools: ["Calligrapher's Supplies"],
        languages: ['Common', 'Draconic'],
        skills: ['arcana'],
        expertise: [],
        savingThrows: ['intelligence', 'wisdom'],
      },
      equipment: [
        {
          id: 'longbow',
          name: 'Longbow',
          type: 'R',
          quantity: 1,
          equipped: true,
          weaponCategory: 'martial',
          dmg1: '1d8',
          dmgType: 'P',
          properties: ['A'],
          range: '150/600 ft.',
        },
        {
          id: 'wand',
          name: 'Wand of Web',
          type: 'WD',
          quantity: 1,
          equipped: true,
          attuned: true,
          rarity: 'Uncommon',
        },
      ],
      currency: { cp: 1, sp: 2, ep: 3, gp: 42, pp: 5 },
      details: {
        alignment: 'Neutral Good',
        appearance: 'Ink-stained fingers and blue robes.',
        personalityTraits: 'Always asks one more question.',
        backstory: 'Studied a map written in starlight.',
      },
      spells: {
        spellProfiles: [
          {
            id: 'class:Wizard|PHB',
            type: 'class',
            label: 'Wizard (Lv 5)',
            className: 'Wizard',
            classSource: 'PHB',
            castingAbility: 'int',
            cantrips: ['Fire Bolt|PHB'],
            spellsKnown: [],
            preparedSpells: ['Magic Missile|PHB'],
          },
        ],
        spellSlots: { 1: { max: 4, used: 2 } },
      },
    })
    const classesData = parseClasses(
      JSON.parse(readFileSync(join(process.cwd(), 'data/class/class-wizard.json'), 'utf8')),
    ) as Class5e[]
    const spellsData: Spell5e[] = [
      {
        name: 'Fire Bolt',
        source: 'PHB',
        level: 0,
        school: 'V',
        time: [{ number: 1, unit: 'action' }],
        range: { type: 'point', distance: { type: 'feet', amount: 120 } },
        components: { v: true, s: true },
        duration: [{ type: 'instant' }],
      },
      {
        name: 'Magic Missile',
        source: 'PHB',
        level: 1,
        school: 'V',
        time: [{ number: 1, unit: 'action' }],
        range: { type: 'point', distance: { type: 'feet', amount: 120 } },
        components: { v: true, s: true },
        duration: [{ type: 'instant' }],
        meta: { ritual: true },
      },
    ]
    const viewModel = prepareViewModel(character, classesData, [], [], spellsData, {
      A: 'Ammunition',
    })
    const map = mapCharacterSheetViewModel(viewModel, '2024')

    expect(map.textFields.Text_61).toBe('Longbow')
    expect(map.textFields.Text_67).toBe('+6')
    expect(map.textFields.Text_73).toBe('1d8 + 3 Piercing')
    expect(map.textFields.Text_79).toBe('Ammunition')
    expect(map.textFields.Text_230).toBe('Intelligence')
    expect(map.textFields.Text_85).toBe('+4')
    expect(map.textFields.Text_86).toBe('15')
    expect(map.textFields.Text_87).toBe('+7')
    expect(map.textFields.Text_220).toBe('4')
    expect(map.checkboxFields.Checkbox_37).toBe(true)
    expect(map.checkboxFields.Checkbox_38).toBe(true)
    expect(map.checkboxFields.Checkbox_39).toBe(false)
    expect(map.textFields.Text_92).toBe('C')
    expect(map.textFields.Text_122).toBe('Fire Bolt')
    expect(map.textFields.Text_93).toBe('1')
    expect(map.textFields.Text_123).toBe('Magic Missile')
    expect(map.checkboxFields.Checkbox_63).toBe(true)
    expect(map.textFields.Text_88).toContain('Ink-stained fingers')
    expect(map.textFields.Text_89).toContain('Studied a map')
    expect(map.textFields.Text_90).toContain('Longbow')
    expect(map.textFields.Text_212).toBe('Wand of Web')
    expect(map.checkboxFields.Checkbox_151).toBe(true)
    expect(map.textFields.Text_218).toBe('42')
  })

  test('2014 maps attacks, hit dice, defenses, armor details, and character history', () => {
    const character = makeCharacterFixture({
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 5 }],
      hitDiceUsed: { 'fighter|phb': 2 },
      abilityScores: {
        strength: 16,
        dexterity: 14,
        constitution: 14,
        intelligence: 10,
        wisdom: 12,
        charisma: 8,
      },
      proficiencies: {
        armor: ['Heavy Armor', 'Shields'],
        weapons: ['Martial Weapons'],
        tools: [],
        languages: ['Common'],
        skills: [],
        expertise: [],
        savingThrows: ['strength', 'constitution'],
      },
      equipment: [
        {
          id: 'sword',
          name: 'Longsword',
          type: 'M',
          quantity: 1,
          equipped: true,
          weaponCategory: 'martial',
          dmg1: '1d8',
          dmg2: '1d10',
          dmgType: 'S',
          properties: ['V'],
          weight: 3,
        },
        {
          id: 'plate',
          name: 'Plate Armor',
          type: 'HA',
          quantity: 1,
          equipped: true,
          armorType: 'heavy',
          ac: 18,
          weight: 65,
        },
        {
          id: 'shield',
          name: 'Shield',
          type: 'S',
          quantity: 1,
          equipped: true,
          armorType: 'shield',
          ac: 2,
          weight: 6,
        },
      ],
      damageResistances: ['Fire'],
      damageImmunities: ['Poison'],
      conditionImmunities: ['Charmed'],
      details: {
        faith: 'Torm',
        lifestyle: 'Comfortable',
        appearance: 'A veteran with a broken nose.',
        backstory: 'Held the bridge at dawn.',
        faction: 'The Harpers',
        rank: 'Watcher',
      },
    })
    const classesData = [{ name: 'Fighter', source: 'PHB', hd: { faces: 10 } } as Class5e]
    const map = mapCharacterSheetViewModel(
      prepareViewModel(character, classesData, [], [], [], { V: 'Versatile' }),
      '2014',
    )

    expect(map.textFields['Attack.1.Weapon Selection']).toBe('Longsword')
    expect(map.textFields['Attack.1.To Hit']).toBe('+6')
    expect(map.textFields['Attack.1.Damage']).toBe('1d8 + 3')
    expect(map.textFields['Attack.1.Damage Type']).toBe('Slashing')
    expect(map.textFields['Attack.1.Description']).toContain('Versatile 1d10')
    expect(map.textFields['HD1 Level']).toBe('5')
    expect(map.textFields['HD1 Die']).toBe('d10')
    expect(map.textFields['HD1 Used']).toBe('2')
    expect(map.textFields['Resistance Damage Type 1']).toBe('Fire resistance')
    expect(map.textFields['Resistance Damage Type 2']).toBe('Poison immunity')
    expect(map.textFields['Resistance Damage Type 3']).toBe('Charmed condition immunity')
    expect(map.textFields['AC Armor Description']).toBe('Plate Armor')
    expect(map.textFields['AC Shield Bonus Description']).toBe('Shield')
    expect(map.textFields['Faith/Deity']).toBe('Torm')
    expect(map.textFields.Lifestyle).toBe('Comfortable')
    expect(map.textFields.Background_History).toContain('Held the bridge at dawn')
    expect(map.textFields['Background_Faction.Text']).toBe('The Harpers')
    expect(map.textFields['Background_FactionRank.Text']).toBe('Watcher')
  })

  test('projects active typed defensive effects without duplicating persisted traits', () => {
    const character = makeCharacterFixture({
      damageResistances: ['test damage'],
      manualEffects: [
        {
          id: 'effect-active-duplicate',
          label: 'Duplicate defense',
          source: { kind: 'manual', name: 'Test adjustment' },
          target: { kind: 'damage-resistance', damageType: 'test damage' },
          operation: { kind: 'grant' },
        },
        {
          id: 'effect-active-immunity',
          label: 'Additional defense',
          source: { kind: 'manual', name: 'Test adjustment' },
          target: { kind: 'condition-immunity', condition: 'test condition' },
          operation: { kind: 'grant' },
        },
        {
          id: 'effect-suppressed',
          label: 'Suppressed defense',
          source: { kind: 'manual', name: 'Test adjustment' },
          target: { kind: 'damage-immunity', damageType: 'suppressed damage' },
          operation: { kind: 'grant' },
        },
      ],
      suppressedEffectIds: ['effect-suppressed'],
    })

    const viewModel = prepareViewModel(character)

    expect(viewModel.defensiveTraits).toEqual([
      'test damage resistance',
      'test condition condition immunity',
    ])
  })

  test('projects regular, bonus, and class-owned feats through one ordered PDF list', () => {
    const regularFeat = {
      id: 'feat-regular',
      name: 'Regular Test Feat',
      source: 'TEST',
      description: 'Regular selection.',
    }
    const bonusFeat = {
      id: 'feat-bonus',
      name: 'Bonus Test Feat',
      source: 'TEST',
      description: 'Bonus selection.',
    }
    const classFeat = {
      id: 'feat-class',
      name: 'Class Test Feat',
      source: 'TEST',
      description: 'Class-owned selection.',
    }
    const viewModel = prepareViewModel(
      makeCharacterFixture({
        feats: [regularFeat],
        specialFeats: [bonusFeat],
        classFeatChoices: [
          {
            id: 'class-choice',
            className: 'Test Class',
            classSource: 'TEST',
            progressionName: 'Test Progression',
            categories: [],
            feats: [classFeat],
          },
        ],
      }),
    )
    const map = mapCharacterSheetViewModel(viewModel, '2014')

    expect(viewModel.feats.map((feat) => feat.id)).toEqual([
      'feat-regular',
      'feat-bonus',
      'feat-class',
    ])
    expect(map.textFields['Feat Name 1']).toBe('Regular Test Feat')
    expect(map.textFields['Feat Name 2']).toBe('Bonus Test Feat')
    expect(map.textFields['Feat Name 3']).toBe('Class Test Feat')
  })

  test('2014 official limits long sections and writes readable, bounded text appearances', async () => {
    const viewModel = prepareViewModel(makeCharacterFixture())
    viewModel.equipmentSummary = Array.from(
      { length: 50 },
      (_, index) => `Equipment item ${index + 1}`,
    ).join('\n')
    viewModel.featuresSummary = 'A detailed class feature. '.repeat(50)
    viewModel.featsSummary = 'Alert: Always ready.'
    viewModel.racialTraitsSummary = 'A detailed ancestry trait. '.repeat(60)
    viewModel.magicItems = Array.from({ length: 60 }, (_, index) => ({
      name: `Treasure ${index + 1}`,
    })) as typeof viewModel.magicItems

    const map = mapCharacterSheetViewModel(viewModel, '2014-official')
    for (const [name, limit] of Object.entries(OFFICIAL_2014_SECTION_LIMITS)) {
      expect(map.textFields[name].length).toBeLessThanOrEqual(limit)
      expect(map.textFields[name]).toMatch(/\.\.\.$/)
    }
    expect(map.textFields['Feat+Traits']).toContain('Alert: Always ready.')
    expect(
      map.textFields.Equipment.split('\n')
        .slice(-1)[0]
        ?.replace(/\.\.\.$/, ''),
    ).toMatch(/^Equipment item \d+$/)

    const templateBytes = new Uint8Array(
      readFileSync(join(process.cwd(), 'scripts/pdf-sources/2014_Official_Character_Sheet.pdf')),
    )
    const filledBytes = await fillCharacterSheetPdf(templateBytes, map, {
      templateId: '2014-official',
    })
    const filledForm = (await PDFDocument.load(filledBytes)).getForm()
    for (const name of Object.keys(OFFICIAL_2014_SECTION_LIMITS)) {
      const field = filledForm.getTextField(name)
      expect(field.getText()).toBe(map.textFields[name])
      expect(field.getMaxLength()).toBeUndefined()
    }
    for (const [name, min, max] of [
      ['ST Strength', 7, 7],
      ['Acrobatics', 7, 7],
      ['HPMax', 9, 9],
      ['Equipment', 7.5, 9],
      ['Features and Traits', 8, 10],
      ['Feat+Traits', 8, 10],
      ['Treasure', 9, 11],
    ] as const) {
      const field = filledForm.getTextField(name)
      const appearance = field.acroField.dict.get(PDFName.of('DA')) as unknown as {
        decodeText: () => string
      }
      const fontSize = Number(appearance.decodeText().match(/([\d.]+)\s+Tf/)?.[1])
      expect(fontSize).toBeGreaterThanOrEqual(min)
      expect(fontSize).toBeLessThanOrEqual(max)
    }
  })

  test('2024 official aligns printed controls and keeps small numeric fields legible', async () => {
    const templateBytes = new Uint8Array(
      readFileSync(join(process.cwd(), 'public/pdf/2024_Official_Character_Sheet.pdf')),
    )
    const template = await PDFDocument.load(templateBytes)
    const armor = template.getForm().getCheckBox('Checkbox_33').acroField.getWidgets()[0]
    expect(armor.getRectangle().x + armor.getRectangle().width / 2).toBeCloseTo(62.9, 1)
    const death = template.getForm().getCheckBox('Checkbox_2').acroField.getWidgets()[0]
    expect(death.getRectangle().y).toBeGreaterThan(726)
    const form = template.getForm()
    expect(form.getTextField('Text_9').getAlignment()).toBe(TextAlignment.Center)
    expect(form.getTextField('Text_8').acroField.getWidgets()[0].getRectangle().y).toBeLessThan(723)
    expect(form.getTextField('Text_16').acroField.getWidgets()[0].getRectangle().y).toBeGreaterThan(
      626,
    )
    expect(
      form.getTextField('Text_215').acroField.getWidgets()[0].getRectangle().height,
    ).toBeGreaterThan(14)
    expect(
      form.getCheckBox('Checkbox_8').acroField.getWidgets()[0].getRectangle().y,
    ).toBeGreaterThan(505)
    expect(form.getCheckBox('Checkbox_10').acroField.getWidgets()[0].getRectangle().y).toBeLessThan(
      388,
    )
    expect(form.getCheckBox('Checkbox_32').acroField.getWidgets()[0].getRectangle().x).toBeLessThan(
      54,
    )
    expect(form.getCheckBox('Checkbox_57').acroField.getWidgets()[0].getRectangle().x).toBeLessThan(
      367,
    )
    expect(form.getCheckBox('Checkbox_62').acroField.getWidgets()[0].getRectangle().y).toBeLessThan(
      567,
    )
    const checkboxY = (id: number) =>
      form.getCheckBox(`Checkbox_${id}`).acroField.getWidgets()[0].getRectangle().y
    expect(checkboxY(11)).toBeLessThan(369) // Dexterity skills
    expect(checkboxY(14)).toBeLessThan(390) // Wisdom skills
    expect(checkboxY(25)).toBeLessThan(217) // Charisma skills
    expect(checkboxY(32)).toBeLessThan(179.5) // Heroic Inspiration
    expect(checkboxY(36)).toBeGreaterThan(122) // Shield training
    expect(checkboxY(62)).toBeGreaterThan(565.8) // Top third of spells
    expect(checkboxY(104)).toBeCloseTo(294.1, 1) // Middle third remains centered
    expect(checkboxY(148)).toBeLessThan(23) // Bottom third of spells
    for (let row = 0; row < 30; row += 1) {
      // Centers measured from the evenly spaced diamonds in the official artwork.
      const printedDiamondY = 588.96 - row * 19.44
      for (let column = 0; column < 3; column += 1) {
        const widget = form
          .getCheckBox(`Checkbox_${59 + row * 3 + column}`)
          .acroField.getWidgets()[0]
          .getRectangle()
        expect(Math.abs(widget.y + widget.height / 2 - printedDiamondY)).toBeLessThan(0.75)
      }
    }
    for (const [name, minimumHeight] of [
      ['Text_1', 16], // Name
      ['Text_6', 16], // Level
      ['Text_8', 16], // Armor Class
      ['Text_9', 16], // Current HP
      ['Text_12', 16], // Spent Hit Dice
      ['Text_25', 18], // Ability score
    ] as const) {
      const widget = template.getForm().getTextField(name).acroField.getWidgets()[0]
      expect(widget.getRectangle().height).toBeGreaterThan(minimumHeight)
      expect(widget.getAppearanceCharacteristics()?.getBackgroundColor()).toBeUndefined()
    }

    const fields = buildCharacterSheetFieldMap(makeCharacterFixture(), '2024-official')
    fields.textFields.Text_1 = 'Full-Coverage Test Character (2024)'
    fields.textFields.Text_7 = '355000'
    fields.textFields.Text_8 = '24'
    fields.textFields.Text_9 = '121'
    fields.textFields.Text_31 = '+17'
    fields.textFields.Text_90 = Array.from({ length: 80 }, (_, index) => `Item ${index + 1}`).join(
      '\n',
    )
    fields.textFields.Text_218 = '12450'
    fields.checkboxFields.Checkbox_2 = true
    fields.checkboxFields.Checkbox_33 = true
    const filled = (
      await PDFDocument.load(
        await fillCharacterSheetPdf(templateBytes, fields, { templateId: '2024-official' }),
      )
    ).getForm()

    for (const name of ['Text_1', 'Text_7', 'Text_8', 'Text_9', 'Text_31', 'Text_218', 'Text_90']) {
      const field = filled.getTextField(name)
      const bounds = getOfficial2024FontBounds(name)
      expect(bounds).not.toBeNull()
      const appearance = field.acroField.dict.get(PDFName.of('DA')) as unknown as {
        decodeText: () => string
      }
      const fontSize = Number(appearance.decodeText().match(/([\d.]+)\s+Tf/)?.[1])
      expect(fontSize).toBeGreaterThanOrEqual(bounds!.min)
      expect(fontSize).toBeLessThanOrEqual(bounds!.max)
    }
    expect(filled.getTextField('Text_7').getText()).toBe('355000')
    expect(filled.getTextField('Text_31').getText()).toBe('+17')
    expect(filled.getTextField('Text_218').getText()).toBe('12450')
    expect(filled.getTextField('Text_90').getText()).toMatch(/\.\.\.$/)
    expect(filled.getCheckBox('Checkbox_2').isChecked()).toBe(true)
    expect(filled.getCheckBox('Checkbox_33').isChecked()).toBe(true)
  })

  test.each([
    '2014-official',
    '2014-custom',
    '2024-official',
    '2024-custom',
  ] as const)('%s mapping only targets fields present in the shipped template', async (templateId) => {
    const equipment = Array.from({ length: 90 }, (_, index) => ({
      id: `item-${index}`,
      name: `Item ${index + 1}`,
      type: index < 5 ? 'WO' : 'G',
      quantity: 1,
      equipped: false,
      attuned: index < 3,
      rarity: index < 5 ? 'Uncommon' : undefined,
    }))
    const map = buildCharacterSheetFieldMap(makeCharacterFixture({ equipment }), templateId)
    const templateBytes = new Uint8Array(sourceTemplateBytes(templateId))
    const template = await PDFDocument.load(templateBytes)
    const fieldNames = new Set(
      template
        .getForm()
        .getFields()
        .map((field) => field.getName()),
    )

    expect(Object.keys(map.textFields).filter((name) => !fieldNames.has(name))).toEqual([])
    expect(Object.keys(map.checkboxFields).filter((name) => !fieldNames.has(name))).toEqual([])
    if (templateId.startsWith('2024')) {
      expect(Object.keys(map.textFields)).toHaveLength(templateId === '2024-official' ? 260 : 230)
      expect(Object.keys(map.checkboxFields)).toHaveLength(151)
    }
  })
})
