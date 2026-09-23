import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  decodePDFRawStream,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  StandardFonts,
} from '@cantoo/pdf-lib'
import { describe, expect, test } from 'vitest'
import { buildClassLookup, buildSpellLookup } from '@/lib/5etools/lookups'
import { parseClasses, parseSpells } from '@/lib/5etools/parsers'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import {
  getOfficial2014SpellPages,
  OFFICIAL_2014_SPELL_FIELDS_BY_LEVEL,
} from '@/lib/pdf/characterSheetMapping2014Official'
import {
  buildCharacterSheetFieldMap,
  createCharacterSheetViewModel,
} from '@/lib/pdf/characterSheetPdf'
import { getPdfExportPreflight } from '@/lib/pdf/exportPreflight'
import { fillCharacterSheetPdf } from '@/lib/pdf/pdfFormAdapter'
import type { Class5e, Spell5e } from '@/types/5etools'
import { generateTestCharacterSheet, sourceTemplateBytes } from '../fixtures/pdfTemplates'

const json = (path: string) => JSON.parse(readFileSync(join(process.cwd(), path), 'utf8'))
const classes = ['wizard', 'warlock', 'fighter', 'cleric'].flatMap((name) =>
  parseClasses(json(`data/class/class-${name}.json`)),
)
const spells = ['phb', 'xphb'].flatMap((name) =>
  parseSpells(json(`data/spells/spells-${name}.json`)),
)
const lookups = {
  classesByKey: buildClassLookup(classes as Class5e[]),
  spellsByKey: buildSpellLookup(spells as Spell5e[]),
}
const templateBytes = sourceTemplateBytes

