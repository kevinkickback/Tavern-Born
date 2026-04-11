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
      abilityScores: {
        strength: 12,
        dexterity: 16,
        constitution: 14,
        intelligence: 10,
        wisdom: 15,
        charisma: 8,
      },
      armorClass: 16,
      speed: 35,
      hitPoints: {
        max: 31,
        current: 24,
        temporary: 5,
      },
    })

    const map = buildCharacterSheetFieldMap(character, '2024')

    expect(map.textFields.Text_1).toBe('Aria Stormborn')
    expect(map.textFields.Text_2).toBe('Ranger 3 / Fighter 1')
    expect(map.textFields.Text_3).toBe('Wood Elf')
    expect(map.textFields.Text_4).toBe('Outlander')

    expect(map.textFields.Text_22).toBe('12')
    expect(map.textFields.Text_23).toBe('16')
    expect(map.textFields.Text_14).toBe('16')
    expect(map.textFields.Text_9).toBe('35 ft')
    expect(map.textFields.Text_10).toBe('31')
    expect(map.textFields.Text_11).toBe('24')
    expect(map.textFields.Text_12).toBe('5')
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
