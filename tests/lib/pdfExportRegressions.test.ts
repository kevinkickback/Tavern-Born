import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  decodePDFRawStream,
  PDFCheckBox,
  PDFDocument,
  PDFName,
  PDFRawStream,
  StandardFonts,
} from '@cantoo/pdf-lib'
import { describe, expect, test } from 'vitest'
import { buildClassLookup, buildSpellLookup } from '@/lib/5etools/lookups'
import { parseClasses, parseSpells } from '@/lib/5etools/parsers'
import { createEmptyCharacter } from '@/lib/character/createCharacter'
import { OFFICIAL_2014_SPELL_FIELDS_BY_LEVEL } from '@/lib/pdf/characterSheetMapping2014Official'
import {
  buildCharacterSheetFieldMap,
  createCharacterSheetViewModel,
  generateFilledCharacterSheetPdf,
  getCharacterSheetTemplate,
} from '@/lib/pdf/characterSheetPdf'
import { getPdfExportPreflight } from '@/lib/pdf/exportPreflight'
import { fillCharacterSheetPdf } from '@/lib/pdf/pdfFormAdapter'
import type { CharacterSheetTemplateId } from '@/lib/pdf/types'
import type { Class5e, Spell5e } from '@/types/5etools'

const json = (path: string) => JSON.parse(readFileSync(join(process.cwd(), path), 'utf8'))
const classes = ['wizard', 'warlock', 'fighter'].flatMap((name) =>
  parseClasses(json(`data/class/class-${name}.json`)),
)
const spells = ['phb', 'xphb'].flatMap((name) =>
  parseSpells(json(`data/spells/spells-${name}.json`)),
)
const lookups = {
  classesByKey: buildClassLookup(classes as Class5e[]),
  spellsByKey: buildSpellLookup(spells as Spell5e[]),
}
const templateBytes = (id: CharacterSheetTemplateId) =>
  readFileSync(join(process.cwd(), 'public', getCharacterSheetTemplate(id).assetPath))

describe('PDF export review regressions', () => {
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
    const saved = await PDFDocument.load(
      await generateFilledCharacterSheetPdf(vm, templateBytes('2014-official'), '2014-official'),
    )
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
      await generateFilledCharacterSheetPdf(vm, templateBytes('2024-official'), '2024-official', {
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