describe('PDF export review regressions', () => {
  test.each([
    30, 120,
  ])('official 2014 preserves and visibly fits a walking speed of %s ft', async (speed) => {
    const vm = createCharacterSheetViewModel(
      createEmptyCharacter({
        movement: { speeds: { walk: speed }, source: { kind: 'manual', name: 'Speed regression' } },
      }),
      {},
    )
    const map = buildCharacterSheetFieldMap(vm, '2014-official')
    expect(map.textFields.Speed).toBe(`${speed} ft`)
    const saved = await PDFDocument.load(
      await fillCharacterSheetPdf(templateBytes('2014-official'), map, {
        templateId: '2014-official',
      }),
    )
    const field = saved.getForm().getTextField('Speed')
    expect(field.getText()).toBe(`${speed} ft`)
    const widget = field.acroField.getWidgets()[0]
    const stream = saved.context.lookup(widget.getAppearances()?.normal)
    expect(stream).toBeInstanceOf(PDFRawStream)
    const operators = new TextDecoder().decode(decodePDFRawStream(stream as PDFRawStream).decode())
    const fontSize = Number(/([\d.]+) Tf/u.exec(operators)?.[1])
    expect(fontSize).toBeGreaterThanOrEqual(9)
    expect(fontSize).toBeLessThanOrEqual(18)
    const font = await saved.embedFont(StandardFonts.Helvetica)
    expect(font.widthOfTextAtSize(`${speed} ft`, fontSize)).toBeLessThan(
      widget.getRectangle().width - 2,
    )
  }, 30_000)

  test.each([
    [undefined, 1],
    ['Eldritch Knight', 2],
  ] as const)('adds a page only when the second class can cast (%s)', (subclass, count) => {
    const character = createEmptyCharacter({
      classProgression: [
        { name: 'Wizard', source: 'PHB', levels: 3 },
        {
          name: 'Fighter',
          source: 'PHB',
          levels: 3,
          subclass,
          subclassSource: subclass ? 'PHB' : undefined,
        },
      ],
    })
    const vm = createCharacterSheetViewModel(character, lookups)
    expect(getOfficial2014SpellPages(vm)).toHaveLength(count)
    expect(getOfficial2014SpellPages(vm).map((page) => page.detail?.className)).toEqual(
      count === 1 ? ['Wizard'] : ['Wizard', 'Fighter'],
    )
  })

  test('official 2014 saves independent editable pages for each caster, with separate preparation and slot pools', async () => {
    const character = createEmptyCharacter({
      name: 'Multiclass PDF Test',
      classProgression: [
        { name: 'Wizard', source: 'PHB', levels: 3 },
        { name: 'Cleric', source: 'PHB', levels: 3 },
        { name: 'Warlock', source: 'PHB', levels: 3 },
      ],
      abilityScores: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 18,
        wisdom: 16,
        charisma: 14,
      },
    })
    character.spells.spellProfiles = ['Wizard', 'Cleric', 'Warlock'].map((name) => ({
      id: `class:${name}|PHB`,
      type: 'class',
      label: name,
      className: name,
      classSource: 'PHB',
      cantrips: [],
      spellsKnown: ['Detect Magic|PHB'],
      preparedSpells: name === 'Wizard' ? ['Detect Magic|PHB'] : [],
    }))
    character.spells.spellProfiles.push({
      id: 'racial:Elf|PHB',
      type: 'racial',
      label: 'Elf',
      cantrips: ['Light|PHB'],
      spellsKnown: [],
      preparedSpells: [],
    })
    character.spells.spellSlots = { 1: { max: 99, used: 1 } }
    character.spells.pactSpellSlots = { 2: { max: 99, used: 1 } }
    const before = structuredClone(character)
    const vm = createCharacterSheetViewModel(character, lookups)
    const saved = await PDFDocument.load(await generateTestCharacterSheet(vm, '2014-official'))
    expect(saved.getPageCount()).toBe(5)
    const form = saved.getForm()
    const prefixes = ['', 'SpellPage2__', 'SpellPage3__']
    const expectedHeaders = ['Wizard', 'Cleric', 'Warlock (Pact Magic)']
    for (const [index, prefix] of prefixes.entries()) {
      expect(form.getTextField(`${prefix}Spellcasting Class 2`).getText()).toBe(
        expectedHeaders[index],
      )
      expect(form.getTextField(`${prefix}SpellcastingAbility 2`).getText()).toBe(
        ['Intelligence', 'Wisdom', 'Charisma'][index],
      )
      expect(form.getTextField(`${prefix}SpellSaveDC  2`).getText()).toBe(['16', '15', '14'][index])
      expect(form.getTextField(`${prefix}SpellAtkBonus 2`).getText()).toBe(
        ['+8', '+7', '+6'][index],
      )
      const spell = form.getTextField(`${prefix}${OFFICIAL_2014_SPELL_FIELDS_BY_LEVEL[1][0]}`)
      expect(spell.getText()).toBe('Detect Magic')
      expect(form.getCheckBox(`${prefix}Check Box 251`).isChecked()).toBe(index !== 1)
      expect(spell.acroField.getWidgets()[0].P()).toEqual(saved.getPage(index + 2).ref)
      expect(
        saved
          .getPage(index + 2)
          .node.Annots()
          ?.asArray(),
      ).toContainEqual(spell.ref)
      expect(spell.isReadOnly()).toBe(false)
      expect(form.getTextField(`${prefix}SlotsTotal 19`).getText() ?? '').toBe(index < 2 ? '4' : '')
      expect(form.getTextField(`${prefix}SlotsRemaining 19`).getText() ?? '').toBe(
        index < 2 ? '1' : '',
      )
      expect(form.getTextField(`${prefix}SlotsTotal 20`).getText()).toBe(index < 2 ? '3' : '2')
      expect(form.getTextField(`${prefix}SlotsRemaining 20`).getText()).toBe(index < 2 ? '0' : '1')
      expect(
        form.getTextField(`${prefix}${OFFICIAL_2014_SPELL_FIELDS_BY_LEVEL[0][0]}`).getText() ?? '',
      ).toBe(index === 0 ? 'Light' : '')
    }
    form
      .getTextField(`SpellPage2__${OFFICIAL_2014_SPELL_FIELDS_BY_LEVEL[1][0]}`)
      .setText('Edited Cleric spell')
    const reopened = (await PDFDocument.load(await saved.save())).getForm()
    expect(reopened.getTextField(OFFICIAL_2014_SPELL_FIELDS_BY_LEVEL[1][0]).getText()).toBe(
      'Detect Magic',
    )
    expect(
      reopened.getTextField(`SpellPage2__${OFFICIAL_2014_SPELL_FIELDS_BY_LEVEL[1][0]}`).getText(),
    ).toBe('Edited Cleric spell')
    expect(new Set(form.getFields().map((field) => field.getName())).size).toBe(
      form.getFields().length,
    )
    expect(
      getPdfExportPreflight('2014-official', vm, null, []).issues.some(
        (issue) => issue.id === 'unsupported:pact-slots',
      ),
    ).toBe(false)
    expect(character).toEqual(before)
  }, 30_000)

  test('official 2014 checks per-caster spell capacity instead of a combined list', () => {
    const vm = createCharacterSheetViewModel(
      createEmptyCharacter({
        classProgression: [
          { name: 'Wizard', source: 'PHB', levels: 3 },
          { name: 'Cleric', source: 'PHB', levels: 3 },
        ],
      }),
      lookups,
    )
    const row = {
      name: 'Spell',
      level: '1',
      prepared: true,
      castingTimeAndDuration: '',
      notes: '',
      concentration: false,
      ritual: false,
      material: false,
    }
    vm.spellcastingPages.forEach((page) => {
      page.spellRows = Array.from({ length: 10 }, () => ({ ...row }))
    })
    vm.spellRows = vm.spellcastingPages.flatMap((page) => page.spellRows)
    expect(
      getPdfExportPreflight('2014-official', vm, null, []).issues.some((issue) =>
        issue.id.startsWith('capacity:spells'),
      ),
    ).toBe(false)
    vm.spellcastingPages[1].spellRows.push(row, row, row)
    expect(getPdfExportPreflight('2014-official', vm, null, []).issues).toContainEqual(
      expect.objectContaining({
        id: 'capacity:spells-level-1-page-2',
        title: 'Cleric: Level 1 spells exceed this template',
      }),
    )
  })

  test('official 2014 uses portable dots for all checkbox states and retains inspiration X', async () => {
    const vm = createCharacterSheetViewModel(createEmptyCharacter({ inspiration: true }), lookups)
    const saved = await PDFDocument.load(
      await generateTestCharacterSheet(vm, '2014-official', {
        pages: { spells: true },
      }),
    )
    expect(saved.getPageCount()).toBe(3)
    expect(saved.getForm().getTextField('Inspiration').getText()).toBe('X')
    for (const field of saved.getForm().getFields()) {
      if (!(field instanceof PDFCheckBox)) continue
      for (const widget of field.acroField.getWidgets()) {
        const normal = widget.getAppearances()?.normal
        expect(normal).toBeInstanceOf(PDFDict)
        const onValue = field.acroField.getOnValue()
        expect(onValue).toBeDefined()
        const on = saved.context.lookup((normal as PDFDict).get(onValue!)) as PDFRawStream
        const off = saved.context.lookup((normal as PDFDict).get(PDFName.of('Off'))) as PDFRawStream
        const operators = new TextDecoder().decode(decodePDFRawStream(on).decode())
        expect(operators).toContain(' c\n')
        expect(operators).toContain('f\n')
        expect(operators).not.toContain('BT')
        expect(decodePDFRawStream(off).decode()).toHaveLength(0)
      }
    }
  }, 30_000)

  test('official 2014 embeds the selected custom organization image inside its page-two box', async () => {
    const character = createEmptyCharacter()
    character.details.organizationSelectionKey = '__custom__'
    character.details.organizationCustomImage = `data:image/png;base64,${readFileSync(join(process.cwd(), 'public/assets/images/ui/logo.png')).toString('base64')}`
    const vm = createCharacterSheetViewModel(character, lookups)
    expect(vm.organizationImage).toBe(character.details.organizationCustomImage)
    const saved = await PDFDocument.load(await generateTestCharacterSheet(vm, '2014-official'))
    const widget = saved.getForm().getButton('Faction Symbol Image').acroField.getWidgets()[0]
    expect(widget.P()).toEqual(saved.getPage(1).ref)
    expect(widget.getRectangle().width).toBe(0)
    const objects = saved.getPage(1).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict)
    expect(
      objects?.values().some((ref) => {
        const object = saved.context.lookup(ref)
        return (
          object instanceof PDFRawStream &&
          object.dict.get(PDFName.of('Subtype'))?.toString() === '/Image'
        )
      }),
    ).toBe(true)
  }, 30_000)

  test.each([
    ['PHB', 5, 4, 3, 2],
    ['XPHB', 5, 4, 3, 2],
    ['PHB', 1, 2, 0, 0],
  ] as const)('derives %s level %i slots without persisting maxima', (source, levels, first, second, third) => {
    const character = createEmptyCharacter({
      classProgression: [{ name: 'Wizard', source, levels }],
    })
    character.spells.spellSlots = { 1: { max: 99, used: 1 }, 2: { max: 99, used: 99 } }
    const before = structuredClone(character)
    const vm = createCharacterSheetViewModel(character, lookups)
    for (const id of ['2014-official', '2024-official', '2024-custom'] as const) {
      const fields = buildCharacterSheetFieldMap(vm, id)
      const names =
        id === '2014-official'
          ? ['SlotsTotal 19', 'SlotsTotal 20', 'SlotsTotal 21']
          : ['Text_220', 'Text_221', 'Text_222']
      expect(names.map((name) => fields.textFields[name])).toEqual(
        [first, second, third].map((n) => (n ? String(n) : '')),
      )
      if (id === '2014-official') {
        expect(fields.textFields['SlotsRemaining 19']).toBe('1')
        expect(fields.textFields['SlotsRemaining 20']).toBe(second ? String(second) : '')
      } else {
        expect(fields.checkboxFields.Checkbox_37).toBe(true)
        expect(fields.checkboxFields.Checkbox_38).toBe(false)
      }
    }
    expect(character).toEqual(before)
  })

  test('fresh characters derive slots and mixed casters keep Pact Magic separate', () => {
    const character = createEmptyCharacter({
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 5 }],
    })
    expect(
      buildCharacterSheetFieldMap(
        createCharacterSheetViewModel(character, lookups),
        '2014-official',
      ).textFields['SlotsTotal 21'],
    ).toBe('2')
    character.classProgression = [
      { name: 'Wizard', source: 'PHB', levels: 3 },
      { name: 'Warlock', source: 'PHB', levels: 3 },
    ]
    character.spells.pactSpellSlots = { 2: { max: 99, used: 1 } }
    const vm = createCharacterSheetViewModel(character, lookups)
    expect(vm.spellSlots.mergedPactWithUsage[2]).toMatchObject({ max: 2, used: 1 })
    expect(buildCharacterSheetFieldMap(vm, '2024-official').textFields.Text_221).toBe('2')
    expect(getPdfExportPreflight('2024-official', vm, null, []).issues).toContainEqual(
      expect.objectContaining({
        id: 'unsupported:pact-slots',
        detail: expect.stringContaining('2 total, 1 expended'),
      }),
    )
  })

  test('keeps prepared and always-prepared spells source-qualified and warns per level', () => {
    const known = [
      'Alarm',
      'Burning Hands',
      'Charm Person',
      'Color Spray',
      'Comprehend Languages',
      'Detect Magic',
      'Disguise Self',
      'Expeditious Retreat',
      'False Life',
      'Feather Fall',
      'Find Familiar',
      'Fog Cloud',
      'Grease',
    ].map((name) => `${name}|PHB`)
    const character = createEmptyCharacter({
      classProgression: [{ name: 'Wizard', source: 'PHB', levels: 10 }],
    })
    character.spells.spellProfiles = [
      {
        id: 'class:Wizard|PHB',
        type: 'class',
        label: 'Wizard',
        className: 'Wizard',
        classSource: 'PHB',
        cantrips: [],
        spellsKnown: [...known, 'Alarm|XPHB'],
        preparedSpells: ['Alarm | PHB'],
        alwaysPreparedSpells: [known[1]],
      },
    ]
    const vm = createCharacterSheetViewModel(character, lookups)
    expect(vm.spellRows.filter((row) => row.name === 'Alarm').map((row) => row.prepared)).toEqual([
      true,
      false,
    ])
    expect(vm.spellRows.find((row) => row.name === 'Burning Hands')?.prepared).toBe(true)
    expect(vm.spellRows.find((row) => row.name === 'Charm Person')?.prepared).toBe(false)
    const map = buildCharacterSheetFieldMap(vm, '2014-official')
    expect(map.checkboxFields['Check Box 251']).toBe(true)
    expect(map.checkboxFields['Check Box 309']).toBe(false)
    expect(getPdfExportPreflight('2014-official', vm, null, []).issues).toContainEqual(
      expect.objectContaining({
        id: 'capacity:spells-level-1',
        detail: expect.stringContaining('room for 12'),
      }),
    )
  })

  test('every prepared circle is checked beside its actual saved spell row', async () => {
    const vm = createCharacterSheetViewModel(createEmptyCharacter(), lookups)
    vm.spellRows = OFFICIAL_2014_SPELL_FIELDS_BY_LEVEL.flatMap((fields, level) =>
      fields.map((_, index) => ({
        name: `Spell ${level}-${index}`,
        level: level ? String(level) : 'C',
        prepared: index % 2 === 0,
        castingTimeAndDuration: '',
        notes: '',
        concentration: false,
        ritual: false,
        material: false,
      })),
    )
    const saved = await PDFDocument.load(await generateTestCharacterSheet(vm, '2014-official'))
    const form = saved.getForm()
    const circles = form.getFields().filter((field) => field instanceof PDFCheckBox)
    OFFICIAL_2014_SPELL_FIELDS_BY_LEVEL.forEach((fields, level) => {
      fields.forEach((name, index) => {
        const field = form.getTextField(name)
        expect(field.getText()).toBe(`Spell ${level}-${index}`)
        if (!level) return
        const rect = field.acroField.getWidgets()[0].getRectangle()
        const circle = circles.find((checkbox) => {
          const box = checkbox.acroField.getWidgets()[0].getRectangle()
          return (
            Math.abs(box.y + box.height / 2 - rect.y - rect.height / 2) < 4 &&
            box.x < rect.x &&
            rect.x - box.x < 20
          )
        })
        expect(circle?.isChecked()).toBe(index % 2 === 0)
      })
    })
  }, 30_000)

  test.each([
    '2014-official',
    '2024-official',
  ] as const)('%s preserves visible weapon damage in the saved appearance', async (id) => {
    const vm = createCharacterSheetViewModel(createEmptyCharacter(), lookups)
    vm.weaponRows = [
      {
        name: 'Longsword',
        attackBonus: '+3',
        damage: '1d8 + 1',
        damageType: 'Slashing',
        range: '',
        notes: 'V, Versatile 1d10',
        description: '',
      },
    ]
    const map = buildCharacterSheetFieldMap(vm, id)
    const name = id === '2014-official' ? 'Wpn1 Damage' : 'Text_76'
    const expected = id === '2014-official' ? '1d8 + 1 Slash.' : '1d6 + 1 Bludgeoning'
    if (id === '2014-official')
      expect(map.textFields.AttacksSpellcasting).toContain('Slashing; V, Versatile 1d10')
    map.textFields[name] = expected
    const truncated: string[] = []
    const saved = await PDFDocument.load(
      await fillCharacterSheetPdf(templateBytes(id), map, {
        templateId: id,
        onTextTruncated: (field) => truncated.push(field),
      }),
    )
    const field = saved.getForm().getTextField(name)
    expect(field.getText()).toBe(expected)
    expect(truncated).not.toContain(name)
    const widget = field.acroField.getWidgets()[0]
    const stream = saved.context.lookup(widget.getAppearances()?.normal)
    expect(stream).toBeInstanceOf(PDFRawStream)
    const operators = new TextDecoder().decode(decodePDFRawStream(stream as PDFRawStream).decode())
    const sizes = [...operators.matchAll(/([\d.]+) Tf/g)].map((match) => Number(match[1]))
    const font = await saved.embedFont(StandardFonts.Helvetica)
    const rect = widget.getRectangle()
    expect(font.widthOfTextAtSize(expected, sizes[0])).toBeLessThan(
      rect.width - 2 * (1 + (widget.getBorderStyle()?.getWidth() ?? 0)),
    )
    const baselines = [...operators.matchAll(/1 0 0 1 [\d.-]+ ([\d.-]+) Tm/g)].map((match) =>
      Number(match[1]),
    )
    expect(baselines).toHaveLength(1)
    expect(baselines[0]).toBeGreaterThanOrEqual(0)
    expect(field.acroField.dict.has(PDFName.of('V'))).toBe(true)
  }, 30_000)

  test('reports actual short multiline truncation and clears it for a fitting export', async () => {
    const vm = createCharacterSheetViewModel(createEmptyCharacter(), lookups)
    vm.historyAndPersonalitySummary = Array.from({ length: 20 }, (_, i) => `Journey ${i + 1}`).join(
      '\n',
    )
    const shortened: string[] = []
    const saved = await PDFDocument.load(
      await generateTestCharacterSheet(vm, '2024-official', {
        onTextTruncated: (field) => shortened.push(field),
      }),
    )
    expect(saved.getForm().getTextField('Text_89').getText()).toMatch(/\.\.\.$/)
    expect(shortened).toContain('Text_89')
    expect(
      getPdfExportPreflight('2024-official', vm, null, [], {}, shortened).issues,
    ).toContainEqual(expect.objectContaining({ id: 'text-limit:Text_89' }))
    vm.historyAndPersonalitySummary = 'A short journey.'
    expect(
      getPdfExportPreflight('2024-official', vm, null, []).issues.some(
        (issue) => issue.id === 'text-limit:Text_89',
      ),
    ).toBe(false)
  }, 30_000)
})
