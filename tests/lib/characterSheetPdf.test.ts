import { PDFDocument } from '@cantoo/pdf-lib'
import { describe, expect, test } from 'vitest'
import {
  buildCharacterSheetFieldMap,
  generateFilledCharacterSheetPdf,
} from '@/lib/pdf/characterSheetPdf'
import { makeCharacterFixture } from '../fixtures/characterFixtures'

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
      level: 4,
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
      speed: 35,
      hitPoints: {
        max: 31,
        current: 24,
        temporary: 5,
      },
      hitDiceUsed: 1,
      proficiencies: {
        armor: [],
        weapons: [],
        tools: [],
        languages: ['Common', 'Elvish'],
        skills: [],
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
    expect(map.textFields.Text_2).toBe('Ranger 3 / Fighter 1')
    expect(map.textFields.Text_3).toBe('Wood Elf')
    expect(map.textFields.Text_4).toBe('Outlander')
    expect(map.textFields.Text_5).toBe('Chaotic Good')
    expect(map.textFields.Text_6).toBe('4')

    expect(map.textFields.Text_22).toBe('12')
    expect(map.textFields.Text_23).toBe('16')
    expect(map.textFields.Text_14).toBe('16')
    expect(map.textFields.Text_9).toBe('35 ft')
    expect(map.textFields.Text_10).toBe('31')
    expect(map.textFields.Text_11).toBe('24')
    expect(map.textFields.Text_12).toBe('5')
    expect(map.textFields.Text_13).toBe('3')
    expect(map.textFields.Text_56).toBe('Common, Elvish')
    expect(map.textFields.Text_58).toBe('Alert: You gain a +5 bonus to initiative.')
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

    expect(map.checkboxFields.Checkbox_1).toBe(true)
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
      skills: {
        stealth: { proficient: true, expertise: true, bonus: 0 },
      },
      level: 5,
      classProgression: [{ name: 'Rogue', source: 'PHB', levels: 5 }],
    })

    const map = buildCharacterSheetFieldMap(character, '2024')

    expect(map.checkboxFields.Checkbox_9).toBe(true)
    expect(map.checkboxFields.Checkbox_12).toBe(true)
    expect(map.checkboxFields.Checkbox_8).toBe(false)

    expect(map.checkboxFields.Checkbox_28).toBe(true)
    expect(map.checkboxFields.Checkbox_18).toBe(true)
    expect(map.checkboxFields.Checkbox_20).toBe(false)

    expect(map.textFields.Text_46).toBe('+9')
  })

  test('should map key identity and proficiency fields for 2014 template', () => {
    const character = makeCharacterFixture({
      name: 'Bren Ironhand',
      classProgression: [{ name: 'Fighter', source: 'PHB', levels: 5 }],
      level: 5,
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
        savingThrows: [],
      },
    })

    const map = buildCharacterSheetFieldMap(character, '2014')

    expect(map.checkboxFields['Proficiency Armor Light']).toBe(false)
    expect(map.checkboxFields['Proficiency Armor Heavy']).toBe(false)
    expect(map.checkboxFields['Proficiency Weapon Martial']).toBe(false)
    expect(map.checkboxFields['Proficiency Weapon Other']).toBe(false)
  })

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
      level: 5,
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
      level: 3,
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

  test('2014 HP Max uses stored value when non-zero', () => {
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
      hitPoints: { max: 42, current: 30, temporary: 0 },
    })
    const map = buildCharacterSheetFieldMap(character, '2014')
    expect(map.textFields['HP Max']).toBe('42')
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
      hitPoints: { max: 0, current: 0, temporary: 0 },
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

    const character = makeCharacterFixture({
      name: 'Hidden UI Test',
    })

    const filledBytes = await generateFilledCharacterSheetPdf(character, templateBytes, '2014')

    const outputDoc = await PDFDocument.load(filledBytes)
    const outputForm = outputDoc.getForm()

    const outputAttackMod = outputForm.getDropdown('Attack.1.Mod')
    expect(outputAttackMod.getSelected()).toEqual([])

    const outputHiddenButton = outputForm.getButton('Print Button') as unknown as {
      acroField: {
        getWidgets: () => Array<{ getRectangle: () => { width: number } }>
      }
    }
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

    expect(outputHiddenButton.acroField.getWidgets()[0].getRectangle().width).toBe(0)
    expect(outputAmmo.acroField.getWidgets()[0].getRectangle().width).toBe(0)
    expect(outputPortraitButton.acroField.getWidgets()[0].getRectangle().width).toBe(120)
  })
})
